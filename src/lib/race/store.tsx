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

const KEY = "kart24h-state-v2";

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

export function RaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RaceState>(() => defaultState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as RaceState;
        const base = defaultState();
        setState({
          ...base,
          ...saved,
          config: { ...base.config, ...(saved.config ?? {}) },
          drivers: ensurePitDriver(Array.isArray(saved.drivers) ? saved.drivers : base.drivers),
        });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);


  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const patch = useCallback((fn: (s: RaceState) => RaceState) => setState(fn), []);

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
          const idx = s.stints.findIndex((st) => st.id === id);
          if (idx < 0) return s;
          const next = s.stints.map((st) => (st.id === id ? { ...st, ...p } : st));
          // Só recalcula os turnos que ainda não foram executados: durante a
          // corrida, os turnos já feitos (e o que está em curso) ficam como
          // estão e só podem ser alterados manualmente.
          let from = idx;
          if (s.startedAt !== null) {
            const computed = computeStints({ ...s, stints: next });
            const cur = s.liveIndex ?? currentStintIndex(computed, Date.now());
            if (cur > from) from = cur;
          }
          recalculated = Math.max(0, next.length - from);
          return { ...s, stints: rebalanceFrom(next, s.drivers, s.config, from) };
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
              stints[idx + 1] = {
                ...stints[idx + 1]!,
                duration: s.config.minPitDuration,
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
