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

// --- Tipos espelhados do contrato definido em ws_events.py -----------------

export type PerformanceCategory = "BOM" | "MEDIO" | "MAU" | "SEM_DADOS";

export type KartState = "EM_PISTA" | "DROP_OFF" | "EM_FILA" | "SORTEADO" | "FORA_DE_SERVICO";

export interface KartDTO {
  id: string;
  label: string;
  state: KartState;
  equipa_atual: string | null;
  fila_id: string | null;
  ultima_categoria: PerformanceCategory;
  ultimo_tempo_seconds: number | null;
  notas: string;
  rating_manual: number | null;
}

export interface EquipaDTO {
  numero_equipa: string;
  nome: string;
  kart_atual_id: string | null;
  ultimo_tempo_seconds: number | null;
  ultima_categoria: PerformanceCategory;
  total_voltas: number;
  melhor_tempo_seconds: number | null;
}

export interface FilaDTO {
  fila_id: string;
  nome: string;
  cor: string; // cor livre (hex, ex: "#dc2626")
  kart_ids: string[];
  tamanho: number;
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
      const ws = new WebSocket(url!);
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

    connect();

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
    case "KART_RATING_MANUAL_DEFINIDO": {
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
    default:
      break;
  }

  return next;
}

// --- Ações do staff (REST) ----------------------------------------------

async function postJson(path: string, body: unknown): Promise<void> {
  const base = backendHttpUrl();
  if (!base) throw new Error("VITE_KART_BACKEND_HTTP_URL não configurado.");
  const res = await fetch(`${base}${path}`, {
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
  const res = await fetch(`${base}${path}`, {
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
  const res = await fetch(`${base}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || `Falha ao chamar ${path}`);
  }
}

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
    (kartId: string, filaId: string) =>
      postJson("/staff/adicionar_a_fila_manual", { kart_id: kartId, fila_id: filaId }),
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
  };
}

// --- Ratings e previsão (polling REST — derivados, não eventos push) ----

async function getJson<T>(path: string): Promise<T> {
  const base = backendHttpUrl();
  if (!base) throw new Error("VITE_KART_BACKEND_HTTP_URL não configurado.");
  const res = await fetch(`${base}${path}`);
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
}

export function useStartDemo() {
  return useCallback((params: DemoStartParams) => postJson("/demo/start", params), []);
}

export function useStopDemo() {
  return useCallback(() => postJson("/demo/stop", {}), []);
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
