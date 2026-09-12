export interface Driver {
  id: string;
  code: number;
  name: string;
  /** peso do piloto totalmente equipado (kg) */
  weight: number;
  isPit?: boolean;
}

export interface Stint {
  id: string;
  driverCode: number | null;
  /** duração em minutos */
  duration: number;
  /** duração desta box definida manualmente (ex.: penalização) — não é reposta pelo regulamento */
  durationLocked?: boolean;
  /** lastro que o piloto leva consigo para a pesagem (kg) */
  ballast: number;
  /** confirmação de que o piloto levou o lastro neste turno (não afeta cálculos) */
  ballastConfirmed?: boolean;
  /** número do kart utilizado neste turno */
  kart?: string;
  /** avaliação do kart utilizado neste turno */
  kartRating?: "não sei" | "muito bom" | "bom" | "médio" | "mau" | "muito mau" | undefined;
  note?: string | undefined;
}

export type KartRating = "não sei" | "muito bom" | "bom" | "médio" | "mau" | "muito mau";

export interface Kart {
  id: string;
  /** número do kart */
  number: string;
  rating: KartRating;
  note?: string | undefined;
}

export interface RaceConfig {
  teamName: string;
  eventName: string;
  /** duração total da prova em minutos */
  raceDuration: number;
  /** peso mínimo do piloto equipado à saída do kart (kg) */
  minDriverWeight: number;
  /** turno mínimo / máximo em minutos */
  minStint: number;
  maxStint: number;
  /** condução mínima por piloto em todo o evento (min) */
  minTotalDriving: number;
  /** alvo máximo de condução por piloto (gestão interna da equipa) */
  maxTotalDriving: number;
  /** paragens obrigatórias (troca de kart) */
  mandatoryStops: number;
  /** tempo mínimo de permanência nas boxes (min) */
  minPitDuration: number;
  /** duração planeada de cada paragem (min) */
  pitDuration: number;
  /** minutos finais em que o pitlane está encerrado */
  pitLaneClosesBefore: number;
  /** terminar a box automaticamente quando o tempo planeado chega ao fim */
  autoEndBox: boolean;
}

export interface RaceState {
  config: RaceConfig;
  drivers: Driver[];
  stints: Stint[];
  /** timestamp (ms) da partida real, null = não iniciada */
  startedAt: number | null;
  /** índice do turno/box em curso durante a corrida (avança só por ação do utilizador) */
  liveIndex: number | null;
  /** karts registados manualmente pela equipa */
  karts: Kart[];
  /** cópia do plano no momento da partida, reposta ao terminar */
  planSnapshot: Stint[] | null;
}

export interface ComputedStint extends Stint {
  index: number;
  driver: Driver | null;
  isPit: boolean;
  startOffset: number;
  endOffset: number;
  startAt: number;
  endAt: number;
  /** peso do piloto equipado + lastro, à passagem pela balança */
  weighInWeight: number;
  /** diferença para o mínimo regulamentar */
  weightDiff: number;
  suggestedBallast: number;
  /** penalização estimada (segundos) por falta de peso */
  weightPenalty: number;
  warnings: string[];
}

export interface DriverTotals {
  driver: Driver;
  totalDriving: number;
  stints: number;
  belowMin: boolean;
  aboveMax: boolean;
}

export interface RaceSummary {
  plannedMinutes: number;
  stops: number;
  requiredStops: number;
  missingStops: number;
  /** penalização estimada em voltas por paragens em falta */
  lapPenalty: number;
  /** paragens planeadas depois do fecho do pitlane */
  stopsAfterPitClose: number;
}
