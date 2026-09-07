import { useState } from "react";
import { Plus, Trash2, Radio, Wand2 } from "lucide-react";
import { KartIcon } from "@/components/race/KartIcon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useRace } from "@/lib/race/store";
import type { KartRating } from "@/lib/race/types";
import { useKartFeed, type PerformanceCategory } from "@/lib/kartFeed/kartFeedClient";

export const KART_RATINGS: { key: KartRating; label: string; plural: string }[] = [
  { key: "não sei", label: "Não sei", plural: "Não sei" },
  { key: "muito bom", label: "Muito bom", plural: "Muito bons" },
  { key: "bom", label: "Bom", plural: "Bons" },
  { key: "médio", label: "Médio", plural: "Médios" },
  { key: "mau", label: "Mau", plural: "Maus" },
  { key: "muito mau", label: "Muito mau", plural: "Muito maus" },
];

/** Mapeia a categoria automática do Live Timing (3 níveis) para a escala
 * usada nesta app (6 níveis). "Muito bom"/"Muito mau" ficam de fora do
 * mapeamento automático por agora — a classificação vinda do backend só
 * distingue BOM/MEDIO/MAU, por isso o extremo fica sempre uma afinação
 * manual da equipa, não uma sugestão automática. */
const AUTO_CATEGORY_TO_RATING: Record<PerformanceCategory, KartRating | null> = {
  BOM: "bom",
  MEDIO: "médio",
  MAU: "mau",
  SEM_DADOS: null,
};

const CATEGORY_LABEL: Record<PerformanceCategory, string> = {
  BOM: "Bom",
  MEDIO: "Médio",
  MAU: "Mau",
  SEM_DADOS: "Sem dados",
};

const CATEGORY_BADGE_CLASS: Record<PerformanceCategory, string> = {
  BOM: "border-emerald-500/40 text-emerald-500",
  MEDIO: "border-amber-500/40 text-amber-500",
  MAU: "border-red-500/40 text-red-500",
  SEM_DADOS: "border-muted-foreground/30 text-muted-foreground",
};

export function KartsPanel() {
  const { state, addKart, updateKart, removeKart } = useRace();
  const [number, setNumber] = useState("");
  const [rating, setRating] = useState<KartRating>("não sei");
  const { snapshot, status } = useKartFeed();

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
      {status === "online" ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-500">
          <Radio className="size-3.5 animate-pulse" />
          Live Timing ligado — classificação automática disponível por kart
        </div>
      ) : null}

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
            {karts.map((k) => {
              const equipaLive = snapshot?.equipas[k.number];
              const categoriaLive = equipaLive?.ultima_categoria ?? null;
              const sugestao = categoriaLive ? AUTO_CATEGORY_TO_RATING[categoriaLive] : null;
              const sugestaoDiferente = sugestao !== null && sugestao !== k.rating;

              return (
                <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="w-14 font-mono text-base font-semibold">{k.number}</span>

                  {categoriaLive && categoriaLive !== "SEM_DADOS" ? (
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${CATEGORY_BADGE_CLASS[categoriaLive]}`}
                      title={
                        equipaLive?.ultimo_tempo_seconds
                          ? `Última volta: ${equipaLive.ultimo_tempo_seconds.toFixed(3)}s`
                          : undefined
                      }
                    >
                      Ao vivo: {CATEGORY_LABEL[categoriaLive]}
                    </Badge>
                  ) : null}

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

                  {sugestaoDiferente ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        updateKart(k.id, { rating: sugestao! });
                        toast.success(`Kart ${k.number} classificado como "${sugestao}"`, {
                          description: "Aplicado a partir do Live Timing.",
                        });
                      }}
                    >
                      <Wand2 className="size-3.5" /> Usar automático
                    </Button>
                  ) : null}

                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover kart ${k.number}`}
                    onClick={() => removeKart(k.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
