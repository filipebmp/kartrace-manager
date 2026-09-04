import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRace } from "@/lib/race/store";

interface RaceEvent {
  id: string;
  event: "box_start" | "box_end";
  stint_id: string;
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
      .select("id, event, stint_id, stint_label, event_at, meta")
      .eq("user_id", uid)
      .order("event_at", { ascending: true })
      .limit(50);
    setEvents((rows as RaceEvent[] | null) ?? []);
  }, []);

  // Recarrega ao montar e sempre que a corrida avança de turno (novo evento).
  // Sem corrida iniciada não há eventos a mostrar (limpa registos de corridas anteriores).
  useEffect(() => {
    if (!state.startedAt) {
      setEvents([]);
      return;
    }
    void load();
  }, [load, state.liveIndex, state.startedAt]);

  // Agrupa os eventos por paragem, em ordem cronológica.
  const groups = (() => {
    const map = new Map<string, RaceEvent[]>();
    for (const e of events) {
      const list = map.get(e.stint_id) ?? [];
      list.push(e);
      map.set(e.stint_id, list);
    }
    return [...map.entries()].map(([stintId, list]) => {
      const driver = list
        .map((e) => e.meta?.["driver_in_pit"])
        .find((v): v is string => typeof v === "string" && v.length > 0);
      const endEvent = list.find((e) => e.event === "box_end");
      return {
        stintId,
        driver: driver ?? null,
        realDuration: fmtReal(endEvent?.meta?.["actual_duration_sec"]),
        events: list,
      };
    });
  })();

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
          {groups.length} {groups.length === 1 ? "box" : "boxes"} · {open ? "Ocultar" : "Ver"}
        </span>
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border">
          {groups.length === 0 && (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              {!state.startedAt
                ? "A corrida ainda não iniciou — sem eventos."
                : "Ainda não há eventos registados nesta corrida."}
            </p>
          )}
          {groups.map((g, gi) => (
            <div key={g.stintId} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Box {gi + 1}
                  {g.driver ? ` · ${g.driver}` : ""}
                </span>
                {g.realDuration && (
                  <span className="tabular text-xs text-muted-foreground">
                    duração real {g.realDuration}
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {g.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      {e.event === "box_start" ? (
                        <ArrowDownToLine className="size-4 text-warning" />
                      ) : (
                        <ArrowUpFromLine className="size-4 text-success" />
                      )}
                      {e.event === "box_start" ? "Entrada na box" : "Saída da box"}
                    </span>
                    <span className="tabular font-medium">{fmtClockWithSeconds(e.event_at)}</span>
                  </li>
                ))}
                {!g.events.some((e) => e.event === "box_end") && (
                  <li className="text-xs text-muted-foreground">Paragem ainda a decorrer.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
