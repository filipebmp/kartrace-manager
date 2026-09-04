import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRace } from "@/lib/race/store";

interface RaceEvent {
  id: string;
  event: "box_start" | "box_end";
  stint_label: string;
  event_at: string;
  meta: Record<string, unknown>;
}

function fmtClockWithSeconds(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function fmtReal(sec: unknown): string | null {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Registo imutável dos eventos de box, com timestamps ao segundo, para auditoria. */
export function RaceEventLog() {
  const { state } = useRace();
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    const { data: rows } = await supabase
      .from("race_event_log")
      .select("id, event, stint_label, event_at, meta")
      .eq("user_id", uid)
      .order("event_at", { ascending: false })
      .limit(50);
    setEvents((rows as RaceEvent[] | null) ?? []);
  }, []);

  // Recarrega ao montar e sempre que a corrida avança de turno (novo evento).
  useEffect(() => {
    void load();
  }, [load, state.liveIndex, state.startedAt]);

  return (
    <div className="panel">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ScrollText className="size-4 text-muted-foreground" />
          Registo de eventos (auditoria)
        </span>
        <span className="text-xs text-muted-foreground">
          {events.length} {events.length === 1 ? "evento" : "eventos"} · {open ? "Ocultar" : "Ver"}
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {events.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">
              Ainda não há eventos registados nesta corrida.
            </li>
          )}
          {events.map((e) => {
            const real = fmtReal(e.meta?.["actual_duration_sec"]);
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  {e.event === "box_start" ? (
                    <ArrowDownToLine className="size-4 text-warning" />
                  ) : (
                    <ArrowUpFromLine className="size-4 text-success" />
                  )}
                  {e.event === "box_start" ? "Box iniciada" : "Box terminada"}
                  {typeof e.meta?.["driver_in_pit"] === "string" && e.meta["driver_in_pit"]
                    ? ` · ${e.meta["driver_in_pit"]}`
                    : ""}
                </span>
                <span className="text-right">
                  <span className="tabular block text-sm font-medium">
                    {fmtClockWithSeconds(e.event_at)}
                  </span>
                  {e.event === "box_end" && real && (
                    <span className="tabular block text-xs text-muted-foreground">
                      duração real {real}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
