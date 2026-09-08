import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Link2,
  Radio,
  RotateCcw,
  Shuffle,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useKartFeed,
  useKartFeedActions,
  useKartRatings,
  useKartForecast,
  useLiveTimingStatus,
  useSetLiveTimingTarget,
  useDisconnectLiveTimingTarget,
  type KartDTO,
  type KartRatingDTO,
  type KartFeedStatus,
  type KartFeedSnapshot,
} from "@/lib/kartFeed/kartFeedClient";
import { TeamClassificationPanel } from "@/components/race/TeamClassificationPanel";

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  BOM: "border-emerald-500/40 text-emerald-500",
  MEDIO: "border-amber-500/40 text-amber-500",
  MAU: "border-red-500/40 text-red-500",
  SEM_DADOS: "border-muted-foreground/30 text-muted-foreground",
};

const GRADE_BADGE_CLASS: Record<number, string> = {
  5: "border-emerald-500/40 text-emerald-500",
  4: "border-emerald-500/30 text-emerald-400",
  3: "border-amber-500/40 text-amber-500",
  2: "border-red-500/30 text-red-400",
  1: "border-red-500/40 text-red-500",
};

function GradeBadge({ grade }: { grade: number | null | undefined }) {
  if (grade === null || grade === undefined) return null;
  return (
    <Badge variant="outline" className={`text-[10px] ${GRADE_BADGE_CLASS[grade] ?? ""}`}>
      ★ {grade}/5
    </Badge>
  );
}

function KartChip({
  kart,
  grade,
}: {
  kart: KartDTO | undefined;
  grade?: number | null | undefined;
}) {
  if (!kart) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
      <span className="font-mono text-sm font-semibold">{kart.label}</span>
      <Badge
        variant="outline"
        className={`text-[10px] ${CATEGORY_BADGE_CLASS[kart.ultima_categoria]}`}
      >
        {kart.ultima_categoria}
      </Badge>
      <GradeBadge grade={grade} />
      {kart.notas ? (
        <span className="text-xs text-muted-foreground" title={kart.notas}>
          <AlertTriangle className="size-3.5" />
        </span>
      ) : null}
    </div>
  );
}

/** Painel de gestão do sorteio de karts entre todas as equipas — Fila de
 * Espera/Triagem, Fila Vermelha e Fila Azul, tal como no regulamento do
 * evento. Consome o backend Python (`kart-endurance/`) que processa a
 * telemetria do Live Timing; ver `kartFeedClient.ts`. */
export function StaffQueuePanel() {
  const { snapshot, status } = useKartFeed();
  const actions = useKartFeedActions();
  const { data: ratings } = useKartRatings(status === "online");

  if (status === "disabled") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Live Timing não configurado</CardTitle>
          <CardDescription>
            Define <code>VITE_KART_BACKEND_WS_URL</code> e <code>VITE_KART_BACKEND_HTTP_URL</code>{" "}
            para ligar este painel ao backend de gestão de karts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <LiveTimingConnectionCard />
      <StaffQueueContent
        status={status}
        snapshot={snapshot}
        ratings={ratings ?? null}
        actions={actions}
      />
    </div>
  );
}

function LiveTimingConnectionCard() {
  const { data: liveStatus, error } = useLiveTimingStatus();
  const setTarget = useSetLiveTimingTarget();
  const disconnect = useDisconnectLiveTimingTarget();
  const [eventUrl, setEventUrl] = useState("");

  async function handleLigar() {
    const url = eventUrl.trim();
    if (!url) {
      toast.error("Cola o link do live timing (ex: http://live.apex-timing.com/kip-palmela/)");
      return;
    }
    try {
      await setTarget(url);
      toast.success("Pedido de ligação enviado — o adapter liga-se em poucos segundos.");
    } catch (e) {
      toast.error("Não foi possível definir o alvo", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleDesligar() {
    try {
      await disconnect();
      toast.success("Ligação ao live timing terminada.");
    } catch (e) {
      toast.error("Não foi possível desligar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" /> Ligação ao Live Timing
        </CardTitle>
        <CardDescription>
          Cola o link normal da página de live timing da pista (ex.:{" "}
          <code>http://live.apex-timing.com/kip-palmela/</code>). Fica ligado até desligares
          manualmente — não precisas de mexer no servidor para trocar de pista.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            value={eventUrl}
            onChange={(e) => setEventUrl(e.target.value)}
            placeholder="http://live.apex-timing.com/kip-palmela/"
            className="max-w-md"
          />
          <Button onClick={handleLigar}>Ligar</Button>
          {liveStatus?.event_url ? (
            <Button variant="outline" onClick={handleDesligar}>
              Desligar
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="text-sm text-muted-foreground">
            Sem ligação ao backend para consultar o estado.
          </p>
        ) : !liveStatus ? (
          <p className="text-sm text-muted-foreground">A carregar estado…</p>
        ) : !liveStatus.event_url ? (
          <p className="text-sm text-muted-foreground">Nenhuma pista definida neste momento.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {liveStatus.connected ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                <Radio className="size-3 animate-pulse" /> Ligado
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                A ligar…
              </Badge>
            )}
            <span className="font-mono text-xs text-muted-foreground">{liveStatus.event_url}</span>
            {liveStatus.detail ? (
              <span className="text-xs text-muted-foreground">— {liveStatus.detail}</span>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Painel de gestão do sorteio de karts entre todas as equipas — Fila de
 * Espera/Triagem, Fila Vermelha e Fila Azul, tal como no regulamento do
 * evento. Consome o backend Python (`kart-endurance/`) que processa a
 * telemetria do Live Timing; ver `kartFeedClient.ts`. */
function StaffQueueContent({
  status,
  snapshot,
  ratings,
  actions,
}: {
  status: KartFeedStatus;
  snapshot: KartFeedSnapshot | null;
  ratings: Record<string, KartRatingDTO> | null;
  actions: ReturnType<typeof useKartFeedActions>;
}) {
  const { triarKart, sortearKart, marcarForaDeServico, reintegrarKart } = actions;
  const [numeroEquipaSorteio, setNumeroEquipaSorteio] = useState("");
  const [motivoAvaria, setMotivoAvaria] = useState<Record<string, string>>({});

  if (status !== "online" || !snapshot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="size-4 animate-pulse text-muted-foreground" />
            {status === "connecting" ? "A ligar ao Live Timing…" : "Sem ligação ao backend"}
          </CardTitle>
          <CardDescription>
            {status === "offline"
              ? "A tentar reconectar automaticamente."
              : "Aguarda o primeiro estado completo."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const gradeOf = (kartId: string): number | null | undefined => ratings?.[kartId]?.grade;
  const kartsEspera = snapshot.fila_espera.map((id) => snapshot.karts[id]);

  async function handleTriar(kartId: string, cor: "VERMELHA" | "AZUL") {
    try {
      await triarKart(kartId, cor);
    } catch (e) {
      toast.error("Não foi possível triar o kart", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleSortear(cor: "VERMELHA" | "AZUL", kartId?: string) {
    const numero = numeroEquipaSorteio.trim();
    if (!numero) {
      toast.error("Indica o número da equipa que está a sair da box");
      return;
    }
    try {
      await sortearKart(cor, numero, kartId);
      toast.success(`Kart atribuído à equipa ${numero}`);
      setNumeroEquipaSorteio("");
    } catch (e) {
      toast.error("Não foi possível sortear", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleForaDeServico(kartId: string) {
    const motivo = motivoAvaria[kartId] ?? "";
    try {
      await marcarForaDeServico(kartId, motivo);
      toast.success(`Kart ${kartId} marcado como fora de serviço`);
    } catch (e) {
      toast.error("Não foi possível marcar fora de serviço", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleReintegrar(kartId: string) {
    try {
      await reintegrarKart(kartId, "fila_espera");
      toast.success(`Kart ${kartId} reintegrado na Fila de Espera`);
    } catch (e) {
      toast.error("Não foi possível reintegrar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  const karts = Object.values(snapshot.karts);
  const foraDeServico = karts.filter((k) => k.state === "FORA_DE_SERVICO");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-500">
        <Radio className="size-3.5 animate-pulse" />
        Live Timing ligado — {karts.length} karts monitorizados
      </div>

      <Tabs defaultValue="fila">
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="previsao">Previsão</TabsTrigger>
          <TabsTrigger value="classificar">Classificar Equipas</TabsTrigger>
        </TabsList>

        <TabsContent value="fila" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fila de Espera / Triagem</CardTitle>
              <CardDescription>
                Karts que acabaram de entrar em PITIN. Classifica cada um em Vermelha ou Azul.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {kartsEspera.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem karts à espera de triagem.</p>
              ) : (
                kartsEspera.map(
                  (kart) =>
                    kart && (
                      <div
                        key={kart.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                      >
                        <KartChip kart={kart} grade={gradeOf(kart.id)} />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => handleTriar(kart.id, "VERMELHA")}
                          >
                            Fila Vermelha
                          </Button>
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleTriar(kart.id, "AZUL")}
                          >
                            Fila Azul
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleForaDeServico(kart.id)}
                          >
                            <Wrench className="size-3.5" /> Avariado
                          </Button>
                        </div>
                      </div>
                    ),
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shuffle className="size-4" /> Sortear kart para equipa
              </CardTitle>
              <CardDescription>
                Indica o número da equipa que está a sair da box, depois escolhe a fila. Sem
                selecionar um kart específico, usa-se sempre o primeiro da fila (FIFO).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={numeroEquipaSorteio}
                onChange={(e) => setNumeroEquipaSorteio(e.target.value)}
                placeholder="Número da equipa (ex: 12)"
                inputMode="numeric"
                className="max-w-[12rem]"
              />
            </CardContent>
          </Card>

          <QueueCard
            titulo="Fila Vermelha"
            cor="VERMELHA"
            corClasse="bg-red-600 hover:bg-red-700"
            kartIds={snapshot.fila_vermelha.kart_ids}
            karts={snapshot.karts}
            ratings={ratings}
            onSortear={(kartId) => handleSortear("VERMELHA", kartId)}
          />

          <QueueCard
            titulo="Fila Azul"
            cor="AZUL"
            corClasse="bg-blue-600 hover:bg-blue-700"
            kartIds={snapshot.fila_azul.kart_ids}
            karts={snapshot.karts}
            ratings={ratings}
            onSortear={(kartId) => handleSortear("AZUL", kartId)}
          />

          {foraDeServico.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="size-4" /> Fora de serviço
                </CardTitle>
                <CardDescription>
                  Karts retirados por avaria/dano. Reintegra quando reparados.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {foraDeServico.map((kart) => (
                  <div
                    key={kart.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{kart.label}</span>
                      {kart.notas ? (
                        <span className="text-xs text-muted-foreground">{kart.notas}</span>
                      ) : null}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleReintegrar(kart.id)}>
                      <RotateCcw className="size-3.5" /> Reintegrar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="previsao">
          <ForecastPanel />
        </TabsContent>

        <TabsContent value="classificar">
          <TeamClassificationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ForecastPanel() {
  const { data: previsao, error } = useKartForecast();

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

  if (!previsao) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>A carregar previsão…</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const ordenados = [...previsao].sort((a, b) => {
    if (a.minutos_ate_disponivel !== b.minutos_ate_disponivel) {
      return a.minutos_ate_disponivel - b.minutos_ate_disponivel;
    }
    return (b.grade ?? 0) - (a.grade ?? 0);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-4" /> Previsão de disponibilidade
        </CardTitle>
        <CardDescription>
          Quando cada kart fica livre, e se vale a pena esperar por ele. Karts fora de serviço não
          aparecem aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {ordenados.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem karts em pista ou em fila neste momento.
          </p>
        ) : (
          ordenados.map((p) => (
            <div
              key={p.kart_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{p.kart_id}</span>
                <GradeBadge grade={p.grade} />
              </div>
              <div className="flex items-center gap-2 text-sm">
                {p.status === "disponivel_agora" ? (
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                    Disponível agora
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">
                    ~{p.minutos_ate_disponivel} min
                    {p.confianca_tempo === "baixa" ? " (estimativa pouco fiável ainda)" : ""}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function QueueCard({
  titulo,
  corClasse,
  kartIds,
  karts,
  ratings,
  onSortear,
}: {
  titulo: string;
  cor: "VERMELHA" | "AZUL";
  corClasse: string;
  kartIds: string[];
  karts: Record<string, KartDTO>;
  ratings: Record<string, KartRatingDTO> | null;
  onSortear: (kartId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{kartIds.length} kart(s) em espera de sorteio, por ordem.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {kartIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Fila vazia.</p>
        ) : (
          kartIds.map((id, i) => (
            <div
              key={id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}º</span>
                <KartChip kart={karts[id]} grade={ratings?.[id]?.grade} />
              </div>
              {i === 0 ? (
                <Button size="sm" className={corClasse} onClick={() => onSortear(id)}>
                  <ArrowRight className="size-3.5" /> Atribuir
                </Button>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
