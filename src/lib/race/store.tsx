import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { computeStints, currentStintIndex, defaultState, MIN, uid } from "./engine";
import type { Driver, RaceConfig, RaceState, Stint } from "./types";

const KEY = "kart24h-state-v1";

interface Ctx {
  state: RaceState;
  hydrated: boolean;
  setConfig: (patch: Partial<RaceConfig>) => void;
  setDrivers: (drivers: Driver[]) => void;
  addDriver: () => void;
  updateDriver: (id: string, patch: Partial<Driver>) => void;
  removeDriver: (id: string) => void;
  setStints: (stints: Stint[]) => void;
  updateStint: (id: string, patch: Partial<Stint>) => void;
  insertStintAfter: (id: string | null) => void;
  removeStint: (id: string) => void;
  moveStint: (id: string, dir: -1 | 1) => void;
  start: () => void;
  stop: () => void;
  /** Termina o turno atual agora (piloto entra nas boxes mais cedo que o planeado) */
  boxNow: () => void;
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
      addDriver: () =>
        patch((s) => {
          const codes = s.drivers.filter((d) => !d.isPit).map((d) => d.code);
          const code = (codes.length ? Math.max(...codes) : 0) + 1;
          const pitIndex = s.drivers.findIndex((d) => d.isPit);
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
      updateStint: (id, p) =>
        patch((s) => ({
          ...s,
          stints: s.stints.map((st) => (st.id === id ? { ...st, ...p } : st)),
        })),
      insertStintAfter: (id) =>
        patch((s) => {
          const entry: Stint = {
            id: uid(),
            driverCode: s.drivers.find((d) => !d.isPit)?.code ?? null,
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
      start: () => patch((s) => ({ ...s, startedAt: Date.now() })),
      stop: () => patch((s) => ({ ...s, startedAt: null })),
      boxNow: () =>
        patch((s) => {
          if (s.startedAt === null) return s;
          const now = Date.now();
          const computed = computeStints(s);
          const idx = currentStintIndex(computed, now);
          if (idx < 0) return s;
          const cur = computed[idx];
          const elapsedMin = Math.max(1, Math.round(((now - cur.startAt) / MIN) * 10) / 10);
          const stints = [...s.stints];
          if (cur.isPit) {
            // já está nas boxes: terminar a paragem mais cedo
            stints[idx] = { ...stints[idx]!, duration: elapsedMin };
            return { ...s, stints };
          }
          stints[idx] = { ...stints[idx]!, duration: elapsedMin };
          const pitDriver = s.drivers.find((d) => d.isPit);
          const nextIsPit = pitDriver && stints[idx + 1]?.driverCode === pitDriver.code;
          if (pitDriver && !nextIsPit) {
            stints.splice(idx + 1, 0, {
              id: uid(),
              driverCode: pitDriver.code,
              duration: s.config.pitDuration,
              ballast: 0,
            });
          }
          return { ...s, stints };
        }),
      setPlannedStart: (v) => patch((s) => ({ ...s, plannedStart: v })),
      replaceState: (s) => setState(s),
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
