import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Check, Flag, Info, Square, Timer, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  burnableStints,
  computeStints,
  currentStintIndex,
  driveStintNumber,
  driveStintTotal,
  fmtClock,
  fmtCountdown,
  fmtDuration,
  fmtTimeOfDay,
  MIN,
  raceStartTs,
  planWarnings,
  raceSummary,

  totalPlanned,

} from "@/lib/race/engine";
import { toast } from "sonner";
import { useNow, useRace } from "@/lib/race/store";
import type { ComputedStint, RaceState } from "@/lib/race/types";
import { RaceEventLog } from "./RaceEventLog";



function Stat({
  label,
  value,
  hint,
  tone = "default",
  info,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  tone?: "default" | "warning" | "danger" | "success";
  info?: React.ReactNode;
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
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        {info ? (
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Como é calculado: ${label}`}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-xs leading-relaxed">
                {info}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>
      <p className={`tabular mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}


function actionTooltipContent(
  action: ComputedStint | undefined,
  state: RaceState,
  computed: ComputedStint[],
  now: number,
  previousDriver?: ComputedStint,
) {
  if (!action) return null;
  const elapsedMin = Math.max(0, (now - action.startAt) / MIN);
  const remainingMin = Math.max(0, (action.endAt - now) / MIN);
  if (action.isPit) {
    const driverInPit = previousDriver?.driver?.name ?? "—";
    return (
      <div className="space-y-1">
        <p className="font-semibold">Piloto em box: {driverInPit}</p>
        <p className="text-primary-foreground/80">Motivo: troca de kart (paragem obrigatória)</p>
        <p className="text-primary-foreground/80">
          {action.durationLocked
            ? `Tempo definido para esta box: ${fmtDuration(action.duration)}`
            : `Tempo do regulamento: mín. ${state.config.minPitDuration} min`}
        </p>
        <p className="text-primary-foreground/80">
          Decorrido: {fmtDuration(elapsedMin)} · Restante: {fmtDuration(remainingMin)}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="font-semibold">Piloto: {action.driver?.name ?? "—"}</p>
      <p className="text-primary-foreground/80">
        Turno {driveStintNumber(computed, action.index)} de {driveStintTotal(computed)}
      </p>
      <p className="text-primary-foreground/80">
        Duração: {fmtDuration(action.duration)} · Mínimo: {state.config.minStint} min · Máximo:{" "}
        {state.config.maxStint} min
      </p>
      <p className="text-primary-foreground/80">
        Decorrido: {fmtDuration(elapsedMin)} · Restante: {fmtDuration(remainingMin)}
      </p>
    </div>
  );
}

export function LiveDashboard() {

  const { state, start, stop, boxNow, endBoxNow, setBallast } = useRace();
  const now = useNow(200);
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
  // Estado da corrida para o indicador visível (explica um registo de eventos vazio).
  const raceStatus: "not_started" | "running" | "finished" = !running
    ? "not_started"
    : idx === -1 || idx >= computed.length
      ? "finished"
      : "running";
  const next = computed.slice(idx + 1).find((c) => !c.isPit);
  // Durante uma box mostramos a balança do piloto que vai entrar em pista
  const currentRacer = current?.isPit
    ? next ?? computed.slice(0, idx).reverse().find((c) => !c.isPit)
    : current;
  const nextAction =
    running && idx >= 0
      ? computed[idx + 1]
      : !running
        ? computed[0]
        : undefined;
  const nextIsPit = nextAction?.isPit ?? false;

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
      ? Math.max(
          0,
          current.startAt +
            (current.durationLocked ? current.duration : state.config.minPitDuration) * MIN -
            now,
        )
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
  // Turnos "rápidos" (ao tempo mínimo) que ainda permitem cumprir as paragens
  // obrigatórias antes do fecho do pitlane, sem exceder o turno máximo.
  const remainingStops = Math.max(0, summary.requiredStops - completedStops);
  const pitCloseAt = startTs + closeOffset * MIN;
  const minPit = state.config.minPitDuration;
  // Tempo de condução disponível até ao fecho, descontando as boxes que faltam.
  // (Boxes bloqueadas manualmente futuras usam a sua duração definida.)
  const futurePitMinutes = running
    ? computed
        .filter(
          (c) =>
            c.isPit &&
            c.endOffset <= closeOffset &&
            (c.endAt > now || c.index === idx),
        )
        .reduce((sum, c) => sum + (c.durationLocked ? c.duration : minPit), 0)
    : summary.stops * minPit;
  const drivingAvailableMin = running
    ? Math.max(0, (pitCloseAt - now) / MIN - futurePitMinutes)
    : Math.max(0, closeOffset - futurePitMinutes);
  const burnable = burnableStints(state.config, remainingStops, drivingAvailableMin);

  // Margem para cumprir as paragens obrigatórias antes do fecho do pitlane:
  // (S+1) turnos de condução ao mínimo + as boxes que faltam.
  const minDrivingNeeded = (remainingStops + 1) * state.config.minStint;
  const slackMin = drivingAvailableMin - minDrivingNeeded;
  const feasibility: "ok" | "tight" | "critical" =
    remainingStops === 0 ? "ok" : slackMin < 0 ? "critical" : slackMin < 30 ? "tight" : "ok";

  // Plano estimado dos turnos rápidos até ao fecho do pitlane
  const timeline = (() => {
    if (remainingStops === 0) return [];
    const slowCount = remainingStops + 1 - burnable;
    const slowMinutes = Math.max(0, drivingAvailableMin - burnable * state.config.minStint);
    const slowEach = slowCount > 0 ? slowMinutes / slowCount : 0;
    const items: {
      key: string;
      kind: "drive" | "pit" | "close";
      label: string;
      detail: string;
      at: number;
    }[] = [];
    let cursor = running ? now : startTs;
    for (let i = 0; i < remainingStops + 1; i++) {
      const fast = i < burnable;
      const dur = fast ? state.config.minStint : slowEach;
      items.push({
        key: `d${i}`,
        kind: "drive",
        label: fast ? `Turno rápido ${i + 1}` : `Turno ${i + 1}`,
        detail: `${fmtDuration(dur)}${fast ? ` · mínimo (${state.config.minStint} min)` : ""}`,
        at: cursor,
      });
      cursor += dur * MIN;
      if (i < remainingStops) {
        items.push({
          key: `p${i}`,
          kind: "pit",
          label: `Box ${i + 1} de ${remainingStops}`,
          detail: `Janela a partir das ${fmtTimeOfDay(cursor)} · ${minPit} min`,
          at: cursor,
        });
        cursor += minPit * MIN;
      }
    }
    items.push({
      key: "close",
      kind: "close",
      label: "Fecho do pitlane",
      detail: `Sem paragens obrigatórias depois desta hora`,
      at: pitCloseAt,
    });
    return items.slice(0, 13);
  })();



  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {state.config.eventName}
            </p>
            <h2 className="font-display text-xl font-bold">{state.config.teamName}</h2>
            <span
              className={
                raceStatus === "running"
                  ? "mt-1 inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success"
                  : raceStatus === "finished"
                    ? "mt-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                    : "mt-1 inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"
              }
            >
              <span
                className={
                  raceStatus === "running"
                    ? "size-1.5 animate-pulse rounded-full bg-success"
                    : raceStatus === "finished"
                      ? "size-1.5 rounded-full bg-muted-foreground"
                      : "size-1.5 rounded-full bg-warning"
                }
              />
              {raceStatus === "running"
                ? "Em andamento"
                : raceStatus === "finished"
                  ? "Finalizada"
                  : "Não iniciada"}
            </span>
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
                    ? `Terminar box · ${fmtCountdown(pitMinRemainingMs)}`
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
                    ? `Box em ${fmtCountdown(minStintRemainingMs)}`
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative overflow-hidden rounded-xl border-l-4 border-success bg-success/10 p-4">
                  <div className="absolute right-3 top-3">
                    {running && current && (
                      <Badge variant="default" className="gap-1 border-success/50 bg-success uppercase tracking-wider text-success-foreground hover:bg-success">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-foreground opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-success-foreground" />
                        </span>
                        Ao vivo
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-success">Ação em curso</p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-2xl font-bold">
                        {current?.isPit
                          ? "Box"
                          : current
                            ? (current.driver?.name ?? "—")
                            : running
                              ? "Fora de plano"
                              : "Ainda não arrancou"}
                      </h3>

                      <p className="text-sm text-muted-foreground">
                        {current?.isPit
                          ? `Paragem ${completedStops + 1} de ${summary.requiredStops} · ${current.durationLocked ? fmtDuration(current.duration) : `mín. ${state.config.minPitDuration} min`}`
                          : current
                            ? `Turno ${driveStintNumber(computed, idx)} de ${driveStintTotal(computed)}`
                            : running
                              ? "A corrida ultrapassou o plano"
                              : `Partida prevista ${fmtTimeOfDay(startTs)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                            Decorrido
                          </p>
                          <p className="tabular text-2xl font-bold leading-none text-foreground">
                            {current ? fmtClock(Math.max(0, now - current.startAt)) : "--:--:--"}
                          </p>
                        </div>
                        {!current?.isPit && (
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                              Tempo restante
                            </p>
                            <p
                              className={`tabular text-4xl font-bold leading-none ${
                                stintRemaining < 5 * MIN && current ? "text-warning" : "text-foreground"
                              }`}
                            >
                              {current ? fmtCountdown(stintRemaining) : "--:--:--"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {actionTooltipContent(current, state, computed, now, currentRacer)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Próxima ação */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-lg border-l-4 border-warning bg-warning/30 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-warning">
                    Próxima ação
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning">
                        {nextIsPit ? (
                          <ArrowDownToLine className="size-5 text-warning-foreground" />
                        ) : (
                          <Timer className="size-5 text-warning-foreground" />
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
                        {nextAction && !nextIsPit && nextAction.suggestedBallast > 0 && (
                          <>
                            <p className="mt-1 text-xs text-warning">
                              Precisa de {nextAction.suggestedBallast} kg de lastro para os{" "}
                              {state.config.minDriverWeight} kg
                            </p>
                            {nextAction.ballast >= nextAction.suggestedBallast ? (
                              <Badge
                                variant="outline"
                                className="mt-2 gap-1 border-success/50 text-success"
                              >
                                <Check className="size-3" /> Lastro confirmado ·{" "}
                                {nextAction.ballast} kg
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 h-8 gap-1 border-warning/60 text-warning"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setBallast(nextAction.id, nextAction.suggestedBallast);
                                  toast.success(
                                    `Lastro confirmado: ${nextAction.suggestedBallast} kg para ${nextAction.driver?.name ?? "o piloto"}`,
                                  );
                                }}
                              >
                                <Check className="size-4" /> Confirmar lastro
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {nextAction && running && (
                      <Badge variant="outline" className="shrink-0 tabular">
                        em {fmtCountdown(nextAction.startAt - now)}
                      </Badge>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {actionTooltipContent(nextAction, state, computed, now, currentRacer)}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
          value={running ? fmtClock(Math.max(0, raceElapsed)) : "00:00:00"}
          hint={`Partida ${fmtTimeOfDay(startTs)}`}
        />
        <Stat
          label="Falta terminar"
          value={running ? fmtCountdown(raceRemaining) : "--:--:--"}
          hint={`Plano: ${fmtDuration(planned)}`}
        />
        <Stat
          label="Lastro na troca"
          value={
            next
              ? next.suggestedBallast > 0
                ? `${next.suggestedBallast} kg`
                : "Sem lastro"
              : "—"
          }
          hint={
            next
              ? next.suggestedBallast > 0 && next.ballast >= next.suggestedBallast
                ? `Confirmado · ${next.driver?.name ?? "—"}`
                : `Próximo: ${next.driver?.name ?? "—"}`
              : undefined
          }
          tone={
            next && next.suggestedBallast > 0
              ? next.ballast >= next.suggestedBallast
                ? "success"
                : "warning"
              : "default"
          }
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
          label="Turnos rápidos"
          value={remainingStops === 0 && running ? "0" : String(burnable)}
          hint={
            remainingStops === 0 && running
              ? "Paragens obrigatórias cumpridas"
              : `Até ${burnable} turno(s) ao mínimo (${state.config.minStint} min) e ainda fazes as ${remainingStops} paragens antes do fecho, sem ultrapassar ${state.config.maxStint} min por piloto`
          }
          tone={
            feasibility === "critical"
              ? "danger"
              : feasibility === "tight"
                ? "warning"
                : burnable > 0
                  ? "success"
                  : "default"
          }
          info={
            <div className="space-y-1">
              <p className="font-semibold">Como é calculado</p>
              <p>
                Tempo até ao fecho do pitlane:{" "}
                {running ? fmtDuration(Math.max(0, (pitCloseAt - now) / MIN)) : fmtDuration(closeOffset)}
              </p>
              <p>
                Menos as {remainingStops} boxes que faltam ({minPit} min cada):{" "}
                {fmtDuration(futurePitMinutes)}
              </p>
              <p>Tempo de condução disponível: {fmtDuration(drivingAvailableMin)}</p>
              <p>
                Faltam {remainingStops} paragens → {remainingStops + 1} turnos de condução, nenhum
                acima de {state.config.maxStint} min.
              </p>
              <p>
                Turnos que podem ser feitos ao mínimo de {state.config.minStint} min sem que os
                restantes ultrapassem o máximo: <strong>{burnable}</strong>.
              </p>
              <p>Margem atual: {fmtDuration(slackMin)}</p>
            </div>
          }
        />

        <Stat
          label="Pitlane fecha"
          value={
            running
              ? fmtTimeOfDay(
                  startTs + (state.config.raceDuration - state.config.pitLaneClosesBefore) * MIN,
                )
              : "--:--"
          }
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
                  {!c.isPit && c.suggestedBallast > 0 && (
                    <Badge variant="outline" className="gap-1 border-warning/50 text-warning">
                      <AlertTriangle className="size-3" />
                      {c.suggestedBallast} kg
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

      <RaceEventLog />

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
