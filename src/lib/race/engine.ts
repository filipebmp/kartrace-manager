import type {
  ComputedStint,
  Driver,
  DriverTotals,
  RaceConfig,
  RaceState,
  RaceSummary,
  Stint,
} from "./types";


export const MIN = 60_000;

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/** minutos -> "1:05" ou "0:07" */
export function fmtDuration(minutes: number) {
  const neg = minutes < 0;
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

/** milissegundos -> "01:05:33" */
export function fmtClock(ms: number) {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${neg ? "-" : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s,
  ).padStart(2, "0")}`;
}

export function fmtTimeOfDay(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parseDuration(value: string): number {
  const v = value.trim();
  if (!v) return 0;
  if (v.includes(":")) {
    const [h, m] = v.split(":");
    return (Number(h) || 0) * 60 + (Number(m) || 0);
  }
  return Number(v) || 0;
}

export function findDriver(drivers: Driver[], code: number | null) {
  if (code === null) return null;
  return drivers.find((d) => d.code === code) ?? null;
}

export function raceStartTs(state: RaceState) {
  if (state.startedAt) return state.startedAt;
  const t = new Date(state.plannedStart).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

export function computeStints(state: RaceState): ComputedStint[] {
  const { config, drivers, stints } = state;
  const start = raceStartTs(state);
  let offset = 0;

  return stints.map((stint, i) => {
    const driver = findDriver(drivers, stint.driverCode);
    const isPit = !!driver?.isPit;

    const driverWeight = driver && !isPit ? driver.weight : 0;
    const base = config.kartWeight + driverWeight;
    const combinedWeight = base + stint.ballast;
    const weightDiff = combinedWeight - config.minTotalWeight;
    const suggestedBallast = Math.max(0, Math.ceil(config.minTotalWeight - base));

    const warnings: string[] = [];
    if (!isPit) {
      if (weightDiff < 0) warnings.push(`Adicionar ${Math.abs(Math.round(weightDiff))} kg de lastro`);
      if (weightDiff >= 5) warnings.push("Peso excessivo");
      if (stint.duration > config.maxStint) warnings.push("Turno acima do máximo");
      if (!driver) warnings.push("Sem piloto atribuído");
    }

    const computed: ComputedStint = {
      ...stint,
      index: i,
      driver,
      isPit,
      startOffset: offset,
      endOffset: offset + stint.duration,
      startAt: start + offset * MIN,
      endAt: start + (offset + stint.duration) * MIN,
      combinedWeight,
      weightDiff,
      suggestedBallast,
      warnings,
    };
    offset += stint.duration;
    return computed;
  });
}

export function driverTotals(state: RaceState, computed: ComputedStint[]): DriverTotals[] {
  return state.drivers
    .filter((d) => !d.isPit)
    .map((driver) => {
      const own = computed.filter((c) => c.driverCode === driver.code);
      const totalDriving = own.reduce((s, c) => s + c.duration, 0);
      return {
        driver,
        totalDriving,
        stints: own.length,
        belowMin: totalDriving < state.config.minTotalDriving,
        aboveMax: totalDriving > state.config.maxTotalDriving,
      };
    });
}

export function currentStintIndex(computed: ComputedStint[], now: number) {
  return computed.findIndex((c) => now >= c.startAt && now < c.endAt);
}

export function ballastInstruction(current?: ComputedStint, next?: ComputedStint) {
  const a = current?.ballast ?? 0;
  const b = next?.ballast ?? 0;
  if (a === b) return a === 0 ? "Sem lastro" : "Manter lastro no kart";
  if (a > b) return `Retirar ${a - b} kg de lastro`;
  return `Adicionar ${b - a} kg de lastro`;
}

export function totalPlanned(stints: Stint[]) {
  return stints.reduce((s, x) => s + x.duration, 0);
}

export function defaultConfig(): RaceConfig {
  return {
    teamName: "Light Speed",
    eventName: "24H Karting Palmela",
    raceDuration: 24 * 60,
    minTotalWeight: 245,
    kartWeight: 160,
    maxStint: 75,
    maxTotalDriving: 270,
    minTotalDriving: 90,
    restBetweenStints: 0,
    boxOrder: "BT",
    pitDuration: 3,
  };
}

const DEFAULT_NAMES = [
  "António Baptista",
  "Ricardo Maltinha",
  "Nuno Paço",
  "Filipe Paço",
  "Pedro Costa",
  "Nuno Pais",
];

export function defaultDrivers(): Driver[] {
  const list: Driver[] = DEFAULT_NAMES.map((name, i) => ({
    id: uid(),
    code: i + 1,
    name,
    weight: 82,
  }));
  list.push({ id: uid(), code: 10, name: "BOX", weight: 0, isPit: true });
  return list;
}

/** Gera um plano rodando os pilotos, com paragem de box entre turnos. */
export function generatePlan(
  drivers: Driver[],
  config: RaceConfig,
  stintLength: number,
): Stint[] {
  const racers = drivers.filter((d) => !d.isPit);
  const pit = drivers.find((d) => d.isPit);
  if (racers.length === 0) return [];
  const stints: Stint[] = [];
  let elapsed = 0;
  let i = 0;

  while (elapsed < config.raceDuration) {
    const duration = Math.min(stintLength, config.raceDuration - elapsed);
    if (duration <= 0) break;
    const driver = racers[i % racers.length]!;
    stints.push({
      id: uid(),
      driverCode: driver.code,
      duration,
      ballast: 0,
    });
    elapsed += duration;
    i++;
    if (elapsed < config.raceDuration && pit) {
      const pitTime = Math.min(config.pitDuration, config.raceDuration - elapsed);
      if (pitTime > 0) {
        stints.push({
          id: uid(),
          driverCode: pit.code,
          duration: pitTime,
          ballast: 0,
        });
        elapsed += pitTime;
      }
    }
  }
  return stints;
}

export function defaultState(): RaceState {
  const config = defaultConfig();
  const drivers = defaultDrivers();
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return {
    config,
    drivers,
    stints: generatePlan(drivers, config, 60),
    startedAt: null,
    plannedStart: toLocalInput(start),
  };
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
