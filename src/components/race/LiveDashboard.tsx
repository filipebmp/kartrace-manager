import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Flag, Square, Timer, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ballastInstruction,
  computeStints,
  currentStintIndex,
  fmtClock,
  fmtDuration,
  fmtTimeOfDay,
  MIN,
  raceStartTs,
  planWarnings,
  raceSummary,

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
  const { state, start, stop, boxNow, endBoxNow } = useRace();
  const now = useNow();
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmBox, setConfirmBox] = useState(false);
  const computed = computeStints(state);
  const startTs = raceStartTs(state);
  const planned = totalPlanned(state.stints);
  const summary = raceSummary(state, computed);


  if (now === null) {
    return <div className="panel h-64 animate-pulse" aria-hidden />;
  }

  const running = state.startedAt !== null;
  const idx = running ? (state.liveIndex ?? currentStintIndex(computed, now)) : -1;
  const current = idx >= 0 && idx < computed.length ? computed[idx] : undefined;
  const next = computed.slice(idx + 1).find((c) => !c.isPit);
  const currentRacer = current?.isPit
    ? computed.slice(0, idx).reverse().find((c) => !c.isPit)
    : current;
  const nextAction =
    running && idx >= 0
      ? computed[idx + 1]
      : !running
        ? computed[0]
        : undefined;
  const nextIsPit = nextAction?.isPit ?? false;
  console.log({ idx, currentIsPit: current?.isPit, driverName: current?.driver?.name, driverCode: current?.driverCode, firstStint: computed[0] });

  const raceElapsed = now - startTs;

  const raceRemaining = startTs + planned * MIN - now;
  const stintRemaining = current ? current.endAt - now : 0;
  const stintElapsedMin = current ? (now - current.startAt) / MIN : 0;
  const belowMinStint =
    !!current && !current.isPit && stintElapsedMin < state.config.minStint;
  const minStintRemainingMs =
    current && !current.isPit
      ? Math.max(0, current.startAt + state.config.minStint * MIN - now)
      : 0;
  // Tempo que falta até a box cumprir a permanência mínima regulamentar
  const pitMinRemainingMs =
    current?.isPit
      ? Math.max(0, current.startAt + state.config.minPitDuration * MIN - now)
      : 0;
  const handleBoxClick = () => {
    if (belowMinStint) setConfirmBox(true);
    else boxNow();
  };
  const alerts = [...(current?.warnings ?? []), ...planWarnings(state, computed)];
  // Paragens concluídas (e válidas: terminadas antes do fecho do pitlane)
  const closeOffset = state.config.raceDuration - state.config.pitLaneClosesBefore;
  const completedStops = running
    ? computed.filter(
        (c) => c.isPit && c.endOffset <= closeOffset && c.endAt <= now && c.index !== idx,
      ).length
    : 0;

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
            <div className="flex gap-2">
              {current?.isPit ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-warning/50 text-warning"
                  onClick={endBoxNow}
                >
                  <ArrowUpFromLine className="size-4" />
                  {pitMinRemainingMs > 0
                    ? `Terminar box · ${fmtClock(pitMinRemainingMs)}`
                    : "Terminar box"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-warning/50 text-warning"
                  onClick={handleBoxClick}
                  disabled={!current}
                >
                  <ArrowDownToLine className="size-4" />
                  {belowMinStint
                    ? `Box em ${fmtClock(minStintRemainingMs)}`
                    : "Box"}
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={() => setConfirmStop(true)}>
                <Square className="size-4" /> Parar
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={start}>
              <Flag className="size-4" /> Partida
            </Button>
          )}
        </div>

        <div className="space-y-3 px-4 py-5">
          {/* Ação em curso */}
          <div className="relative overflow-hidden rounded-xl border-l-4 border-primary bg-primary/10 p-4">
            <div className="absolute right-3 top-3">
              {running && current && (
                <Badge variant="default" className="gap-1 uppercase tracking-wider">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground" />
                  </span>
                  Ao vivo
                </Badge>
              )}
            </div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary">Ação em curso</p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate font-display text-2xl font-bold">
                  {current?.isPit
                    ? "Box"
                    : current?.driver?.name ?? running
                      ? "Fora de plano"
                      : "Ainda não arrancou"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {current?.isPit
                    ? `Paragem ${completedStops + 1} de ${summary.requiredStops} · mín. ${state.config.minPitDuration} min`
                    : current
                      ? `Turno ${idx >= 0 ? idx + 1 : "—"} de ${computed.length}`
                      : running
                        ? "A corrida ultrapassou o plano"
                        : `Partida prevista ${fmtTimeOfDay(startTs)}`}
                </p>
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Tempo restante
                </p>
                <p
                  className={`tabular text-4xl font-bold leading-none ${
                    stintRemaining < 5 * MIN && current ? "text-warning" : "text-foreground"
                  }`}
                >
                  {current ? fmtClock(stintRemaining) : "--:--:--"}
                </p>
              </div>
            </div>
          </div>

          {/* Próxima ação */}
          <div className="rounded-lg border-l-4 border-secondary bg-secondary/30 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Próxima ação
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                  {nextIsPit ? (
                    <ArrowDownToLine className="size-5 text-muted-foreground" />
                  ) : (
                    <Timer className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold">
                    {nextIsPit ? "Box" : nextAction?.driver?.name ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nextAction
                      ? nextIsPit
                        ? `Troca de kart · ${fmtTimeOfDay(nextAction.startAt)}`
                        : `Início ${fmtTimeOfDay(nextAction.startAt)} · ${fmtDuration(nextAction.duration)}`
                      : running
                        ? "Fora de plano"
                        : "Gere o plano e clica em Partida"}
                  </p>
                </div>
              </div>
              {nextAction && (
                <Badge variant="outline" className="shrink-0 tabular">
                  em {fmtClock(nextAction.startAt - now)}
                </Badge>
              )}
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
          label="Balança do piloto"
          value={currentRacer ? `${currentRacer.weighInWeight.toFixed(1)} kg` : "—"}
          hint={`Mínimo ${state.config.minDriverWeight} kg equipado`}
          tone={!currentRacer ? "default" : currentRacer.weightDiff < 0 ? "danger" : "success"}
        />
        <Stat
          label="Paragens"
          value={`${completedStops} / ${summary.requiredStops}`}
          hint={
            running
              ? completedStops >= summary.requiredStops
                ? "Obrigatórias cumpridas"
                : `Faltam ${summary.requiredStops - completedStops}`
              : `Plano prevê ${summary.stops} paragens`
          }
          tone={
            running && completedStops >= summary.requiredStops ? "success" : "default"
          }
        />
        <Stat
          label="Pitlane fecha"
          value={fmtTimeOfDay(
            startTs + (state.config.raceDuration - state.config.pitLaneClosesBefore) * MIN,
          )}
          hint={
            summary.stopsAfterPitClose > 0
              ? `${summary.stopsAfterPitClose} paragens depois do fecho`
              : "Todas as paragens dentro do prazo"
          }
          tone={summary.stopsAfterPitClose > 0 ? "danger" : "default"}
        />

      </div>

      <div className="panel p-4">
        <p className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Timer className="size-4" /> Próximos turnos
        </p>
        <ul className="space-y-2">
          {computed
            .slice(running ? idx + 1 : 0, (running ? idx + 1 : 0) + 6)
            .map((c, i) => (
              <li
                key={c.id}
                className={`flex items-center justify-between rounded-md px-3 py-2 ${
                  i === 0
                    ? "border border-primary/30 bg-primary/5"
                    : "bg-secondary/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  {i === 0 && (
                    <Badge variant="default" className="text-[10px] uppercase">
                      Próximo
                    </Badge>
                  )}
                  <span className="tabular text-xs text-muted-foreground">
                    {fmtTimeOfDay(c.startAt)}
                  </span>
                  <span className="text-sm font-medium">{c.driver?.name ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
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

      <AlertDialog open={confirmBox} onOpenChange={setConfirmBox}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turno abaixo do mínimo</AlertDialogTitle>
            <AlertDialogDescription>
              O piloto ainda não cumpriu o tempo mínimo de turno ({state.config.minStint} min).
              Queres mesmo assim mandar o piloto para a box?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                boxNow();
                setConfirmBox(false);
              }}
            >
              Fazer box
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar a corrida?</AlertDialogTitle>
            <AlertDialogDescription>
              A cronometragem é interrompida e o plano volta ao estado anterior à partida. Esta
              ação não pode ser anulada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                stop();
                setConfirmStop(false);
              }}
            >
              Terminar corrida
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
