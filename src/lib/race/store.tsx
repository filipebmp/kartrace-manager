import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyStintEdit,
  computeStints,
  currentStintIndex,
  defaultState,
  ensurePitDriver,
  isPitDriver,
  MIN,
  rebalanceFrom,

  uid,
} from "./engine";
import type { Driver, RaceConfig, RaceState, Stint } from "./types";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const KEY = "kart24h-state-v3";

interface Ctx {
  state: RaceState;
  hydrated: boolean;
  setConfig: (patch: Partial<RaceConfig>) => void;
  setDrivers: (drivers: Driver[]) => void;
  addDriver: () => void;
  /** Cria `count` pilotos novos (Piloto 1..N) com o peso indicado, mantendo a BOX */
  generateDrivers: (count: number, weight: number) => void;
  updateDriver: (id: string, patch: Partial<Driver>) => void;
  removeDriver: (id: string) => void;
  setStints: (stints: Stint[]) => void;
  updateStint: (id: string, patch: Partial<Stint>) => number;
  /** Define o lastro de um turno sem recalcular horários (confirmação via rádio) */
  setBallast: (id: string, kg: number) => void;
  /** Marca se o piloto levou lastro no turno, sem recalcular horários */
  setBallastConfirmed: (id: string, confirmed: boolean) => void;
  /** Regista o kart utilizado num turno sem recalcular horários */
  setKart: (id: string, kart: string) => void;
  /** Regista a avaliação do kart num turno sem recalcular horários */
  setKartRating: (id: string, rating: Stint["kartRating"]) => void;
  insertStintAfter: (id: string | null) => void;
  removeStint: (id: string) => void;
  moveStint: (id: string, dir: -1 | 1) => void;
  start: () => void;
  stop: () => void;
  /** Termina o turno atual agora (piloto entra nas boxes mais cedo que o planeado) */
  boxNow: () => void;
  /** Termina a paragem atual nas boxes agora (saída mais cedo que o planeado) */
  endBoxNow: () => void;
  setPlannedStart: (v: string) => void;
  replaceState: (s: RaceState) => void;
  reset: () => void;
}

const RaceContext = createContext<Ctx | null>(null);

function merge(saved: Partial<RaceState> | null | undefined): RaceState {
  const base = defaultState();
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    config: { ...base.config, ...(saved.config ?? {}) },
    drivers: ensurePitDriver(Array.isArray(saved.drivers) ? saved.drivers : base.drivers),
  };
}

export function RaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RaceState>(() => defaultState());
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Carrega o estado da equipa: primeiro a cópia local (rápida), depois a nuvem.
  // Recarrega sempre que a sessão muda, para nunca mostrar dados de outra equipa.
  useEffect(() => {
    let active = true;
    let loadToken = 0;

    async function loadFor(currentUid: string | null) {
      const token = ++loadToken;
      const stale = () => !active || token !== loadToken;

      setUserId(currentUid);
      setHydrated(false);
      setState(defaultState());

      // Sem sessão não carregamos nem guardamos nada: evita fugas entre equipas.
      if (!currentUid) {
        if (!stale()) setHydrated(true);
        return;
      }

      let local: Partial<RaceState> | null = null;
      try {
        const raw = localStorage.getItem(`${KEY}:${currentUid}`);
        if (raw) local = JSON.parse(raw) as Partial<RaceState>;
      } catch {
        /* ignore */
      }
      if (stale()) return;
      if (local) setState(merge(local));

      const { data: row } = await supabase
        .from("race_states")
        .select("state")
        .eq("user_id", currentUid)
        .maybeSingle();
      if (stale()) return;
      const remote = row?.state as Partial<RaceState> | undefined;
      if (remote && Object.keys(remote).length > 0) setState(merge(remote));

      // Se ainda não há nome de equipa definido, usa o nome do registo.
      const hasName =
        (remote?.config?.teamName ?? local?.config?.teamName ?? "").trim().length > 0;
      if (!hasName) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("team_name")
          .eq("id", currentUid)
          .maybeSingle();
        const name = profile?.team_name?.trim();
        if (!stale() && name) {
          setState((s) =>
            s.config.teamName.trim() ? s : { ...s, config: { ...s.config, teamName: name } },
          );
        }
      }
      if (!stale()) setHydrated(true);
    }

    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      await loadFor(data.user?.id ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const nextUid = session?.user?.id ?? null;
      setUserId((prev) => {
        if (prev !== nextUid) void loadFor(nextUid);
        return prev;
      });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Guarda localmente de imediato e na nuvem com um pequeno atraso.
  useEffect(() => {
    if (!hydrated || !userId) return;
    try {
      localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(state));
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => {
      void (async () => {
        // Confirma que a sessão ainda é da mesma equipa antes de escrever.
        const { data } = await supabase.auth.getUser();
        if (data.user?.id !== userId) return;
        const { error } = await supabase
          .from("race_states")
          .upsert({ user_id: userId, state: state as unknown as Json }, { onConflict: "user_id" });
        if (error) console.error("Falha ao guardar na nuvem", error.message);
      })();
    }, 800);
    return () => clearTimeout(t);
  }, [state, hydrated, userId]);


  const patch = useCallback((fn: (s: RaceState) => RaceState) => setState(fn), []);

  // Registo imutável de eventos da corrida (auditoria de timings, ao segundo).
  const logEvent = useCallback(
    (
      event: "box_start" | "box_end",
      stintId: string,
      stintLabel: string,
      at: number,
      meta: Record<string, unknown>,
    ) => {
      if (!userId) return;
      void supabase
        .from("race_event_log")
        .insert({
          user_id: userId,
          event,
          stint_id: stintId,
          stint_label: stintLabel,
          event_at: new Date(at).toISOString(),
          meta: meta as Json,
        })
        .then(({ error }) => {
          if (error) console.error("Falha ao registar evento", error.message);
        });
    },
    [userId],
  );

  const value = useMemo<Ctx>(
    () => ({
      state,
      hydrated,
      setConfig: (p) => patch((s) => ({ ...s, config: { ...s.config, ...p } })),
      setDrivers: (drivers) => patch((s) => ({ ...s, drivers })),
      generateDrivers: (count, weight) =>
        patch((s) => {
          const n = Math.max(0, Math.floor(count));
          const racers: Driver[] = Array.from({ length: n }, (_, i) => ({
            id: uid(),
            code: i + 1,
            name: `Piloto ${i + 1}`,
            weight,
          }));
          return {
            ...s,
            drivers: ensurePitDriver(racers),
            stints: [],
            startedAt: null,
            liveIndex: null,
            planSnapshot: null,
          };
        }),
      addDriver: () =>
        patch((s) => {
          const codes = s.drivers.filter((d) => !isPitDriver(d)).map((d) => d.code);
          const code = (codes.length ? Math.max(...codes) : 0) + 1;
          const pitIndex = s.drivers.findIndex(isPitDriver);
          const next = [...s.drivers];
          const entry: Driver = { id: uid(), code, name: `Piloto ${code}`, weight: 85 };
          if (pitIndex >= 0) next.splice(pitIndex, 0, entry);
          else next.push(entry);
          return { ...s, drivers: next };
        }),
      updateDriver: (id, p) =>
        patch((s) => ({
          ...s,
          drivers: s.drivers.map((d) => (d.id === id ? { ...d, ...p } : d)),
        })),
      removeDriver: (id) =>
        patch((s) => {
          const target = s.drivers.find((d) => d.id === id);
          return {
            ...s,
            drivers: s.drivers.filter((d) => d.id !== id),
            stints: s.stints.map((st) =>
              st.driverCode === target?.code ? { ...st, driverCode: null } : st,
            ),
          };
        }),
      setStints: (stints) => patch((s) => ({ ...s, stints })),
      updateStint: (id, p) => {
        let recalculated = 0;
        patch((s) => {
          const res = applyStintEdit(s, id, p);
          recalculated = res.recalculated;
          return { ...s, stints: res.stints, startedAt: res.startedAt };
        });
        return recalculated;
      },



      setBallast: (id, kg) =>
        patch((s) => ({
          ...s,
          stints: s.stints.map((st) =>
            st.id === id ? { ...st, ballast: kg, ballastConfirmed: true } : st,
          ),
        })),

      setBallastConfirmed: (id, confirmed) =>
        patch((s) => ({
          ...s,
          stints: s.stints.map((st) =>
            st.id === id ? { ...st, ballastConfirmed: confirmed } : st,
          ),
        })),

      setKart: (id, kart) =>
        patch((s) => ({
          ...s,
          stints: s.stints.map((st) => (st.id === id ? { ...st, kart } : st)),
        })),

      setKartRating: (id, kartRating) =>
        patch((s) => ({
          ...s,
          stints: s.stints.map((st) => (st.id === id ? { ...st, kartRating } : st)),
        })),

      insertStintAfter: (id) =>
        patch((s) => {
          const entry: Stint = {
            id: uid(),
            driverCode: s.drivers.find((d) => !isPitDriver(d))?.code ?? null,
            duration: 60,
            ballast: 0,
          };
          if (!id) return { ...s, stints: [...s.stints, entry] };
          const i = s.stints.findIndex((st) => st.id === id);
          const next = [...s.stints];
          next.splice(i + 1, 0, entry);
          return { ...s, stints: next };
        }),
      removeStint: (id) => patch((s) => ({ ...s, stints: s.stints.filter((x) => x.id !== id) })),
      moveStint: (id, dir) =>
        patch((s) => {
          const i = s.stints.findIndex((x) => x.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.stints.length) return s;
          const next = [...s.stints];
          const [item] = next.splice(i, 1);
          next.splice(j, 0, item!);
          return { ...s, stints: next };
        }),
      start: () =>
        patch((s) => ({ ...s, startedAt: Date.now(), liveIndex: 0, planSnapshot: s.stints })),
      stop: () =>
        patch((s) => ({
          ...s,
          startedAt: null,
          liveIndex: null,
          stints: s.planSnapshot ?? s.stints,
          planSnapshot: null,
        })),
      endBoxNow: () =>
        patch((s) => {
          if (s.startedAt === null) return s;
          const now = Date.now();
          const computed = computeStints(s);
          const idx = s.liveIndex ?? currentStintIndex(computed, now);
          if (idx < 0 || idx >= computed.length) return s;
          const cur = computed[idx]!;
          // só atua durante uma paragem
          if (!cur.isPit) return s;
          const stints = s.stints.map((x) => ({ ...x }));
          const currentStint = stints[idx];
          if (!currentStint) return s;
          // A paragem já terminada regista o tempo real decorrido, para o
          // cronómetro seguinte arrancar exatamente agora. As paragens futuras
          // mantêm sempre a duração do regulamento (ver rebalanceFrom).
          currentStint.duration = Math.max(0, (now - cur.startAt) / MIN);
          const nextStint = stints[idx + 1];
          logEvent("box_end", currentStint.id, "Box", now, {
            planned_duration_min: cur.duration,
            actual_duration_sec: Math.round(((now - cur.startAt) / 1000) * 10) / 10,
            next_driver:
              s.drivers.find((d) => d.code === nextStint?.driverCode)?.name ?? null,
          });
          return {
            ...s,
            stints: rebalanceFrom(stints, s.drivers, s.config, idx),
            liveIndex: idx + 1,
          };
        }),
      boxNow: () =>
        patch((s) => {
          if (s.startedAt === null) return s;
          const now = Date.now();
          const computed = computeStints(s);
          const idx = s.liveIndex ?? currentStintIndex(computed, now);
          if (idx < 0 || idx >= computed.length) return s;
          const cur = computed[idx]!;
          // já está nas boxes: não encurtar a paragem
          if (cur.isPit) return s;
          // Preservar o instante exato do clique para a contagem da box
          // começar na duração mínima completa, sem perder segundos por arredondamento.
          const elapsedMin = Math.max(0, (now - cur.startAt) / MIN);
          const stints = [...s.stints];
          stints[idx] = { ...stints[idx]!, duration: elapsedMin };
          const pitDriver = s.drivers.find(isPitDriver);
          const nextIsPit = pitDriver && stints[idx + 1]?.driverCode === pitDriver.code;
          if (pitDriver) {
            if (nextIsPit) {
              const nextPit = stints[idx + 1]!;
              stints[idx + 1] = {
                ...nextPit,
                duration: nextPit.durationLocked
                  ? nextPit.duration
                  : s.config.minPitDuration,
              };
            } else {
              stints.splice(idx + 1, 0, {
                id: uid(),
                driverCode: pitDriver.code,
                duration: s.config.minPitDuration,
                ballast: 0,
              });
            }
          }
          // Recalcular os turnos seguintes para preencher o tempo restante da prova
          const pitStint = stints[idx + 1];
          if (pitStint) {
            logEvent("box_start", pitStint.id, "Box", now, {
              planned_duration_min: pitStint.duration,
              elapsed_stint_sec: Math.round(elapsedMin * 60 * 10) / 10,
              driver_in_pit: s.drivers.find((d) => d.code === cur.driverCode)?.name ?? null,
            });
          }
          return {
            ...s,
            stints: rebalanceFrom(stints, s.drivers, s.config, idx + 1),
            liveIndex: idx + 1,
          };
        }),

      setPlannedStart: (v) => patch((s) => ({ ...s, plannedStart: v })),
      replaceState: (s) => setState({ ...s, drivers: ensurePitDriver(s.drivers) }),
      reset: () => setState(defaultState()),
    }),
    [state, hydrated, patch],
  );

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>;
}

export function useRace() {
  const ctx = useContext(RaceContext);
  if (!ctx) throw new Error("useRace tem de ser usado dentro de RaceProvider");
  return ctx;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
