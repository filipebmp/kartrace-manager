import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeStints, driverTotals, fmtDuration } from "@/lib/race/engine";
import { useRace } from "@/lib/race/store";

export function DriversPanel() {
  const { state, addDriver, updateDriver, removeDriver } = useRace();
  const computed = computeStints(state);
  const totals = driverTotals(state, computed);

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <p className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Tempo de condução
        </p>
        <ul className="space-y-2">
          {totals.map((t) => {
            const pct = Math.min(
              100,
              (t.totalDriving / Math.max(state.config.maxTotalDriving, 1)) * 100,
            );
            return (
              <li key={t.driver.id}>
                <div className="flex items-center justify-between text-sm">
                  <span>{t.driver.name}</span>
                  <span
                    className={`tabular ${
                      t.aboveMax ? "text-destructive" : t.belowMin ? "text-warning" : "text-success"
                    }`}
                  >
                    {fmtDuration(t.totalDriving)} · {t.stints} turnos
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${
                      t.aboveMax ? "bg-destructive" : t.belowMin ? "bg-warning" : "bg-success"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Mínimo {fmtDuration(state.config.minTotalDriving)} · Máximo{" "}
          {fmtDuration(state.config.maxTotalDriving)} por piloto
        </p>
      </div>

      <div className="space-y-2">
        {state.drivers.map((d) => (
          <div key={d.id} className="panel flex items-end gap-2 p-3">
            <div className="w-14">
              <Label className="text-[10px] uppercase text-muted-foreground">Cód.</Label>
              <Input
                type="number"
                className="h-9"
                value={d.code}
                onChange={(e) => updateDriver(d.id, { code: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="flex-1">
              <Label className="text-[10px] uppercase text-muted-foreground">Nome</Label>
              <Input
                className="h-9"
                value={d.name}
                onChange={(e) => updateDriver(d.id, { name: e.target.value })}
              />
            </div>
            <div className="w-20">
              <Label className="text-[10px] uppercase text-muted-foreground">Peso</Label>
              <Input
                type="number"
                className="h-9"
                value={d.weight}
                onChange={(e) => updateDriver(d.id, { weight: Number(e.target.value) || 0 })}
              />
            </div>
            <Button size="icon" variant="ghost" onClick={() => removeDriver(d.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="secondary" className="w-full" onClick={addDriver}>
        <Plus className="size-4" /> Adicionar piloto
      </Button>
    </div>
  );
}
