import { AlertTriangle, Flag, Fuel, Square, Timer, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ballastInstruction,
  computeStints,
  currentStintIndex,
  fmtClock,
  fmtDuration,
  fmtTimeOfDay,
  MIN,
  raceStartTs,
  totalPlanned,
} from "@/lib/race/engine";
import { useNow, useRace } from "@/lib/race/store";

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-foreground";
  return (
    <div className="panel p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={`tabular mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function LiveDashboard() {
  const { state, start, stop } = useRace();
  const now = useNow();
  const computed = computeStints(state);
  const startTs = raceStartTs(state);
  const planned = totalPlanned(state.stints);

  if (now === null) {
    return <div className="panel h-64 animate-pulse" aria-hidden />;
  }

  const running = state.startedAt !== null;
  const idx = currentStintIndex(computed, now);
  const current = idx >= 0 ? computed[idx] : undefined;
  const next = computed.slice(idx + 1).find((c) => !c.isPit);
  const currentRacer = current?.isPit
    ? computed.slice(0, idx).reverse().find((c) => !c.isPit)
    : current;

  const raceElapsed = now - startTs;
  const raceRemaining = startTs + planned * MIN - now;
  const stintRemaining = current ? current.endAt - now : 0;
  const fuelPct = current
    ? Math.max(
        0,
        Math.min(
          100,
          ((current.fuelStart - ((now - current.startAt) / MIN) * (state.config.fuelWeight / state.config.fuelAutonomy)) /
            state.config.fuelWeight) *
            100,
        ),
      )
    : 100;

  const alerts = current?.warnings ?? [];

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {state.config.eventName}
            </p>
            <h2 className="font-display text-xl font-bold">{state.config.teamName}</h2>
          </div>
          {running ? (
            <Button variant="destructive" size="sm" onClick={stop}>
              <Square className="size-4" /> Parar
            </Button>
          ) : (
            <Button size="sm" onClick={start}>
              <Flag className="size-4" /> Partida
            </Button>
          )}
        </div>

        <div className="px-4 py-5 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {current ? "Tempo para troca" : running ? "Fora de plano" : "Ainda não arrancou"}
          </p>
          <p
            className={`tabular text-5xl font-bold tracking-tight ${
              stintRemaining < 5 * MIN && current ? "text-warning" : "text-primary"
            }`}
          >
            {current ? fmtClock(stintRemaining) : "--:--:--"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Em pista
              </p>
              <p className="font-display text-lg font-semibold">
                {currentRacer?.driver?.name ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Turno {idx >= 0 ? idx + 1 : "—"} de {computed.length}
                {current?.isPit ? " · em boxes" : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Piloto seguinte
              </p>
              <p className="font-display text-lg font-semibold">{next?.driver?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {next ? `${fmtTimeOfDay(next.startAt)} · ${fmtDuration(next.duration)}` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a}
              className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle className="size-4 shrink-0" /> {a}
            </div>
          ))}
        </div>
      )}

      <div className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Fuel className="size-4" /> Combustível
          </p>
          <span className="tabular text-sm">
            {(((fuelPct / 100) * state.config.fuelWeight) as number).toFixed(1)} kg ·{" "}
            {Math.round((fuelPct / 100) * state.config.fuelAutonomy)} min
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div className="heat-bar h-full transition-[width]" style={{ width: `${fuelPct}%` }} />
        </div>
        {next?.refuel ? (
          <p className="mt-2 text-xs text-warning">Abastecer na próxima paragem</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Tempo de corrida"
          value={running ? fmtClock(raceElapsed) : "00:00:00"}
          hint={`Partida ${fmtTimeOfDay(startTs)}`}
        />
        <Stat
          label="Falta terminar"
          value={fmtClock(raceRemaining)}
          hint={`Plano: ${fmtDuration(planned)}`}
        />
        <Stat
          label="Lastro na troca"
          value={ballastInstruction(current, next)}
          tone={current && next && current.ballast !== next.ballast ? "warning" : "default"}
        />
        <Stat
          label="Peso do conjunto"
          value={current ? `${Math.round(current.combinedWeight)} kg` : "—"}
          hint={`Mínimo ${state.config.minTotalWeight} kg`}
          tone={!current ? "default" : current.weightDiff < 0 ? "danger" : "success"}
        />
      </div>

      <div className="panel p-4">
        <p className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Timer className="size-4" /> Próximos turnos
        </p>
        <ul className="space-y-2">
          {computed
            .slice(Math.max(idx, 0), Math.max(idx, 0) + 6)
            .map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md bg-secondary/60 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="tabular text-xs text-muted-foreground">
                    {fmtTimeOfDay(c.startAt)}
                  </span>
                  <span className="text-sm font-medium">{c.driver?.name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {c.refuel && (
                    <Badge variant="outline" className="border-warning/50 text-warning">
                      GAS
                    </Badge>
                  )}
                  {c.ballast > 0 && (
                    <Badge variant="outline" className="gap-1">
                      <Weight className="size-3" />
                      {c.ballast}
                    </Badge>
                  )}
                  <span className="tabular text-xs text-muted-foreground">
                    {fmtDuration(c.duration)}
                  </span>
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
