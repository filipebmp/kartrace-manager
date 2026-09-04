import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function parse(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function DurationField({
  label,
  value,
  onChange,
  showSeconds = true,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
  showSeconds?: boolean;
}) {
  const totalSeconds = Math.round(value * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const update = (newH: number, newM: number, newS: number) => {
    onChange((newH * 3600 + newM * 60 + newS) / 60);
  };

  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <Input
            type="number"
            min={0}
            className="h-9"
            value={h}
            onChange={(e) => update(parse(e.target.value), m, s)}
          />
          <span className="text-[10px] text-muted-foreground">h</span>
        </div>
        <span className="pb-4 text-muted-foreground">:</span>
        <div className="flex-1">
          <Input
            type="number"
            min={0}
            max={59}
            className="h-9"
            value={String(m).padStart(2, "0")}
            onChange={(e) => update(h, parse(e.target.value), s)}
          />
          <span className="text-[10px] text-muted-foreground">m</span>
        </div>
        {showSeconds && (
          <>
            <span className="pb-4 text-muted-foreground">:</span>
            <div className="flex-1">
              <Input
                type="number"
                min={0}
                max={59}
                className="h-9"
                value={String(s).padStart(2, "0")}
                onChange={(e) => update(h, m, parse(e.target.value))}
              />
              <span className="text-[10px] text-muted-foreground">s</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
