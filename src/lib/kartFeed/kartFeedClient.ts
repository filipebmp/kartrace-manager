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

export type KartState =
  "EM_PISTA" | "DROP_OFF" | "FILA_VERMELHA" | "FILA_AZUL" | "SORTEADO" | "FORA_DE_SERVICO";

export interface KartDTO {
  id: string;
  label: string;
  state: KartState;
  equipa_atual: string | null;
  fila_cor: "VERMELHA" | "AZUL" | null;
  ultima_categoria: PerformanceCategory;
  ultimo_tempo_seconds: number | null;
  notas: string;
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
  cor: "VERMELHA" | "AZUL";
  kart_ids: string[];
  tamanho: number;
}

export interface KartRatingDTO {
  kart_id: string;
  grade: number | null;
  confianca: "sem_dados" | "baixa" | "media" | "alta";
  avg_delta_seconds: number | null;
  sample_count: number;
  distinct_teams: number;
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

export interface KartFeedSnapshot {
  karts: Record<string, KartDTO>;
  equipas: Record<string, EquipaDTO>;
  fila_espera: string[];
  fila_vermelha: FilaDTO;
  fila_azul: FilaDTO;
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
    fila_vermelha: { ...prev.fila_vermelha, kart_ids: [...prev.fila_vermelha.kart_ids] },
    fila_azul: { ...prev.fila_azul, kart_ids: [...prev.fila_azul.kart_ids] },
    last_event_seq: frame.seq,
  };

  const payload = frame.payload as Record<string, unknown>;

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
    case "KART_REINTEGRADO": {
      const kart = payload["kart"] as KartDTO;
      next.karts[kart.id] = kart;
      if (Array.isArray(payload["fila_espera"])) {
        next.fila_espera = payload["fila_espera"] as string[];
      }
      if (payload["fila_vermelha"]) next.fila_vermelha = payload["fila_vermelha"] as FilaDTO;
      if (payload["fila_azul"]) next.fila_azul = payload["fila_azul"] as FilaDTO;
      if (payload["fila_atualizada"]) {
        const fila = payload["fila_atualizada"] as FilaDTO;
        if (fila.cor === "VERMELHA") next.fila_vermelha = fila;
        else next.fila_azul = fila;
      }
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

export function useKartFeedActions() {
  const triarKart = useCallback(
    (kartId: string, cor: "VERMELHA" | "AZUL") =>
      postJson("/staff/triar", { kart_id: kartId, cor }),
    [],
  );

  const sortearKart = useCallback(
    (cor: "VERMELHA" | "AZUL", numeroEquipa: string, kartId?: string) =>
      postJson("/staff/sortear", { cor, numero_equipa: numeroEquipa, kart_id: kartId ?? null }),
    [],
  );

  const marcarForaDeServico = useCallback(
    (kartId: string, motivo: string) =>
      postJson("/staff/fora_de_servico", { kart_id: kartId, motivo }),
    [],
  );

  const reintegrarKart = useCallback(
    (kartId: string, destino: "fila_espera" | "fila_cor", cor?: "VERMELHA" | "AZUL") =>
      postJson("/staff/reintegrar", { kart_id: kartId, destino, cor: cor ?? null }),
    [],
  );

  const confirmarPitout = useCallback(
    (kartId: string) => postJson("/staff/pitout", { kart_id: kartId }),
    [],
  );

  return { triarKart, sortearKart, marcarForaDeServico, reintegrarKart, confirmarPitout };
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
