import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { KartIcon } from "@/components/race/KartIcon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRace } from "@/lib/race/store";
import type { KartRating } from "@/lib/race/types";

export const KART_RATINGS: { key: KartRating; label: string; plural: string }[] = [
  { key: "não sei", label: "Não sei", plural: "Não sei" },
  { key: "muito bom", label: "Muito bom", plural: "Muito bons" },
  { key: "bom", label: "Bom", plural: "Bons" },
  { key: "médio", label: "Médio", plural: "Médios" },
  { key: "mau", label: "Mau", plural: "Maus" },
  { key: "muito mau", label: "Muito mau", plural: "Muito maus" },
];

export function KartsPanel() {
  const { state, addKart, updateKart, removeKart } = useRace();
  const [number, setNumber] = useState("");
  const [rating, setRating] = useState<KartRating>("não sei");

  const karts = state.karts ?? [];

  function add() {
    const n = number.trim();
    if (!n) {
      toast.error("Indica o número do kart");
      return;
    }
    if (karts.some((k) => k.number.toLowerCase() === n.toLowerCase())) {
      toast.error("Esse kart já está registado");
      return;
    }
    addKart(n, rating);
    setNumber("");
    toast.success(`Kart ${n} adicionado`, { description: "Já aparece nos Karts utilizados." });
  }

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <KartIcon className="size-4" /> Adicionar kart
        </span>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-28">
            <Label htmlFor="kart-number" className="text-[10px] uppercase text-muted-foreground">
              Número
            </Label>
            <Input
              id="kart-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              inputMode="numeric"
              maxLength={8}
              placeholder="12"
            />
          </div>
          <div className="min-w-[10rem] flex-1">
            <Label htmlFor="kart-rating" className="text-[10px] uppercase text-muted-foreground">
              Classificação
            </Label>
            <select
              id="kart-rating"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={rating}
              onChange={(e) => setRating(e.target.value as KartRating)}
            >
              {KART_RATINGS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={add}>
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Karts registados ({karts.length})
        </div>
        {karts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Ainda não há karts registados. Adiciona o número e classifica-o.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {karts.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-14 font-mono text-base font-semibold">{k.number}</span>
                <select
                  aria-label={`Classificação do kart ${k.number}`}
                  className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                  value={k.rating}
                  onChange={(e) => updateKart(k.id, { rating: e.target.value as KartRating })}
                >
                  {KART_RATINGS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover kart ${k.number}`}
                  onClick={() => removeKart(k.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
