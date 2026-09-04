export type BoxOrder = "BT" | "TB";

export interface Driver {
  id: string;
  code: number;
  name: string;
  weight: number;
  isPit?: boolean;
}

export interface Stint {
  id: string;
  driverCode: number | null;
  /** duração em minutos */
  duration: number;
  /** lastro colocado no kart (kg) */
  ballast: number;
  note?: string;
}

export interface RaceConfig {
  teamName: string;
  eventName: string;
  /** duração total da prova em minutos */
  raceDuration: number;
  minTotalWeight: number;
  kartWeight: number;
  maxStint: number;
  maxTotalDriving: number;
  minTotalDriving: number;
  restBetweenStints: number;
  boxOrder: BoxOrder;
  pitDuration: number;
}

export interface RaceState {
  config: RaceConfig;
  drivers: Driver[];
  stints: Stint[];
  /** timestamp (ms) da partida real, null = não iniciada */
  startedAt: number | null;
  /** hora planeada de partida (ISO local) usada antes de arrancar */
  plannedStart: string;
}

export interface ComputedStint extends Stint {
  index: number;
  driver: Driver | null;
  isPit: boolean;
  startOffset: number;
  endOffset: number;
  startAt: number;
  endAt: number;
  combinedWeight: number;
  weightDiff: number;
  suggestedBallast: number;
  warnings: string[];
}

export interface DriverTotals {
  driver: Driver;
  totalDriving: number;
  stints: number;
  belowMin: boolean;
  aboveMax: boolean;
}
