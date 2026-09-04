import { Download, RefreshCcw, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { defaultConfig } from "@/lib/race/engine";
import { useRace } from "@/lib/race/store";
import type { RaceState } from "@/lib/race/types";


function Field({
  label,
  value,
  onChange,
  type = "number",
  suffix,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  suffix?: string;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        {suffix ? ` (${suffix})` : ""}
      </Label>
      <Input type={type} className="h-9" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SettingsPanel() {
  const { state, setConfig, setPlannedStart, reset, replaceState } = useRace();
  const c = state.config;
  const fileRef = useRef<HTMLInputElement>(null);
  const [proOpen, setProOpen] = useState(false);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "corrida-24h.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as RaceState;
      if (!parsed.config || !Array.isArray(parsed.drivers)) throw new Error("inválido");
      replaceState(parsed);
      toast.success("Configuração importada");
    } catch {
      toast.error("Ficheiro inválido");
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 p-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Equipa</p>
        <Field label="Equipa" type="text" value={c.teamName} onChange={(v) => setConfig({ teamName: v })} />
        <Field
          label="Prova"
          type="text"
          value={c.eventName}
          onChange={(v) => setConfig({ eventName: v })}
        />
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Data/hora de partida
          </Label>
          <Input
            type="datetime-local"
            className="h-9"
            value={state.plannedStart}
            onChange={(e) => setPlannedStart(e.target.value)}
          />
        </div>
      </div>

      <div className="panel grid grid-cols-2 gap-3 p-4">
        <div className="col-span-2 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Regulamento
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setProOpen(true)}
          >
            <RefreshCcw className="size-3" /> Valores Pro
          </Button>
        </div>
        <Field
          label="Duração da prova"
          suffix="min"
          value={c.raceDuration}
          onChange={(v) => setConfig({ raceDuration: Number(v) || 0 })}
        />
        <Field
          label="Peso mín. piloto equipado"
          suffix="kg"
          value={c.minDriverWeight}
          onChange={(v) => setConfig({ minDriverWeight: Number(v) || 0 })}
        />
        <Field
          label="Turno mínimo"
          suffix="min"
          value={c.minStint}
          onChange={(v) => setConfig({ minStint: Number(v) || 0 })}
        />
        <Field
          label="Turno máximo"
          suffix="min"
          value={c.maxStint}
          onChange={(v) => setConfig({ maxStint: Number(v) || 0 })}
        />
        <Field
          label="Condução mínima / piloto"
          suffix="min"
          value={c.minTotalDriving}
          onChange={(v) => setConfig({ minTotalDriving: Number(v) || 0 })}
        />
        <Field
          label="Condução máxima (alvo)"
          suffix="min"
          value={c.maxTotalDriving}
          onChange={(v) => setConfig({ maxTotalDriving: Number(v) || 0 })}
        />
        <Field
          label="Paragens obrigatórias"
          value={c.mandatoryStops}
          onChange={(v) => setConfig({ mandatoryStops: Number(v) || 0 })}
        />
        <Field
          label="Paragem mínima"
          suffix="min"
          value={c.minPitDuration}
          onChange={(v) => setConfig({ minPitDuration: Number(v) || 0 })}
        />
        <Field
          label="Paragem planeada"
          suffix="min"
          value={c.pitDuration}
          onChange={(v) => setConfig({ pitDuration: Number(v) || 0 })}
        />
        <Field
          label="Pitlane fecha antes do fim"
          suffix="min"
          value={c.pitLaneClosesBefore}
          onChange={(v) => setConfig({ pitLaneClosesBefore: Number(v) || 0 })}
        />
      </div>


      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={exportJson}>
          <Download className="size-4" /> Exportar
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Importar
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = "";
          }}
        />
      </div>
      <Button variant="ghost" className="w-full text-destructive" onClick={reset}>
        <RotateCcw className="size-4" /> Repor valores por omissão
      </Button>
    </div>
  );
}
