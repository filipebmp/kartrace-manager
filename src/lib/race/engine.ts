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

/** Compatibilidade com planos antigos, em que a BOX não tinha `isPit`. */
export function isPitDriver(driver: Driver | null | undefined) {
  return driver?.isPit === true || driver?.name.trim().toUpperCase() === "BOX";
}

export function normalizeDrivers(drivers: Driver[]) {
  return drivers.map((driver) =>
    isPitDriver(driver) && !driver.isPit ? { ...driver, isPit: true } : driver,
  );
}

/** Garante que existe um piloto BOX; se faltar, cria-o com um código livre. */
export function ensurePitDriver(drivers: Driver[]): Driver[] {
  const normalized = normalizeDrivers(drivers);
  if (normalized.some(isPitDriver)) return normalized;
  const used = new Set(normalized.map((d) => d.code));
  let code = 10;
  while (used.has(code)) code++;
  return [...normalized, { id: uid(), code, name: "BOX", weight: 0, isPit: true }];
}

export function raceStartTs(state: RaceState) {
  if (state.startedAt) return state.startedAt;
  const t = new Date(state.plannedStart).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

/** offset (min) em que o pitlane fecha: 24:30 para uma prova de 25h */
export function pitLaneCloseOffset(config: RaceConfig) {
  return config.raceDuration - config.pitLaneClosesBefore;
}

export function computeStints(state: RaceState): ComputedStint[] {
  const { config, drivers, stints } = state;
  const start = raceStartTs(state);
  const closeOffset = pitLaneCloseOffset(config);
  let offset = 0;

  return stints.map((stint, i) => {
    const driver = findDriver(drivers, stint.driverCode);
    const isPit = isPitDriver(driver);

    const driverWeight = driver && !isPit ? driver.weight : 0;
    const weighInWeight = driverWeight + stint.ballast;
    const weightDiff = weighInWeight - config.minDriverWeight;
    const suggestedBallast = Math.max(0, Math.ceil(config.minDriverWeight - driverWeight));
    // 30 s por cada 0,5 kg em falta
    const weightPenalty = weightDiff < 0 ? Math.ceil(Math.abs(weightDiff) / 0.5) * 30 : 0;

    const warnings: string[] = [];
    if (isPit) {
      if (stint.duration < config.minPitDuration)
        warnings.push(`Paragem abaixo do mínimo de ${config.minPitDuration} min`);
      if (offset + stint.duration > closeOffset)
        warnings.push(
          `Paragem depois do fecho do pitlane (${fmtDuration(closeOffset)}) — não conta como obrigatória`,
        );
    } else {
      if (!driver) warnings.push("Sem piloto atribuído");
      if (weightDiff < 0)
        warnings.push(
          `Faltam ${Math.abs(weightDiff).toFixed(1)} kg na balança (+${weightPenalty}s)`,
        );
      if (stint.duration > config.maxStint)
        warnings.push(`Turno acima do máximo (${config.maxStint} min)`);
      if (stint.duration < config.minStint)
        warnings.push(`Turno abaixo do mínimo (${config.minStint} min)`);
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
      weighInWeight,
      weightDiff,
      suggestedBallast,
      weightPenalty,
      warnings,
    };
    offset += stint.duration;
    return computed;
  });
}

export function driverTotals(state: RaceState, computed: ComputedStint[]): DriverTotals[] {
  return state.drivers
    .filter((d) => !isPitDriver(d))
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

export function raceSummary(state: RaceState, computed: ComputedStint[]): RaceSummary {
  const { config } = state;
  const pits = computed.filter((c) => c.isPit);
  const closeOffset = pitLaneCloseOffset(config);
  // Só contam como obrigatórias as trocas efetuadas na totalidade até ao fecho do pitlane
  const validStops = pits.filter((c) => c.endOffset <= closeOffset).length;
  const stopsAfterPitClose = pits.length - validStops;
  const requiredStops = config.mandatoryStops;
  const missingStops = Math.max(0, requiredStops - validStops);
  return {
    plannedMinutes: totalPlanned(state.stints),
    stops: validStops,
    requiredStops,
    missingStops,
    lapPenalty: missingStops * 5,
    stopsAfterPitClose,
  };
}

export function currentStintIndex(computed: ComputedStint[], now: number) {
  return computed.findIndex((c) => now >= c.startAt && now < c.endAt);
}

export function ballastInstruction(current?: ComputedStint, next?: ComputedStint) {
  const a = current?.ballast ?? 0;
  const b = next?.ballast ?? 0;
  if (a === b) return a === 0 ? "Sem lastro" : `Manter ${a} kg`;
  if (a > b) return `Retirar ${a - b} kg`;
  return `Adicionar ${b - a} kg`;
}

export function totalPlanned(stints: Stint[]) {
  return stints.reduce((s, x) => s + x.duration, 0);
}

// Valores por omissão: categoria PRO (28 paragens, turno máx. 80 min)
export function defaultConfig(): RaceConfig {
  return {
    teamName: "Light Speed",
    eventName: "25H Karting Palmela",
    raceDuration: 25 * 60,
    minDriverWeight: 85,
    minStint: 10,
    maxStint: 80,
    minTotalDriving: 120,
    maxTotalDriving: 300,
    mandatoryStops: 28,
    minPitDuration: 3,
    pitDuration: 3,
    pitLaneClosesBefore: 30,
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
    weight: 85,
  }));
  list.push({ id: uid(), code: 10, name: "BOX", weight: 0, isPit: true });
  return list;
}

/** Gera um plano rodando os pilotos, com paragem de box entre turnos.
 *  Garante exatamente `mandatoryStops` paragens e `mandatoryStops + 1`
 *  turnos de condução, com o tempo de condução distribuído uniformemente. */
export function generatePlan(
  drivers: Driver[],
  config: RaceConfig,
  stintLength: number,
): Stint[] {
  const racers = drivers.filter((d) => !isPitDriver(d));
  const pit = drivers.find(isPitDriver);
  if (racers.length === 0) return [];
  if (!pit || config.mandatoryStops <= 0) {
    const firstRacer = racers[0];
    if (!firstRacer) return [];
    return [
      { id: uid(), driverCode: firstRacer.code, duration: config.raceDuration, ballast: 0 },
    ];
  }

  // Uma prova com N paragens tem sempre exatamente N+1 turnos de condução.
  // A duração base serve de referência visual; o tempo é redistribuído para
  // preencher a duração total sem criar paragens adicionais.
  const stops = Math.max(0, Math.floor(config.mandatoryStops));
  const drivingFor = (n: number) => config.raceDuration - n * config.minPitDuration;
  void stintLength;

  const nDrive = stops + 1;
  const totalDriving = drivingFor(stops);
  const base = Math.floor(totalDriving / nDrive);
  // Distribuir o resto pelos primeiros turnos (ex.: 1416/29 → 24×49 + 5×48).
  let remainder = totalDriving - base * nDrive;

  const stints: Stint[] = [];
  for (let i = 0; i < nDrive; i++) {
    const duration = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    const driver = racers[i % racers.length];
    if (!driver) continue;
    stints.push({ id: uid(), driverCode: driver.code, duration, ballast: 0 });
    if (i < stops) {
      stints.push({
        id: uid(),
        driverCode: pit.code,
        duration: config.minPitDuration,
        ballast: 0,
      });
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
    liveIndex: null,
    planSnapshot: null,
    plannedStart: toLocalInput(start),
  };
}

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Redistribui o tempo restante pelos turnos de condução ainda por cumprir,
 *  mantendo o número de paragens e a duração total da prova.
 *  `fromIndex` é o último turno já fechado (não é alterado). */
export function rebalanceFrom(
  stints: Stint[],
  drivers: Driver[],
  config: RaceConfig,
  fromIndex: number,
): Stint[] {
  const consumed = stints.slice(0, fromIndex + 1).reduce((s, x) => s + x.duration, 0);
  const rest = stints.slice(fromIndex + 1);
  if (rest.length === 0) return stints;

  const isPitStint = (s: Stint) => isPitDriver(findDriver(drivers, s.driverCode));
  const pitsAfter = rest.filter(isPitStint);
  const drivesAfter = rest.filter((s) => !isPitStint(s));
  if (drivesAfter.length === 0) return stints;

  // Todas as boxes têm exatamente a duração definida no regulamento.
  // Uma box terminada antecipadamente não transfere o tempo em falta para as seguintes.
  const pitMinutes = pitsAfter.length * config.minPitDuration;
  const available = Math.max(0, config.raceDuration - consumed - pitMinutes);
  const base = Math.floor(available / drivesAfter.length);
  let remainder = available - base * drivesAfter.length;

  return stints.map((stint, i) => {
    if (i <= fromIndex) return stint;
    if (isPitStint(stint)) {
      return { ...stint, duration: config.minPitDuration };
    }
    const duration = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    return { ...stint, duration };
  });
}

/** Avisos globais de conformidade com o regulamento (após ajustes em tempo real). */
export function planWarnings(state: RaceState, computed: ComputedStint[]): string[] {
  const { config } = state;
  const out: string[] = [];
  const summary = raceSummary(state, computed);
  const total = totalPlanned(state.stints);

  if (summary.missingStops > 0)
    out.push(
      `Faltam ${summary.missingStops} paragens obrigatórias antes do fecho do pitlane (−${summary.lapPenalty} voltas)`,
    );
  if (summary.stopsAfterPitClose > 0)
    out.push(`${summary.stopsAfterPitClose} paragem(ns) depois do fecho do pitlane`);
  if (Math.round(total) !== config.raceDuration)
    out.push(
      `Plano com ${fmtDuration(total)} — a prova tem ${fmtDuration(config.raceDuration)}`,
    );

  const long = computed.filter((c) => !c.isPit && c.duration > config.maxStint).length;
  if (long > 0) out.push(`${long} turno(s) acima do máximo de ${config.maxStint} min`);
  const short = computed.filter((c) => !c.isPit && c.duration < config.minStint).length;
  if (short > 0) out.push(`${short} turno(s) abaixo do mínimo de ${config.minStint} min`);

  for (const t of driverTotals(state, computed)) {
    if (t.belowMin)
      out.push(
        `${t.driver.name} com ${fmtDuration(t.totalDriving)} — mínimo ${fmtDuration(config.minTotalDriving)}`,
      );
    if (t.aboveMax)
      out.push(
        `${t.driver.name} com ${fmtDuration(t.totalDriving)} — máximo ${fmtDuration(config.maxTotalDriving)}`,
      );
  }
  return out;
}
