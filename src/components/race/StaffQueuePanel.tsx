import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Link2,
  Pencil,
  Plus,
  Radio,
  RotateCcw,
  Trash2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  type FilaDTO,
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

const CORES_SUGERIDAS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#db2777",
  "#0891b2",
];

function GradeBadge({ grade, manual }: { grade: number | null | undefined; manual?: boolean }) {
  if (grade === null || grade === undefined) return null;
  return (
    <Badge variant="outline" className={`text-[10px] ${GRADE_BADGE_CLASS[grade] ?? ""}`}>
      {manual ? "✎" : "★"} {grade}/5
    </Badge>
  );
}

function KartChip({
  kart,
  grade,
  onEditar,
}: {
  kart: KartDTO | undefined;
  grade?: number | null | undefined;
  onEditar?: () => void;
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
      <GradeBadge grade={grade} manual={kart.rating_manual !== null} />
      {kart.notas ? (
        <span className="text-xs text-muted-foreground" title={kart.notas}>
          <AlertTriangle className="size-3.5" />
        </span>
      ) : null}
      {onEditar ? (
        <button
          type="button"
          onClick={onEditar}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Editar kart ${kart.label}`}
        >
          <Pencil className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Painel de gestão do sorteio de karts entre todas as equipas — filas
 * customizáveis (criar/remover, nome+cor livres), tal como no regulamento
 * do evento. Consome o backend Python (`kart-endurance/`) que processa a
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">Desligar</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desligar do Live Timing?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isto para a ligação a <span className="font-mono">{liveStatus.event_url}</span>.
                    O sistema deixa de receber tempos e pits até ligares outra vez.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDesligar}>Desligar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
  const {
    triarKart,
    sortearKart,
    marcarForaDeServico,
    reintegrarKart,
    criarFila,
    removerFila,
    renomearKart,
    definirRatingManual,
    removerKart,
  } = actions;
  const [atribuirAlvo, setAtribuirAlvo] = useState<{
    filaId: string;
    kartId: string;
    corFila: string;
  } | null>(null);
  const [motivoAvaria] = useState<Record<string, string>>({});
  const [kartEmEdicao, setKartEmEdicao] = useState<string | null>(null);
  const [novaFilaNome, setNovaFilaNome] = useState("");
  const [novaFilaCor, setNovaFilaCor] = useState<string>(CORES_SUGERIDAS[0] ?? "#dc2626");

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

  async function handleTriar(kartId: string, filaId: string) {
    try {
      await triarKart(kartId, filaId);
    } catch (e) {
      toast.error("Não foi possível triar o kart", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleConfirmarAtribuicao(numeroEquipa: string) {
    if (!atribuirAlvo) return;
    try {
      await sortearKart(atribuirAlvo.filaId, numeroEquipa, atribuirAlvo.kartId);
      toast.success(`Kart atribuído à equipa ${numeroEquipa}`);
      setAtribuirAlvo(null);
    } catch (e) {
      toast.error("Não foi possível atribuir", {
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

  async function handleCriarFila() {
    const nome = novaFilaNome.trim();
    if (!nome) {
      toast.error("Dá um nome à fila");
      return;
    }
    try {
      await criarFila(nome, novaFilaCor);
      toast.success(`Fila "${nome}" criada`);
      setNovaFilaNome("");
    } catch (e) {
      toast.error("Não foi possível criar a fila", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleRemoverFila(filaId: string, nome: string) {
    try {
      await removerFila(filaId);
      toast.success(`Fila "${nome}" removida`);
    } catch (e) {
      toast.error("Não foi possível remover a fila", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  const karts = Object.values(snapshot.karts);
  const foraDeServico = karts.filter((k) => k.state === "FORA_DE_SERVICO");
  const kartEditando = kartEmEdicao ? (snapshot.karts[kartEmEdicao] ?? null) : null;

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
                Karts que acabaram de entrar em PITIN. Classifica cada um numa fila.
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
                        <KartChip
                          kart={kart}
                          grade={gradeOf(kart.id)}
                          onEditar={() => setKartEmEdicao(kart.id)}
                        />
                        <div className="flex flex-wrap gap-2">
                          {snapshot.filas.map((fila) => (
                            <Button
                              key={fila.fila_id}
                              size="sm"
                              style={{ backgroundColor: fila.cor }}
                              className="text-white hover:opacity-90"
                              onClick={() => handleTriar(kart.id, fila.fila_id)}
                            >
                              {fila.nome}
                            </Button>
                          ))}
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

          <div className="scrollbar-slim flex gap-3 overflow-x-auto pb-3">
            {snapshot.filas.map((fila) => (
              <QueueCard
                key={fila.fila_id}
                fila={fila}
                karts={snapshot.karts}
                ratings={ratings}
                onAtribuir={(kartId) =>
                  setAtribuirAlvo({ filaId: fila.fila_id, kartId, corFila: fila.cor })
                }
                onRemover={() => handleRemoverFila(fila.fila_id, fila.nome)}
                onEditarKart={(kartId) => setKartEmEdicao(kartId)}
              />
            ))}

            <div className="min-w-[220px] rounded-lg border border-dashed border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Plus className="size-4" /> Nova fila
              </div>
              <Input
                value={novaFilaNome}
                onChange={(e) => setNovaFilaNome(e.target.value)}
                placeholder="Nome (ex: Verde)"
                className="mb-2"
              />
              <div className="mb-2 flex flex-wrap gap-1.5">
                {CORES_SUGERIDAS.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setNovaFilaCor(cor)}
                    className={`size-6 rounded-full border-2 ${
                      novaFilaCor === cor ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: cor }}
                    aria-label={`Cor ${cor}`}
                  />
                ))}
              </div>
              <Button size="sm" className="w-full" onClick={handleCriarFila}>
                Criar fila
              </Button>
            </div>
          </div>

          <AtribuirDialog
            alvo={atribuirAlvo}
            onCancel={() => setAtribuirAlvo(null)}
            onConfirmar={handleConfirmarAtribuicao}
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

      <KartEditDialog
        kart={kartEditando}
        onClose={() => setKartEmEdicao(null)}
        onRenomear={renomearKart}
        onDefinirRatingManual={definirRatingManual}
        onRemover={removerKart}
      />
    </div>
  );
}

function KartEditDialog({
  kart,
  onClose,
  onRenomear,
  onDefinirRatingManual,
  onRemover,
}: {
  kart: KartDTO | null;
  onClose: () => void;
  onRenomear: (kartId: string, label: string) => Promise<void>;
  onDefinirRatingManual: (kartId: string, grade: number | null) => Promise<void>;
  onRemover: (kartId: string) => Promise<void>;
}) {
  const [novoLabel, setNovoLabel] = useState("");

  async function handleGuardarNome() {
    if (!kart) return;
    try {
      await onRenomear(kart.id, novoLabel.trim() || kart.id);
      toast.success("Kart renomeado");
    } catch (e) {
      toast.error("Não foi possível renomear", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleRating(grade: number | null) {
    if (!kart) return;
    try {
      await onDefinirRatingManual(kart.id, grade);
      toast.success(
        grade === null ? "Rating voltou a automático" : `Rating manual definido: ${grade}`,
      );
    } catch (e) {
      toast.error("Não foi possível definir o rating", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleRemover() {
    if (!kart) return;
    try {
      await onRemover(kart.id);
      toast.success("Kart removido");
      onClose();
    } catch (e) {
      toast.error("Não foi possível remover o kart", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <Dialog
      open={kart !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
        else setNovoLabel(kart?.label ?? "");
      }}
    >
      <DialogContent>
        {kart ? (
          <>
            <DialogHeader>
              <DialogTitle>Editar kart {kart.id}</DialogTitle>
              <DialogDescription>
                Renomear, ajustar o rating manualmente, ou remover.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase text-muted-foreground">Nome / etiqueta</label>
                <div className="mt-1 flex gap-2">
                  <Input
                    value={novoLabel}
                    onChange={(e) => setNovoLabel(e.target.value)}
                    placeholder={kart.label}
                  />
                  <Button onClick={handleGuardarNome}>Guardar</Button>
                </div>
              </div>

              <div>
                <label className="text-xs uppercase text-muted-foreground">
                  Rating manual (substitui o automático)
                </label>
                <div className="mt-1 flex gap-1.5">
                  {[5, 4, 3, 2, 1].map((g) => (
                    <Button
                      key={g}
                      size="sm"
                      variant={kart.rating_manual === g ? "default" : "outline"}
                      onClick={() => handleRating(g)}
                    >
                      {g}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant={kart.rating_manual === null ? "default" : "outline"}
                    onClick={() => handleRating(null)}
                  >
                    <Wand2 className="size-3.5" /> Auto
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="size-3.5" /> Apagar kart
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar o kart {kart.id}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isto remove o kart por completo do sistema (diferente de "fora de serviço").
                      Usa isto só para corrigir um kart criado por engano.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRemover}>Apagar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="size-3.5" /> Fechar
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
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
  fila,
  karts,
  ratings,
  onAtribuir,
  onRemover,
  onEditarKart,
}: {
  fila: FilaDTO;
  karts: Record<string, KartDTO>;
  ratings: Record<string, KartRatingDTO> | null;
  onAtribuir: (kartId: string) => void;
  onRemover: () => void;
  onEditarKart: (kartId: string) => void;
}) {
  return (
    <div className="flex min-w-[220px] max-w-[260px] flex-1 flex-col overflow-hidden rounded-lg border border-border">
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: fila.cor }}
      >
        <span className="font-semibold text-white">{fila.nome}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/80">{fila.kart_ids.length}</span>
          {fila.kart_ids.length === 0 ? (
            <button
              type="button"
              onClick={onRemover}
              className="text-white/80 hover:text-white"
              aria-label={`Remover fila ${fila.nome}`}
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 space-y-2 bg-card p-2">
        {fila.kart_ids.length === 0 ? (
          <p className="px-1 py-3 text-center text-xs text-muted-foreground">Fila vazia</p>
        ) : (
          fila.kart_ids.map((id, i) => (
            <div key={id} className="rounded-md border border-border p-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{i + 1}º</span>
                <KartChip
                  kart={karts[id]}
                  grade={ratings?.[id]?.grade}
                  onEditar={() => onEditarKart(id)}
                />
              </div>
              {i === 0 ? (
                <Button
                  size="sm"
                  style={{ backgroundColor: fila.cor }}
                  className="w-full text-white hover:opacity-90"
                  onClick={() => onAtribuir(id)}
                >
                  <ArrowRight className="size-3.5" /> Atribuir
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AtribuirDialog({
  alvo,
  onCancel,
  onConfirmar,
}: {
  alvo: { filaId: string; kartId: string; corFila: string } | null;
  onCancel: () => void;
  onConfirmar: (numeroEquipa: string) => void;
}) {
  const [numero, setNumero] = useState("");

  return (
    <Dialog open={alvo !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        {alvo ? (
          <>
            <DialogHeader>
              <DialogTitle>Atribuir kart {alvo.kartId}</DialogTitle>
              <DialogDescription>
                A que equipa vai este kart? (a que está a sair da box agora)
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Número da equipa (ex: 12)"
              inputMode="numeric"
              onKeyDown={(e) => {
                if (e.key === "Enter" && numero.trim()) onConfirmar(numero.trim());
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button
                style={{ backgroundColor: alvo.corFila }}
                className="text-white hover:opacity-90"
                disabled={!numero.trim()}
                onClick={() => onConfirmar(numero.trim())}
              >
                Confirmar
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
