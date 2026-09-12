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

/** Número de turnos de condução (as boxes não contam). */
export function driveStintTotal(computed: ComputedStint[]) {
  return computed.reduce((n, c) => n + (c.isPit ? 0 : 1), 0);
}

/** Número sequencial do turno de condução na posição `index` (1-based); 0 se for box. */
export function driveStintNumber(computed: ComputedStint[], index: number) {
  const target = computed[index];
  if (!target || target.isPit) return 0;
  let n = 0;
  for (let i = 0; i <= index; i++) {
    const c = computed[i];
    if (c && !c.isPit) n++;
  }
  return n;
}

/** minutos -> "1:05" ou "0:07" */
export function fmtDuration(minutes: number) {
  const neg = minutes < 0;
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}`;
}

/** milissegundos -> "01:05:33" (tempo decorrido, arredondado para baixo) */
export function fmtClock(ms: number) {
  // Evita mostrar "-00:00:00" por diferenças de milissegundos no arranque.
  const safe = Math.abs(ms) < 1000 ? Math.max(0, ms) : ms;
  const neg = safe < 0;
  const total = Math.floor(Math.abs(safe) / 1000);
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
  // Antes da partida os horários do plano são indicativos, ancorados ao relógio atual.
  return state.startedAt ?? Date.now();
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

/** Quantos turnos podemos "queimar" ao tempo mínimo e ainda assim cumprir as
 *  paragens obrigatórias antes do fecho do pitlane, sem que nenhum dos turnos
 *  restantes ultrapasse o tempo máximo por piloto.
 *
 *  Com S paragens por cumprir há S+1 turnos de condução restantes. Se k turnos
 *  forem feitos ao mínimo, o tempo restante tem de caber em (S+1−k) turnos de
 *  duração máxima:
 *    drivingAvailable − k·minStint ≤ (S+1−k)·maxStint
 *  ⇔ k ≤ (S+1)·maxStint − drivingAvailable) / (maxStint − minStint) */
export function burnableStints(
  config: RaceConfig,
  remainingStops: number,
  drivingAvailableMin: number,
) {
  const stints = Math.max(0, Math.floor(remainingStops)) + 1;
  const span = config.maxStint - config.minStint;
  if (stints <= 0 || span <= 0 || drivingAvailableMin <= 0) return 0;
  const k = Math.floor((stints * config.maxStint - drivingAvailableMin) / span);
  return Math.max(0, Math.min(stints, k));
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
    teamName: "",
    eventName: "",
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
    autoEndBox: false,
  };
}

const DEFAULT_NAMES = ["Piloto 1", "Piloto 2", "Piloto 3", "Piloto 4", "Piloto 5"];

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
export function generatePlan(drivers: Driver[], config: RaceConfig): Stint[] {
  const racers = drivers.filter((d) => !isPitDriver(d));
  const pit = drivers.find(isPitDriver);
  if (racers.length === 0) return [];
  if (!pit || config.mandatoryStops <= 0) {
    const firstRacer = racers[0];
    if (!firstRacer) return [];
    return [{ id: uid(), driverCode: firstRacer.code, duration: config.raceDuration, ballast: 0 }];
  }

  // Uma prova com N paragens tem sempre exatamente N+1 turnos de condução.
  const stops = Math.max(0, Math.floor(config.mandatoryStops));
  const drivingFor = (n: number) => config.raceDuration - n * config.minPitDuration;

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
  return {
    config,
    drivers,
    stints: generatePlan(drivers, config),
    karts: [],
    startedAt: null,
    liveIndex: null,
    planSnapshot: null,
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
  const pitDurationOf = (s: Stint) => (s.durationLocked ? s.duration : config.minPitDuration);
  const pitMinutes = pitsAfter.reduce((sum, s) => sum + pitDurationOf(s), 0);
  const available = Math.max(0, config.raceDuration - consumed - pitMinutes);
  const base = Math.floor(available / drivesAfter.length);
  let remainder = available - base * drivesAfter.length;

  return stints.map((stint, i) => {
    if (i <= fromIndex) return stint;
    if (isPitStint(stint)) {
      return { ...stint, duration: pitDurationOf(stint) };
    }
    const extra = Math.min(1, Math.max(0, remainder));
    const duration = base + extra;
    remainder -= extra;
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
    out.push(`Plano com ${fmtDuration(total)} — a prova tem ${fmtDuration(config.raceDuration)}`);

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

/** Aplica a edição de um turno com as mesmas regras usadas ao guardar:
 *  durante a corrida só recalcula turnos ainda não executados e a correção
 *  de um turno passado não empurra a hora de fim do turno em curso. */
export function applyStintEdit(
  state: RaceState,
  id: string,
  patch: Partial<Stint>,
): { stints: Stint[]; startedAt: number | null; from: number; recalculated: number } {
  const idx = state.stints.findIndex((st) => st.id === id);
  if (idx < 0)
    return { stints: state.stints, startedAt: state.startedAt, from: 0, recalculated: 0 };
  const target = state.stints[idx]!;
  const targetIsPit = isPitDriver(findDriver(state.drivers, target.driverCode));
  // Ao alterar manualmente o tempo de uma box (ex.: penalização de 3m30),
  // essa paragem passa a manter exatamente esse tempo.
  const effective: Partial<Stint> =
    targetIsPit && patch.duration !== undefined ? { ...patch, durationLocked: true } : patch;
  let next = state.stints.map((st) => (st.id === id ? { ...st, ...effective } : st));
  let startedAt = state.startedAt;

  let from = idx;
  if (state.startedAt !== null) {
    const beforeComputed = computeStints(state);
    const cur = state.liveIndex ?? currentStintIndex(beforeComputed, Date.now());
    if (cur > from) {
      from = cur;

      // Uma correção histórica descreve o que realmente aconteceu antes do
      // turno atual. Compensar no instante de partida preserva exatamente o
      // início, fim, duração e contador do turno em curso, mesmo quando a
      // diferença é superior à duração das boxes intermédias.
      const activeBefore = beforeComputed[cur];
      const activeAfter = computeStints({ ...state, stints: next })[cur];
      if (activeBefore && activeAfter) {
        startedAt = state.startedAt + activeBefore.startAt - activeAfter.startAt;
      }
    }
  }

  next = rebalanceFrom(next, state.drivers, state.config, from);
  return {
    stints: next,
    startedAt,
    from,
    recalculated: Math.max(0, next.length - from),
  };
}

/** milissegundos -> "01:05:33" para contagens decrescentes.
 *  Arredonda para cima para nunca mostrar menos tempo do que o real. */
export function fmtCountdown(ms: number) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
