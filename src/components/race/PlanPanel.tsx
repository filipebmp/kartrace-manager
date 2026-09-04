import { Check, Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { DurationField } from "@/components/race/DurationField";

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
import type { ComputedStint, Driver, Stint } from "@/lib/race/types";
import { useNow, useRace } from "@/lib/race/store";

interface PendingEdit {
  id: string;
  patch: Partial<Stint>;
}

interface CardProps {
  c: ComputedStint;
  displayNumber: number;
  isCurrent: boolean;
  drivers: Driver[];
  onSave: (edit: PendingEdit) => void;
  onDelete: (id: string) => void;
}

function PlanStintCard({ c, displayNumber, isCurrent, drivers, onSave, onDelete }: CardProps) {
  const [driverCode, setDriverCode] = useState<number | null>(c.driverCode);
  const [duration, setDuration] = useState<number>(c.duration);
  const [ballast, setBallast] = useState<number>(c.ballast);

  // Quando o turno muda por fora (recálculo do plano), repõe o rascunho.
  useEffect(() => {
    setDriverCode(c.driverCode);
    setDuration(c.duration);
    setBallast(c.ballast);
  }, [c.id, c.driverCode, c.duration, c.ballast]);

  const dirty =
    driverCode !== c.driverCode ||
    Math.abs(duration - c.duration) > 1e-9 ||
    ballast !== c.ballast;

  const save = () => {
    const patch: Partial<Stint> = {};
    if (driverCode !== c.driverCode) patch.driverCode = driverCode;
    if (Math.abs(duration - c.duration) > 1e-9) patch.duration = duration;
    if (ballast !== c.ballast) patch.ballast = ballast;
    onSave({ id: c.id, patch });
  };

  return (
    <div
      id={`plan-stint-${c.id}`}
      className={`panel p-3 ${isCurrent ? "ring-2 ring-primary" : ""} ${
        c.isPit ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="tabular w-6 text-xs text-muted-foreground">{displayNumber}</span>
          <select
            className="rounded-md border border-input bg-secondary px-2 py-1 text-sm"
            value={driverCode ?? ""}
            onChange={(e) =>
              setDriverCode(e.target.value === "" ? null : Number(e.target.value))
            }
          >
            <option value="">—</option>
            {drivers.map((d) => (
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
          <DurationField label="" value={duration} onChange={setDuration} />
        </div>

        <div>
          <Label className="text-[10px] uppercase text-muted-foreground">Lastro (kg)</Label>
          <Input
            type="number"
            value={ballast}
            onChange={(e) => setBallast(Number(e.target.value) || 0)}
            className="h-9"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!c.isPit && (
          <Badge variant="outline" className={`tabular ${c.weightDiff < 0 ? "text-destructive" : ""}`}>
            Balança: {c.weighInWeight.toFixed(1)} kg
          </Badge>
        )}
        {c.suggestedBallast > 0 && c.suggestedBallast !== ballast && !c.isPit && (
          <button
            type="button"
            onClick={() => setBallast(c.suggestedBallast)}
            className="rounded-md border border-warning/50 px-2 py-0.5 text-xs text-warning"
          >
            Sugerir {c.suggestedBallast} kg
          </button>
        )}

        <div className="ml-auto flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={save}
            disabled={!dirty}
            aria-label="Guardar alterações do turno"
          >
            <Check className={`size-4 ${dirty ? "text-primary" : "text-muted-foreground"}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(c.id)}
            aria-label="Remover turno"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>

      {c.warnings.length > 0 && (
        <p className="mt-2 text-xs text-destructive">{c.warnings.join(" · ")}</p>
      )}
    </div>
  );
}

export function PlanPanel() {
  const { state, updateStint, insertStintAfter, removeStint, setStints, setDrivers } = useRace();
  const now = useNow(15000);
  const [stintLength, setStintLength] = useState(60);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingEdit | null>(null);
  const [hidePitStints, setHidePitStints] = useState(false);
  const hasScrolled = useRef(false);
  const computed = computeStints(state);
  const idx = now === null ? -1 : (state.liveIndex ?? currentStintIndex(computed, now));
  const planned = totalPlanned(state.stints);
  const summary = raceSummary(state, computed);
  const visibleComputed = hidePitStints ? computed.filter((c) => !c.isPit) : computed;

  useEffect(() => {
    if (hasScrolled.current) return;
    if (idx < 0) return;
    const active = computed.find((c) => c.index === idx);
    if (!active) return;
    let target = visibleComputed.find((c) => c.index === idx);
    if (!target && hidePitStints && active.isPit) {
      const before = visibleComputed.filter((c) => c.index < idx);
      const after = visibleComputed.filter((c) => c.index > idx);
      target = before[before.length - 1] ?? after[0];
    }
    if (!target) return;
    const el = document.getElementById(`plan-stint-${target.id}`);
    if (el) {
      hasScrolled.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [idx, computed, visibleComputed, hidePitStints]);

  const confirmRemove = () => {
    if (confirmDelete) removeStint(confirmDelete);
    setConfirmDelete(null);
  };

  const confirmSave = () => {
    if (pendingEdit) updateStint(pendingEdit.id, pendingEdit.patch);
    setPendingEdit(null);
  };

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="stintLen" className="text-xs text-muted-foreground">
              Duração base do turno
            </Label>
            <DurationField label="" value={stintLength} onChange={(v) => setStintLength(v)} />
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Total planeado: <span className="tabular">{fmtDuration(planned)}</span> · Alvo:{" "}
            <span className="tabular">{fmtDuration(state.config.raceDuration)}</span>
          </p>
          <div className="flex items-center gap-2">
            <Switch
              id="hidePitStints"
              checked={hidePitStints}
              onCheckedChange={setHidePitStints}
            />
            <Label htmlFor="hidePitStints" className="text-xs text-muted-foreground">
              Ocultar boxes
            </Label>
          </div>
        </div>
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
        {visibleComputed.map((c, visiblePos) => (
          <PlanStintCard
            key={c.id}
            c={c}
            displayNumber={hidePitStints ? visiblePos + 1 : c.index + 1}
            isCurrent={idx === c.index}
            drivers={state.drivers}
            onSave={setPendingEdit}
            onDelete={setConfirmDelete}
          />
        ))}
      </div>

      <Button variant="secondary" className="w-full" onClick={() => insertStintAfter(null)}>
        <Plus className="size-4" /> Adicionar turno
      </Button>

      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover turno?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove o turno selecionado do plano. Não pode ser anulada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingEdit} onOpenChange={() => setPendingEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Guardar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              As alterações a este turno vão ser aplicadas. Os turnos seguintes que ainda
              não foram executados serão recalculados automaticamente até ao fim da prova;
              os turnos já executados mantêm-se como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Guardar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
