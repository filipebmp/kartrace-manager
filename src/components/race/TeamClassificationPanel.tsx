import { toast } from "sonner";
import { Trophy, HelpCircle, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useEquipasParaClassificar,
  useDefinirEquipaTier,
  type TeamSkillTier,
} from "@/lib/kartFeed/kartFeedClient";

const TIER_LABEL: Record<TeamSkillTier, string> = {
  TOPO: "Topo",
  MEDIA: "Média",
  DESCONHECIDA: "Desconhecida",
};

const TIER_BADGE_CLASS: Record<TeamSkillTier, string> = {
  TOPO: "border-emerald-500/40 text-emerald-500",
  MEDIA: "border-amber-500/40 text-amber-500",
  DESCONHECIDA: "border-muted-foreground/30 text-muted-foreground",
};

function formatLapTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutos = Math.floor(seconds / 60);
  const resto = (seconds - minutos * 60).toFixed(3).padStart(6, "0");
  return `${minutos}:${resto}`;
}

/** Painel para o staff classificar cada equipa (Topo/Média/Desconhecida)
 * depois de ver os tempos dos treinos — usado pelo kart_rating.py do
 * backend para acelerar a convergência do rating de karts logo no início
 * da corrida. Ver server.py: GET /staff/equipas, POST /staff/equipa_tier. */
export function TeamClassificationPanel() {
  const { data: equipas, error } = useEquipasParaClassificar();
  const definirTier = useDefinirEquipaTier();

  async function handleDefinirTier(numeroEquipa: string, tier: TeamSkillTier | null) {
    try {
      await definirTier(numeroEquipa, tier);
    } catch (e) {
      toast.error("Não foi possível classificar a equipa", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sem ligação ao backend</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!equipas) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>A carregar equipas…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Classificar equipas (treinos)</CardTitle>
        <CardDescription>
          Ordenadas pelo melhor tempo. Classifica cada equipa depois de veres os treinos — isto
          ajuda o sistema a avaliar os karts mais depressa logo no início da corrida.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {equipas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há equipas com voltas registadas.
          </p>
        ) : (
          equipas.map((eq, i) => (
            <div
              key={eq.numero_equipa}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}º</span>
                <span className="font-mono text-sm font-semibold">{eq.numero_equipa}</span>
                {eq.nome ? <span className="text-sm text-muted-foreground">{eq.nome}</span> : null}
                <span className="font-mono text-xs text-muted-foreground">
                  {formatLapTime(eq.melhor_tempo_seconds)} · {eq.total_voltas} voltas
                </span>
                {eq.tier_atual ? (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${TIER_BADGE_CLASS[eq.tier_atual]}`}
                  >
                    {TIER_LABEL[eq.tier_atual]}
                  </Badge>
                ) : null}
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={eq.tier_atual === "TOPO" ? "default" : "outline"}
                  onClick={() => handleDefinirTier(eq.numero_equipa, "TOPO")}
                >
                  <Trophy className="size-3.5" /> Topo
                </Button>
                <Button
                  size="sm"
                  variant={eq.tier_atual === "MEDIA" ? "default" : "outline"}
                  onClick={() => handleDefinirTier(eq.numero_equipa, "MEDIA")}
                >
                  <Minus className="size-3.5" /> Média
                </Button>
                <Button
                  size="sm"
                  variant={eq.tier_atual === "DESCONHECIDA" ? "default" : "outline"}
                  onClick={() => handleDefinirTier(eq.numero_equipa, "DESCONHECIDA")}
                >
                  <HelpCircle className="size-3.5" /> Desconhecida
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
