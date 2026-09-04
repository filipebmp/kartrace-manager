import { ArrowDown, ArrowUp, Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  computeStints,
  currentStintIndex,
  ensurePitDriver,
  fmtDuration,
  fmtTimeOfDay,
  generatePlan,
  raceSummary,
  totalPlanned,
} from "@/lib/race/engine";
import { useNow, useRace } from "@/lib/race/store";

export function PlanPanel() {
  const { state, updateStint, insertStintAfter, removeStint, moveStint, setStints, setDrivers } =
    useRace();
  const now = useNow(15000);
  const [stintLength, setStintLength] = useState(60);
  const computed = computeStints(state);
  const idx =
    now === null ? -1 : (state.liveIndex ?? currentStintIndex(computed, now));
  const planned = totalPlanned(state.stints);
  const summary = raceSummary(state, computed);


  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="stintLen" className="text-xs text-muted-foreground">
              Duração base do turno (min)
            </Label>
            <Input
              id="stintLen"
              type="number"
              value={stintLength}
              onChange={(e) => setStintLength(Number(e.target.value) || 0)}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              const drivers = ensurePitDriver(state.drivers);
              if (drivers.length !== state.drivers.length) setDrivers(drivers);
              setStints(generatePlan(drivers, state.config, stintLength));
            }}
          >
            <Wand2 className="size-4" /> Gerar plano
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Total planeado: <span className="tabular">{fmtDuration(planned)}</span> · Alvo:{" "}
          <span className="tabular">{fmtDuration(state.config.raceDuration)}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Paragens: <span className="tabular">{summary.stops}</span> de{" "}
          <span className="tabular">{summary.requiredStops}</span> obrigatórias
          {summary.missingStops > 0 ? (
            <span className="text-destructive"> · −{summary.lapPenalty} voltas de penalização</span>
          ) : null}
          {summary.stopsAfterPitClose > 0 ? (
            <span className="text-destructive">
              {" "}
              · {summary.stopsAfterPitClose} depois do fecho do pitlane
            </span>
          ) : null}
        </p>

      </div>

      <div className="space-y-2">
        {computed.map((c) => (
          <div
            key={c.id}
            className={`panel p-3 ${idx === c.index ? "ring-2 ring-primary" : ""} ${
              c.isPit ? "opacity-80" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="tabular w-6 text-xs text-muted-foreground">{c.index + 1}</span>
                <select
                  className="rounded-md border border-input bg-secondary px-2 py-1 text-sm"
                  value={c.driverCode ?? ""}
                  onChange={(e) =>
                    updateStint(c.id, {
                      driverCode: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">—</option>
                  {state.drivers.map((d) => (
                    <option key={d.id} value={d.code}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <span className="tabular text-xs text-muted-foreground">
                {fmtTimeOfDay(c.startAt)} → {fmtTimeOfDay(c.endAt)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Duração</Label>
                <Input
                  type="number"
                  value={c.duration}
                  onChange={(e) => updateStint(c.id, { duration: Number(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Lastro (kg)</Label>
                <Input
                  type="number"
                  value={c.ballast}
                  onChange={(e) => updateStint(c.id, { ballast: Number(e.target.value) || 0 })}
                  className="h-9"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!c.isPit && (
                <Badge
                  variant="outline"
                  className={`tabular ${c.weightDiff < 0 ? "text-destructive" : ""}`}
                >
                  Balança: {c.weighInWeight.toFixed(1)} kg
                </Badge>
              )}
              {c.suggestedBallast > 0 && c.suggestedBallast !== c.ballast && !c.isPit && (
                <button
                  type="button"
                  onClick={() => updateStint(c.id, { ballast: c.suggestedBallast })}
                  className="rounded-md border border-warning/50 px-2 py-0.5 text-xs text-warning"
                >
                  Sugerir {c.suggestedBallast} kg
                </button>
              )}

              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => moveStint(c.id, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => moveStint(c.id, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => insertStintAfter(c.id)}>
                  <Plus className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => removeStint(c.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>

            {c.warnings.length > 0 && (
              <p className="mt-2 text-xs text-destructive">{c.warnings.join(" · ")}</p>
            )}
          </div>
        ))}
      </div>

      <Button variant="secondary" className="w-full" onClick={() => insertStintAfter(null)}>
        <Plus className="size-4" /> Adicionar turno
      </Button>
    </div>
  );
}
