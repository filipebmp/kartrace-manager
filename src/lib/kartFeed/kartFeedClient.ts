/**
 * kartFeedClient.ts
 * ==================
 * Cliente partilhado que liga esta app ao backend Python (`kart-endurance/`)
 * responsável por processar a telemetria do Live Timing e gerir as filas de
 * sorteio. Usado por DOIS módulos diferentes desta app:
 *
 *   1. `useKartRating` (KartsPanel) — classificação automática do kart
 *      atualmente atribuído à nossa equipa, a partir do "Last lap" real.
 *   2. `StaffQueuePanel` (rota /staff-queue) — gestão do sorteio de karts
 *      entre todas as equipas (Fila de Espera, Vermelha, Azul).
 *
 * Não depende do Supabase: fala diretamente com o backend Python por
 * WebSocket (leitura em tempo real) e REST (ações do staff). Isto mantém a
 * lógica de negócio (máquina de estados, idempotência, filas) num único
 * sítio — não é reimplementada aqui.
 *
 * Configuração via variáveis de ambiente (Vite):
 *   VITE_KART_BACKEND_WS_URL   ex: "ws://localhost:8000/ws"
 *   VITE_KART_BACKEND_HTTP_URL ex: "http://localhost:8000"
 *
 * Se não estiverem definidas, o cliente fica inativo (não tenta ligar) —
 * as duas páginas que o usam devem lidar bem com "sem dados ao vivo" sem
 * rebentar, já que nem toda a gente vai ter este backend a correr sempre.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// --- Tipos espelhados do contrato definido em ws_events.py -----------------

export type PerformanceCategory = "BOM" | "MEDIO" | "MAU" | "SEM_DADOS";

export type KartState = "EM_PISTA" | "DROP_OFF" | "EM_FILA" | "SORTEADO" | "FORA_DE_SERVICO";

export interface KartDTO {
  id: string;
  label: string;
  state: KartState;
  equipa_atual: string | null;
  ultima_equipa_id: string | null; // última equipa que teve este kart —
  // NUNCA se limpa, ao contrário de
  // equipa_atual (só preenchido enquanto
  // EM_PISTA/SORTEADO)
  fila_id: string | null;
  ultima_categoria: PerformanceCategory;
  ultimo_tempo_seconds: number | null;
  notas: string;
  rating_manual: number | null; // override manual (1-5) do staff — o
  // rating é do kart físico (chassis/pneus/
  // afinações), não de quem o conduz
  stint_started_at: string | null; // quando entrou EM_PISTA neste turno —
  // null se não estiver em pista; usado
  // para calcular "Em Pista" ao vivo
}

export interface EquipaDTO {
  numero_equipa: string;
  nome: string;
  kart_atual_id: string | null;
  posicao: number | null;
  ultimo_tempo_seconds: number | null;
  ultima_categoria: PerformanceCategory;
  total_voltas: number;
  melhor_tempo_seconds: number | null;
  total_pits: number;
}

export interface FilaDTO {
  fila_id: string;
  nome: string;
  cor: string; // cor livre (hex, ex: "#dc2626")
  kart_ids: string[];
  tamanho: number;
  capacidade: number | null; // null = sem limite (∞)
  // Sequência visual (Saída→Entrada) com `null` nos buracos deixados por
  // "Rating Desconhecido" — os restantes karts NÃO avançam para tapar o
  // buraco. Não inclui a capacidade ainda por preencher (essa continua a
  // ser `capacidade - slots_visuais.length`, tal como sempre foi).
  slots_visuais: (string | null)[];
}

export interface KartRatingDTO {
  kart_id: string;
  grade: number | null;
  confianca: "sem_dados" | "automatica" | "manual";
  media_melhores_voltas_seconds: number | null;
  amostras_usadas: number;
  total_voltas_turno: number;
}

export interface PrevisaoEntryDTO {
  kart_id: string;
  status: "disponivel_agora" | "em_pista";
  minutos_ate_disponivel: number;
  grade: number | null;
  confianca_tempo: "baixa" | "media" | "alta";
}

export type TeamSkillTier = "TOPO" | "MEDIA" | "DESCONHECIDA";

export interface EquipaParaClassificarDTO {
  numero_equipa: string;
  nome: string;
  melhor_tempo_seconds: number | null;
  total_voltas: number;
  tier_atual: TeamSkillTier | null;
}

export interface LiveTimingStatusDTO {
  connected: boolean;
  event_url: string | null;
  ws_url: string | null;
  detail: string | null;
  updated_at: string | null;
}

export interface KartFeedSnapshot {
  karts: Record<string, KartDTO>;
  equipas: Record<string, EquipaDTO>;
  fila_espera: string[];
  filas: FilaDTO[];
  thresholds: { bom_max_seconds: number; medio_max_seconds: number };
  last_event_seq: number;
}

interface WsFrame {
  type: string;
  seq: number;
  timestamp: string;
  payload: unknown;
}

// --- Configuração ------------------------------------------------------

function backendWsUrl(): string | null {
  const v = import.meta.env["VITE_KART_BACKEND_WS_URL"] as string | undefined;
  return v && v.trim().length > 0 ? v : null;
}

export function backendHttpUrl(): string | null {
  const v = import.meta.env["VITE_KART_BACKEND_HTTP_URL"] as string | undefined;
  return v && v.trim().length > 0 ? v.replace(/\/$/, "") : null;
}

let currentRaceId: string | null = null;

let resolveRaceIdReady: () => void;
const raceIdReady: Promise<void> = new Promise((resolve) => {
  resolveRaceIdReady = resolve;
});

void supabase.auth.getUser().then(({ data }) => {
  currentRaceId = data.user?.id ?? null;
  resolveRaceIdReady();
});
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
    currentRaceId = session?.user?.id ?? null;
  }
});

function comRaceId(url: string): string {
  if (!currentRaceId) return url;
  const separador = url.includes("?") ? "&" : "?";
  return `${url}${separador}race_id=${encodeURIComponent(currentRaceId)}`;
}

// --- Hook principal: liga ao WS, mantém snapshot atualizado -------------

export type KartFeedStatus = "disabled" | "connecting" | "online" | "offline";

export function useKartFeed() {
  const [snapshot, setSnapshot] = useState<KartFeedSnapshot | null>(null);
  const [status, setStatus] = useState<KartFeedStatus>("disabled");
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeqRef = useRef<number | null>(null);

  useEffect(() => {
    const url = backendWsUrl();
    if (!url) {
      setStatus("disabled");
      return;
    }

    let cancelled = false;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");
      const ws = new WebSocket(comRaceId(url!));
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setStatus("online");
      };

      ws.onmessage = (ev) => {
        if (cancelled) return;
        let frame: WsFrame;
        try {
          frame = JSON.parse(ev.data as string) as WsFrame;
        } catch {
          return;
        }

        if (frame.type === "SNAPSHOT") {
          setSnapshot(frame.payload as KartFeedSnapshot);
          lastSeqRef.current = frame.seq;
          return;
        }

        // Deteção de gap: se perdemos eventos, pedimos snapshot reabrindo a ligação.
        if (lastSeqRef.current !== null && frame.seq !== lastSeqRef.current + 1) {
          console.warn(
            `[kartFeed] Gap de eventos detetado: esperava seq ${lastSeqRef.current + 1}, ` +
              `recebi ${frame.seq}. A reconectar (pede snapshot novo).`,
          );
          toast.warning("Ligação perdeu eventos — a atualizar...", { duration: 2500 });
          ws.close();
          return;
        }
        lastSeqRef.current = frame.seq;

        setSnapshot((prev) => applyIncrementalEvent(prev, frame));
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus("offline");
        wsRef.current = null;
        // Reconexão simples com atraso fixo — suficiente para uma box com
        // wifi instável; não há necessidade de backoff exponencial aqui.
        retryRef.current = setTimeout(connect, 1500);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    void raceIdReady.then(connect);

    return () => {
      cancelled = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, []);

  return { snapshot, status };
}

/** Aplica um evento incremental ao snapshot local, sem esperar pelo backend
 * reenviar tudo — mantém a UI reativa entre snapshots completos. */
function applyIncrementalEvent(
  prev: KartFeedSnapshot | null,
  frame: WsFrame,
): KartFeedSnapshot | null {
  if (!prev) return prev; // sem snapshot inicial ainda, ignora incrementais
  const next: KartFeedSnapshot = {
    ...prev,
    karts: { ...prev.karts },
    equipas: { ...prev.equipas },
    fila_espera: [...prev.fila_espera],
    filas: prev.filas.map((f) => ({ ...f, kart_ids: [...f.kart_ids] })),
    last_event_seq: frame.seq,
  };

  const payload = frame.payload as Record<string, unknown>;

  function substituirFila(fila: FilaDTO) {
    const idx = next.filas.findIndex((f) => f.fila_id === fila.fila_id);
    if (idx >= 0) next.filas[idx] = fila;
    else next.filas.push(fila);
  }

  switch (frame.type) {
    case "LAP_UPDATE": {
      const equipa = payload["equipa"] as EquipaDTO;
      next.equipas[equipa.numero_equipa] = equipa;
      break;
    }
    case "KART_DROP_OFF":
    case "KART_TRIADO":
    case "KART_SORTEADO":
    case "KART_EM_PISTA":
    case "KART_FORA_DE_SERVICO":
    case "KART_REINTEGRADO":
    case "KART_RENOMEADO":
    case "KART_MOVIDO":
    case "PARAGEM_MANUAL_REGISTADA":
    case "KART_ADICIONADO_MANUALMENTE":
    case "KART_RETIRADO_DA_FILA": {
      if (payload["kart"]) {
        const kart = payload["kart"] as KartDTO;
        next.karts[kart.id] = kart;
      }
      if (Array.isArray(payload["fila_espera"])) {
        next.fila_espera = payload["fila_espera"] as string[];
      }
      if (Array.isArray(payload["filas"])) {
        next.filas = payload["filas"] as FilaDTO[];
      }
      if (payload["fila_atualizada"]) {
        substituirFila(payload["fila_atualizada"] as FilaDTO);
      }
      break;
    }
    case "KART_REMOVIDO": {
      const kartId = payload["kart_id"] as string;
      delete next.karts[kartId];
      next.fila_espera = next.fila_espera.filter((id) => id !== kartId);
      next.filas = next.filas.map((f) => ({
        ...f,
        kart_ids: f.kart_ids.filter((id) => id !== kartId),
      }));
      break;
    }
    case "KART_RATING_MANUAL_DEFINIDO": {
      const kartId = payload["kart_id"] as string;
      const grade = payload["grade"] as number | null;
      const kart = next.karts[kartId];
      if (kart) {
        next.karts[kartId] = { ...kart, rating_manual: grade };
      }
      break;
    }
    case "FILA_CRIADA": {
      const fila = payload["fila"] as FilaDTO;
      if (!next.filas.some((f) => f.fila_id === fila.fila_id)) {
        next.filas.push(fila);
      }
      break;
    }
    case "FILA_REMOVIDA": {
      const filaId = payload["fila_id"] as string;
      next.filas = next.filas.filter((f) => f.fila_id !== filaId);
      break;
    }
    case "FILA_CAPACIDADE_ALTERADA": {
      const filaId = payload["fila_id"] as string;
      const capacidade = payload["capacidade"] as number | null;
      next.filas = next.filas.map((f) => (f.fila_id === filaId ? { ...f, capacidade } : f));
      break;
    }
    case "FILAS_RECRIADAS": {
      if (Array.isArray(payload["filas"])) {
        next.filas = payload["filas"] as FilaDTO[];
      }
      break;
    }
    case "DADOS_SESSAO_RESET": {
      const prefixo = payload["prefixo"] as string;
      const novasEquipas: typeof next.equipas = {};
      for (const [id, eq] of Object.entries(next.equipas)) {
        if (!id.startsWith(prefixo)) novasEquipas[id] = eq;
      }
      next.equipas = novasEquipas;

      const novosKarts: typeof next.karts = {};
      for (const [id, k] of Object.entries(next.karts)) {
        if (!id.startsWith(prefixo)) novosKarts[id] = k;
      }
      next.karts = novosKarts;
      next.fila_espera = next.fila_espera.filter((id) => !id.startsWith(prefixo));
      break;
    }
    default:
      break;
  }

  return next;
}

// --- Ações do staff (REST) ----------------------------------------------

async function postJson(path: string, body: unknown): Promise<void> {
  const base = backendHttpUrl();
  if (!base) throw new Error("VITE_KART_BACKEND_HTTP_URL não configurado.");
  const res = await fetch(comRaceId(`${base}${path}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Falha ao chamar ${path}`);
  }
}

async function postJsonWithResponse<T>(path: string, body: unknown): Promise<T> {
  const base = backendHttpUrl();
  if (!base) throw new Error("VITE_KART_BACKEND_HTTP_URL não configurado.");
  const res = await fetch(comRaceId(`${base}${path}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Falha ao chamar ${path}`);
  }
  return res.json() as Promise<T>;
}

async function deleteRequest(path: string): Promise<void> {
  const base = backendHttpUrl();
  if (!base) throw new Error("VITE_KART_BACKEND_HTTP_URL não configurado.");
  const res = await fetch(comRaceId(`${base}${path}`), { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Falha ao chamar ${path}`);
  }
}

export type AdicionarAFilaResultado =
  { status: "ok" } | { status: "precisa_confirmacao"; localizacaoAtual: string };

export function useKartFeedActions() {
  const triarKart = useCallback(
    (kartId: string, filaId: string) =>
      postJson("/staff/triar", { kart_id: kartId, fila_id: filaId }),
    [],
  );

  const sortearKart = useCallback(
    (filaId: string, numeroEquipa: string, kartId?: string) =>
      postJson("/staff/sortear", {
        fila_id: filaId,
        numero_equipa: numeroEquipa,
        kart_id: kartId ?? null,
      }),
    [],
  );

  const marcarForaDeServico = useCallback(
    (kartId: string, motivo: string) =>
      postJson("/staff/fora_de_servico", { kart_id: kartId, motivo }),
    [],
  );

  const reintegrarKart = useCallback(
    (kartId: string, destino: "fila_espera" | "fila", filaId?: string) =>
      postJson("/staff/reintegrar", { kart_id: kartId, destino, fila_id: filaId ?? null }),
    [],
  );

  const confirmarPitout = useCallback(
    (kartId: string) => postJson("/staff/pitout", { kart_id: kartId }),
    [],
  );

  const criarFila = useCallback(
    (nome: string, cor: string) =>
      postJsonWithResponse<{ fila_id: string }>("/staff/filas", { nome, cor }),
    [],
  );

  const removerFila = useCallback(
    (filaId: string) => deleteRequest(`/staff/filas/${encodeURIComponent(filaId)}`),
    [],
  );

  const renomearKart = useCallback(
    (kartId: string, label: string) =>
      postJson(`/staff/karts/${encodeURIComponent(kartId)}/renomear`, { label }),
    [],
  );

  const definirRatingManual = useCallback(
    (kartId: string, grade: number | null) =>
      postJson(`/staff/karts/${encodeURIComponent(kartId)}/rating_manual`, { grade }),
    [],
  );

  const removerKart = useCallback(
    (kartId: string) => deleteRequest(`/staff/karts/${encodeURIComponent(kartId)}`),
    [],
  );

  const retirarDaFila = useCallback(
    (kartId: string) => postJson("/staff/retirar_da_fila", { kart_id: kartId }),
    [],
  );

  const adicionarAFilaManual = useCallback(
    async (
      kartId: string,
      filaId: string,
      confirmarRealocar = false,
    ): Promise<AdicionarAFilaResultado> => {
      const base = backendHttpUrl();
      if (!base) throw new Error("VITE_KART_BACKEND_HTTP_URL não configurado.");
      const res = await fetch(comRaceId(`${base}/staff/adicionar_a_fila_manual`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kart_id: kartId,
          fila_id: filaId,
          confirmar_realocar: confirmarRealocar,
        }),
      });
      if (res.ok) return { status: "ok" };
      const corpo = await res.json().catch(() => null);
      if (corpo?.requer_confirmacao) {
        return { status: "precisa_confirmacao", localizacaoAtual: corpo.localizacao_atual };
      }
      throw new Error(corpo?.detail || res.statusText || "Não foi possível adicionar o kart.");
    },
    [],
  );

  const moverKart = useCallback(
    (kartId: string, filaDestinoId: string, novaPosicao?: number) =>
      postJson("/staff/mover_kart", {
        kart_id: kartId,
        fila_destino_id: filaDestinoId,
        nova_posicao: novaPosicao ?? null,
      }),
    [],
  );

  const registarParagemManual = useCallback(
    (kartId: string, filaDestinoId: string | null) =>
      postJson("/staff/paragem_manual", { kart_id: kartId, fila_destino_id: filaDestinoId }),
    [],
  );

  const definirCapacidadeFila = useCallback(
    (filaId: string, capacidade: number | null) =>
      postJsonWithResponse<{ fila: FilaDTO }>(
        `/staff/filas/${encodeURIComponent(filaId)}/capacidade`,
        { capacidade },
      ),
    [],
  );

  return {
    triarKart,
    sortearKart,
    marcarForaDeServico,
    reintegrarKart,
    confirmarPitout,
    criarFila,
    removerFila,
    renomearKart,
    definirRatingManual,
    removerKart,
    retirarDaFila,
    adicionarAFilaManual,
    moverKart,
    registarParagemManual,
    definirCapacidadeFila,
  };
}

// --- Ratings e previsão (polling REST — derivados, não eventos push) ----

async function getJson<T>(path: string): Promise<T> {
  const base = backendHttpUrl();
  if (!base) throw new Error("VITE_KART_BACKEND_HTTP_URL não configurado.");
  const res = await fetch(comRaceId(`${base}${path}`));
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Falha ao chamar ${path}`);
  }
  return res.json() as Promise<T>;
}

/** Faz polling a um endpoint REST a um intervalo fixo, enquanto o
 * componente que usa o hook estiver montado. Usado para dados derivados
 * (ratings, previsão) que não vêm como eventos push pelo WebSocket —
 * evita recalcular/duplicar essa lógica em TypeScript. */
function usePolledEndpoint<T>(path: string, intervalMs: number, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function fetchOnce() {
      try {
        const result = await getJson<T>(path);
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    fetchOnce();
    const interval = setInterval(fetchOnce, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [path, intervalMs, enabled]);

  return { data, error };
}

export function useKartRatings(enabled = true) {
  return usePolledEndpoint<Record<string, KartRatingDTO>>("/karts/ratings", 5000, enabled);
}

export interface VoltaTurnoDTO {
  numero: number;
  tempo_seconds: number;
  out_lap: boolean;
  grade: number | null;
}

export interface HistoricoTurnoKartDTO {
  kart_id: string;
  label: string;
  equipa_atual: string | null;
  ultima_equipa_id: string | null;
  state: KartState;
  stint_started_at: string | null;
  voltas: VoltaTurnoDTO[];
  melhor_tempo_seconds: number | null;
  media_melhores_voltas_seconds: number | null;
  grade: number | null;
  grade_manual: number | null;
  amostras_usadas: number;
  total_voltas_turno: number;
}

/** Poll enquanto o diálogo de detalhe do kart estiver aberto — passa
 * `kartId: null` para desligar (ex.: diálogo fechado). */
export function useKartTurnoAtual(kartId: string | null) {
  return usePolledEndpoint<HistoricoTurnoKartDTO>(
    kartId ? `/karts/${encodeURIComponent(kartId)}/turno_atual` : "",
    3000,
    kartId !== null,
  );
}

export function useKartForecast(enabled = true) {
  return usePolledEndpoint<PrevisaoEntryDTO[]>("/karts/previsao", 5000, enabled);
}

export function useEquipasParaClassificar(enabled = true) {
  return usePolledEndpoint<EquipaParaClassificarDTO[]>("/staff/equipas", 4000, enabled);
}

export function useDefinirEquipaTier() {
  return useCallback(
    (numeroEquipa: string, tier: TeamSkillTier | null) =>
      postJson("/staff/equipa_tier", { numero_equipa: numeroEquipa, tier }),
    [],
  );
}

// --- Configurações — Tempos Alvo (rating) e Box (filas) --------------------

export interface RatingTierDTO {
  grade: number;
  min_seconds: number;
  max_seconds: number;
}

export interface RatingConfigDTO {
  tiers: RatingTierDTO[];
  best_n_laps: number;
}

export function useRatingConfig() {
  return usePolledEndpoint<RatingConfigDTO>("/config/rating", 10000, true);
}

export function useSetRatingTiers() {
  return useCallback(
    (tiers: RatingTierDTO[]) =>
      postJsonWithResponse<RatingConfigDTO>("/config/rating/tiers", { tiers }),
    [],
  );
}

export function useSetRatingBestNLaps() {
  return useCallback(
    (n: number) => postJsonWithResponse<RatingConfigDTO>("/config/rating/best_n_laps", { n }),
    [],
  );
}

export interface BoxConfigDTO {
  numero_filas_padrao: number;
}

export function useBoxConfig() {
  return usePolledEndpoint<BoxConfigDTO>("/config/box", 10000, true);
}

export function useSetNumeroFilasPadrao() {
  return useCallback(
    (n: number) => postJsonWithResponse<BoxConfigDTO>("/config/box/numero_filas_padrao", { n }),
    [],
  );
}

export function useAplicarNumeroFilasPadrao() {
  return useCallback(
    () => postJsonWithResponse<{ filas: FilaDTO[] }>("/config/box/aplicar_numero_filas_padrao", {}),
    [],
  );
}

// --- Corrida de demonstração embutida --------------------------------------

export interface DemoStatusDTO {
  running: boolean;
}

export function useDemoStatus(enabled = true) {
  return usePolledEndpoint<DemoStatusDTO>("/demo/status", 3000, enabled);
}

export interface DemoStartParams {
  speed: number;
  leader_pace: number;
  field_spread: number;
  stint_minutes: number;
  manual: boolean;
  num_teams: number;
}

export interface DemoStopResultDTO {
  status: string;
  limpeza: {
    prefixo: string;
    equipas_removidas: number;
    karts_removidos: number;
    equipas_com_historico_de_turnos_removido: number;
  };
}

export function useStartDemo() {
  return useCallback((params: DemoStartParams) => postJson("/demo/start", params), []);
}

export function useStopDemo() {
  return useCallback(() => postJsonWithResponse<DemoStopResultDTO>("/demo/stop", {}), []);
}

// --- Alvo de Live Timing ligável em runtime -------------------------------

export function useLiveTimingStatus(enabled = true) {
  return usePolledEndpoint<LiveTimingStatusDTO>("/admin/live_timing_status", 3000, enabled);
}

export function useSetLiveTimingTarget() {
  return useCallback(
    (eventUrl: string) => postJson("/admin/live_timing_target", { event_url: eventUrl }),
    [],
  );
}

export function useDisconnectLiveTimingTarget() {
  return useCallback(() => postJson("/admin/live_timing_target/disconnect", {}), []);
}

export function useResetSessionData() {
  return useCallback(
    (prefixo = "r") =>
      postJsonWithResponse<{
        equipas_removidas: number;
        karts_removidos: number;
      }>("/admin/reset_session_data", { prefixo }),
    [],
  );
}


export interface MapeamentoColunasDTO {
  detetado: Record<string, string>;
  manual: Record<string, string>;
  efetivo: Record<string, string>;
}

export function useMapeamentoColunas(enabled = true) {
  return usePolledEndpoint<MapeamentoColunasDTO>("/admin/mapeamento_colunas", 5000, enabled);
}

export function useSetMapeamentoColunas() {
  return useCallback(
    (mapeamento: Record<string, string | null>) =>
      postJsonWithResponse<MapeamentoColunasDTO>("/admin/mapeamento_colunas", { mapeamento }),
    [],
  );
}
