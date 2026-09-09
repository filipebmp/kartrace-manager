import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  GripVertical,
  Link2,
  Minus,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Square,
  Trash2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  useResetSessionData,
  useDemoStatus,
  useStartDemo,
  useStopDemo,
  useRatingConfig,
  useSetRatingTiers,
  useSetRatingBestNLaps,
  useBoxConfig,
  useSetNumeroFilasPadrao,
  useAplicarNumeroFilasPadrao,
  type KartDTO,
  type KartRatingDTO,
  type EquipaDTO,
  type KartFeedStatus,
  type KartFeedSnapshot,
  type FilaDTO,
  type RatingTierDTO,
} from "@/lib/kartFeed/kartFeedClient";
import { TeamClassificationPanel } from "@/components/race/TeamClassificationPanel";

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
  const resetSessionData = useResetSessionData();
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

  async function handleLimparSessao() {
    try {
      const resumo = await resetSessionData();
      toast.success(
        `Dados antigos limpos: ${resumo.equipas_removidas} equipa(s), ${resumo.karts_removidos} kart(s).`,
      );
    } catch (e) {
      toast.error("Não foi possível limpar os dados", {
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Limpar dados da sessão</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar dados da sessão anterior?</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove todas as equipas/karts detetados automaticamente pelo Live Timing (os que
                  aparecem como "r80", "r81", etc.) e o respetivo histórico de rating — usa isto
                  quando o Apex Timing muda de sessão e os dados antigos ainda aparecem. Isto tenta
                  fazer-se sozinho quando deteta o fim de uma sessão, mas nem sempre é possível
                  confirmar automaticamente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleLimparSessao}>Limpar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
    retirarDaFila,
    adicionarAFilaManual,
    moverKart,
    definirCapacidadeFila,
  } = actions;
  // Arrastar karts entre filas: baseado em eventos de ponteiro nativos do
  // document (não sintéticos do React nem HTML5 drag) — mais fiável entre
  // browsers, e funciona igual com rato e dedo (touch). Usamos refs para
  // ler os valores mais recentes dentro dos listeners (evita o problema
  // clássico de "closure antigo" com o React).
  const [dragInfo, setDragInfo] = useState<{
    kartId: string;
    filaOrigemId: string;
    x: number;
    y: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ filaId: string; index: number } | null>(null);
  const dropTargetRef = useRef<{ filaId: string; index: number } | null>(null);
  const dragInfoRef = useRef<{ kartId: string; filaOrigemId: string } | null>(null);

  function handlePointerDownOnHandle(e: ReactPointerEvent, kartId: string, filaOrigemId: string) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let comecouArrastar = false;

    function aoMover(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!comecouArrastar) {
        if (Math.hypot(dx, dy) < 6) return; // limiar — evita confundir um toque com arrasto
        comecouArrastar = true;
        dragInfoRef.current = { kartId, filaOrigemId };
        setDragInfo({ kartId, filaOrigemId, x: ev.clientX, y: ev.clientY });
      } else {
        setDragInfo({ kartId, filaOrigemId, x: ev.clientX, y: ev.clientY });
      }

      const elemento = document.elementFromPoint(ev.clientX, ev.clientY);
      const alvo = elemento?.closest("[data-drop-fila]") as HTMLElement | null;
      let novoAlvo = alvo
        ? { filaId: alvo.dataset["dropFila"] as string, index: Number(alvo.dataset["dropIndex"]) }
        : null;

      // Se estamos a reordenar DENTRO da mesma fila, o kart vai ser
      // removido da posição atual ANTES de ser reinserido — o que desloca
      // tudo o que vem depois uma posição para trás. Corrigimos aqui para
      // a pré-visualização (e o pedido final) apontarem para o sítio
      // certo, não para "uma posição a mais".
      if (novoAlvo && novoAlvo.filaId === filaOrigemId) {
        const filaAtual = snapshot?.filas.find((f) => f.fila_id === filaOrigemId);
        const indiceAtual = filaAtual?.kart_ids.indexOf(kartId) ?? -1;
        if (indiceAtual !== -1 && novoAlvo.index > indiceAtual) {
          novoAlvo = { ...novoAlvo, index: novoAlvo.index - 1 };
        }
      }

      dropTargetRef.current = novoAlvo;
      setDropTarget(novoAlvo);
    }

    function aoLargar() {
      document.removeEventListener("pointermove", aoMover);
      document.removeEventListener("pointerup", aoLargar);
      document.removeEventListener("pointercancel", aoLargar);

      if (dragInfoRef.current && dropTargetRef.current) {
        handleMoverKart(
          dragInfoRef.current.kartId,
          dropTargetRef.current.filaId,
          dropTargetRef.current.index,
        );
      }
      dragInfoRef.current = null;
      dropTargetRef.current = null;
      setDragInfo(null);
      setDropTarget(null);
    }

    document.addEventListener("pointermove", aoMover);
    document.addEventListener("pointerup", aoLargar);
    document.addEventListener("pointercancel", aoLargar);
  }
  const [pendingRelocacao, setPendingRelocacao] = useState<{
    kartId: string;
    filaId: string;
    localizacaoAtual: string;
  } | null>(null);
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

  async function handleRetirarDaFila(kartId: string) {
    try {
      await retirarDaFila(kartId);
      toast.success(`Kart ${kartId} retirado da fila`);
    } catch (e) {
      toast.error("Não foi possível retirar da fila", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleAdicionarManual(kartId: string, filaId: string) {
    try {
      const resultado = await adicionarAFilaManual(kartId, filaId);
      if (resultado.status === "precisa_confirmacao") {
        setPendingRelocacao({ kartId, filaId, localizacaoAtual: resultado.localizacaoAtual });
        return;
      }
      toast.success(`Kart ${kartId} adicionado à fila`);
    } catch (e) {
      toast.error("Não foi possível adicionar o kart", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleConfirmarRelocacao() {
    if (!pendingRelocacao) return;
    const { kartId, filaId } = pendingRelocacao;
    try {
      await adicionarAFilaManual(kartId, filaId, true);
      toast.success(`Kart ${kartId} movido para esta fila`);
    } catch (e) {
      toast.error("Não foi possível mover o kart", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setPendingRelocacao(null);
    }
  }

  async function handleMoverKart(kartId: string, filaDestinoId: string, novaPosicao?: number) {
    try {
      await moverKart(kartId, filaDestinoId, novaPosicao);
    } catch (e) {
      toast.error("Não foi possível mover o kart", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleDefinirCapacidade(filaId: string, capacidade: number | null) {
    try {
      await definirCapacidadeFila(filaId, capacidade);
    } catch (e) {
      toast.error("Não foi possível ajustar os slots", {
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
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="classificar">Classificar Equipas</TabsTrigger>
          <TabsTrigger value="demo">Demo</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
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

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
            {snapshot.filas.map((fila) => (
              <QueueCard
                key={fila.fila_id}
                fila={fila}
                karts={snapshot.karts}
                equipas={snapshot.equipas}
                ratings={ratings}
                onAtribuir={(kartId) =>
                  setAtribuirAlvo({ filaId: fila.fila_id, kartId, corFila: fila.cor })
                }
                onRemover={() => handleRemoverFila(fila.fila_id, fila.nome)}
                onEditarKart={(kartId) => setKartEmEdicao(kartId)}
                onRetirarDaFila={handleRetirarDaFila}
                onAdicionarManual={handleAdicionarManual}
                onDefinirCapacidade={handleDefinirCapacidade}
                dragInfo={dragInfo}
                dropTarget={dropTarget}
                onPointerDownOnHandle={handlePointerDownOnHandle}
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

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardPanel
            snapshot={snapshot}
            ratings={ratings}
            onEditarKart={(kartId) => setKartEmEdicao(kartId)}
          />
          <ForecastPanel />
        </TabsContent>

        <TabsContent value="classificar">
          <TeamClassificationPanel />
        </TabsContent>

        <TabsContent value="demo">
          <DemoPanel />
        </TabsContent>

        <TabsContent value="config">
          <ConfiguracoesPanel />
        </TabsContent>
      </Tabs>

      <KartEditDialog
        kart={kartEditando}
        onClose={() => setKartEmEdicao(null)}
        onRenomear={renomearKart}
        onDefinirRatingManual={definirRatingManual}
        onRemover={removerKart}
        onMarcarForaDeServico={marcarForaDeServico}
      />

      <AlertDialog
        open={pendingRelocacao !== null}
        onOpenChange={(open) => !open && setPendingRelocacao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover kart?</AlertDialogTitle>
            <AlertDialogDescription>
              O kart {pendingRelocacao?.kartId} já está em "{pendingRelocacao?.localizacaoAtual}".
              Queres tirá-lo de lá e colocá-lo nesta fila?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmarRelocacao}>Mover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {dragInfo ? (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-md border border-primary bg-background px-2.5 py-1.5 font-mono text-sm font-semibold shadow-lg"
          style={{ left: dragInfo.x, top: dragInfo.y }}
        >
          {snapshot.karts[dragInfo.kartId]?.label ?? dragInfo.kartId}
        </div>
      ) : null}
    </div>
  );
}

function KartEditDialog({
  kart,
  onClose,
  onRenomear,
  onDefinirRatingManual,
  onRemover,
  onMarcarForaDeServico,
}: {
  kart: KartDTO | null;
  onClose: () => void;
  onRenomear: (kartId: string, label: string) => Promise<void>;
  onDefinirRatingManual: (kartId: string, grade: number | null) => Promise<void>;
  onRemover: (kartId: string) => Promise<void>;
  onMarcarForaDeServico: (kartId: string, motivo: string) => Promise<void>;
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

  async function handleOficina() {
    if (!kart) return;
    try {
      await onMarcarForaDeServico(kart.id, "Marcado como fora de serviço via edição rápida");
      toast.success("Kart enviado para a oficina (fora de serviço)");
      onClose();
    } catch (e) {
      toast.error("Não foi possível marcar fora de serviço", {
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
                Renomear, ajustar o rating manualmente, enviar para a oficina, ou remover.
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

              {kart.state !== "FORA_DE_SERVICO" ? (
                <Button variant="outline" size="sm" onClick={handleOficina}>
                  <Wrench className="size-3.5" /> Enviar para a oficina
                </Button>
              ) : null}
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

function parseTempoParaSegundos(texto: string): number | null {
  const m = texto.trim().match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const milissegundos = m[3].padEnd(3, "0");
  return Number(m[1]) * 60 + Number(m[2]) + Number(milissegundos) / 1000;
}

function formatarSegundosParaTempo(segundos: number): string {
  const minutos = Math.floor(segundos / 60);
  const resto = (segundos - minutos * 60).toFixed(3).padStart(6, "0");
  return `${minutos}:${resto}`;
}

function ConfiguracoesPanel() {
  const { data: ratingConfig } = useRatingConfig();
  const setRatingTiers = useSetRatingTiers();
  const setBestNLaps = useSetRatingBestNLaps();
  const { data: boxConfig } = useBoxConfig();
  const setNumeroFilasPadrao = useSetNumeroFilasPadrao();
  const aplicarNumeroFilasPadrao = useAplicarNumeroFilasPadrao();

  // Campos de texto por grau (5→1), inicializados quando a config chega.
  const [campos, setCampos] = useState<Record<number, { min: string; max: string }> | null>(null);
  const [bestN, setBestN] = useState("8");
  const [numeroFilas, setNumeroFilas] = useState("2");

  if (ratingConfig && campos === null) {
    const iniciais: Record<number, { min: string; max: string }> = {};
    for (const t of ratingConfig.tiers) {
      iniciais[t.grade] = {
        min: formatarSegundosParaTempo(t.min_seconds),
        max: formatarSegundosParaTempo(t.max_seconds),
      };
    }
    setCampos(iniciais);
    setBestN(String(ratingConfig.best_n_laps));
  }
  if (boxConfig && numeroFilas === "2" && boxConfig.numero_filas_padrao !== 2) {
    setNumeroFilas(String(boxConfig.numero_filas_padrao));
  }

  async function handleGuardarTemposAlvo() {
    if (!campos) return;
    const tiers: RatingTierDTO[] = [];
    for (const grade of [5, 4, 3, 2, 1]) {
      const par = campos[grade];
      const min = par ? parseTempoParaSegundos(par.min) : null;
      const max = par ? parseTempoParaSegundos(par.max) : null;
      if (min === null || max === null) {
        toast.error(`Rating ${grade}: tempo inválido — usa o formato M:SS.mmm (ex.: 1:03.500)`);
        return;
      }
      tiers.push({ grade, min_seconds: min, max_seconds: max });
    }
    try {
      await setRatingTiers(tiers);
      toast.success("Tempos-alvo atualizados");
    } catch (e) {
      toast.error("Não foi possível guardar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleGuardarBestN() {
    const n = Number(bestN);
    if (!Number.isInteger(n) || n < 1) {
      toast.error("Tem de ser um número inteiro, pelo menos 1");
      return;
    }
    try {
      await setBestNLaps(n);
      toast.success("Atualizado");
    } catch (e) {
      toast.error("Não foi possível guardar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleGuardarNumeroFilas() {
    const n = Number(numeroFilas);
    if (!Number.isInteger(n) || n < 1) {
      toast.error("Tem de ser um número inteiro, pelo menos 1");
      return;
    }
    try {
      await setNumeroFilasPadrao(n);
      toast.success("Número de filas por defeito atualizado");
    } catch (e) {
      toast.error("Não foi possível guardar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleAplicarNumeroFilas() {
    try {
      const resultado = await aplicarNumeroFilasPadrao();
      toast.success(`Filas recriadas: ${resultado.filas.map((f) => f.nome).join(", ")}`);
    } catch (e) {
      toast.error("Não foi possível aplicar", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>I. Tempos Alvo</CardTitle>
          <CardDescription>
            Define os intervalos de tempo que determinam o rating automático (1-5) de cada kart.
            Podes ajustar isto a qualquer momento durante a corrida — as condições de pista mudam.
            Formato dos tempos: <code>M:SS.mmm</code> (ex.: <code>1:03.500</code>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {campos === null ? (
            <p className="text-sm text-muted-foreground">A carregar...</p>
          ) : (
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((grade) => (
                <div key={grade} className="flex items-center gap-2">
                  <Badge variant="outline" className="w-20 justify-center shrink-0">
                    Rating {grade}
                  </Badge>
                  <Input
                    value={campos[grade]?.min ?? ""}
                    onChange={(e) =>
                      setCampos((prev) => ({
                        ...prev,
                        [grade]: { min: e.target.value, max: prev?.[grade]?.max ?? "" },
                      }))
                    }
                    placeholder="1:03.000"
                    className="max-w-[9rem]"
                  />
                  <span className="text-muted-foreground">até</span>
                  <Input
                    value={campos[grade]?.max ?? ""}
                    onChange={(e) =>
                      setCampos((prev) => ({
                        ...prev,
                        [grade]: { min: prev?.[grade]?.min ?? "", max: e.target.value },
                      }))
                    }
                    placeholder="1:03.499"
                    className="max-w-[9rem]"
                  />
                </div>
              ))}
              <Button onClick={handleGuardarTemposAlvo}>Guardar tabela</Button>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <label className="text-xs uppercase text-muted-foreground">
              Média das X melhores voltas do turno atual
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              Ignora voltas de dobragem/tráfego — usa só as X mais rápidas do turno em curso.
            </p>
            <div className="flex gap-2">
              <Input
                value={bestN}
                onChange={(e) => setBestN(e.target.value)}
                inputMode="numeric"
                className="max-w-[6rem]"
              />
              <Button variant="outline" onClick={handleGuardarBestN}>
                Guardar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>II. Box</CardTitle>
          <CardDescription>
            Quantas filas de sorteio existem por defeito. "Aplicar" substitui as filas atuais por
            este número (só funciona se estiverem todas vazias).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Nº Filas</label>
            <Input
              value={numeroFilas}
              onChange={(e) => setNumeroFilas(e.target.value)}
              inputMode="numeric"
              className="max-w-[6rem]"
            />
          </div>
          <Button variant="outline" onClick={handleGuardarNumeroFilas}>
            Guardar número
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button>Aplicar agora (recriar filas)</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Recriar as filas?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isto substitui todas as filas atuais por {numeroFilas} fila(s) novas, com nomes e
                  cores genéricas. Só funciona se as filas atuais estiverem vazias.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleAplicarNumeroFilas}>Aplicar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function DemoPanel() {
  const { data: status } = useDemoStatus();
  const startDemo = useStartDemo();
  const stopDemo = useStopDemo();

  const [speed, setSpeed] = useState("20");
  const [leaderPace, setLeaderPace] = useState("55");
  const [fieldSpread, setFieldSpread] = useState("4");
  const [stintMinutes, setStintMinutes] = useState("15");
  const [manual, setManual] = useState(false);

  const running = status?.running ?? false;

  async function handleIniciar() {
    try {
      await startDemo({
        speed: Number(speed) || 20,
        leader_pace: Number(leaderPace) || 55,
        field_spread: Number(fieldSpread) || 4,
        stint_minutes: Number(stintMinutes) || 15,
        manual,
      });
      toast.success("Corrida de demonstração iniciada");
    } catch (e) {
      toast.error("Não foi possível iniciar a demo", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  async function handleParar() {
    try {
      await stopDemo();
      toast.success("Demo terminada");
    } catch (e) {
      toast.error("Não foi possível parar a demo", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="size-4" /> Corrida de demonstração
        </CardTitle>
        <CardDescription>
          Gera equipas e karts falsos, com voltas, PITINs e turnos, para testares ou mostrares o
          sistema sem depender de karts reais em pista. Usa os karts já registados no backend.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {running ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-500">
            <Radio className="size-3.5 animate-pulse" /> Demo em curso
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Velocidade</label>
            <Input
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              disabled={running}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Ritmo líder (s)</label>
            <Input
              value={leaderPace}
              onChange={(e) => setLeaderPace(e.target.value)}
              disabled={running}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Espalhamento (s)</label>
            <Input
              value={fieldSpread}
              onChange={(e) => setFieldSpread(e.target.value)}
              disabled={running}
              inputMode="numeric"
            />
          </div>
          <div>
            <label className="text-xs uppercase text-muted-foreground">Turno (min)</label>
            <Input
              value={stintMinutes}
              onChange={(e) => setStintMinutes(e.target.value)}
              disabled={running}
              inputMode="numeric"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => setManual(e.target.checked)}
            disabled={running}
          />
          Modo manual — a demo gera voltas e PITINs, mas deixa a triagem e o sorteio para cliques na
          interface (útil para praticares o fluxo com calma)
        </label>

        {running ? (
          <Button variant="destructive" onClick={handleParar}>
            <Square className="size-3.5" /> Parar demo
          </Button>
        ) : (
          <Button onClick={handleIniciar}>
            <Play className="size-3.5" /> Iniciar demo
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatLapTime(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutos = Math.floor(seconds / 60);
  const resto = (seconds - minutos * 60).toFixed(3).padStart(6, "0");
  return `${minutos}:${resto}`;
}

function formatDuration(seconds: number): string {
  const minutos = Math.floor(seconds / 60);
  const resto = Math.floor(seconds - minutos * 60)
    .toString()
    .padStart(2, "0");
  return `${minutos}:${resto}`;
}

function EmPistaTimer({ stintStartedAt }: { stintStartedAt: string | null }) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!stintStartedAt) return;
    const intervalo = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, [stintStartedAt]);

  if (!stintStartedAt) return <span className="text-muted-foreground">—</span>;
  const segundos = Math.max(0, (agora - new Date(stintStartedAt).getTime()) / 1000);
  return <span>{formatDuration(segundos)}</span>;
}

function DashboardPanel({
  snapshot,
  ratings,
  onEditarKart,
}: {
  snapshot: KartFeedSnapshot;
  ratings: Record<string, KartRatingDTO> | null;
  onEditarKart: (kartId: string) => void;
}) {
  const LAP_COLOR: Record<string, string> = {
    BOM: "text-emerald-500",
    MEDIO: "text-amber-500",
    MAU: "text-red-500",
    SEM_DADOS: "text-muted-foreground",
  };

  const linhas = Object.values(snapshot.equipas)
    .filter((eq) => eq.total_voltas > 0)
    .sort((a, b) => {
      const kartA = a.kart_atual_id ? snapshot.karts[a.kart_atual_id] : undefined;
      const kartB = b.kart_atual_id ? snapshot.karts[b.kart_atual_id] : undefined;
      const A = (kartA ? ratings?.[kartA.id]?.media_melhores_voltas_seconds : null) ?? Infinity;
      const B = (kartB ? ratings?.[kartB.id]?.media_melhores_voltas_seconds : null) ?? Infinity;
      return A - B;
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard ao vivo</CardTitle>
        <CardDescription>
          Classificação pela média das melhores voltas do turno atual. "Gap" e "Interval" ainda não
          estão disponíveis (por decifrar do Live Timing) — "Em Pista" e "Pits" já são calculados
          por nós.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há voltas registadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Kart</TableHead>
                  <TableHead>Equipa</TableHead>
                  <TableHead className="text-right">Média Melhores X Voltas</TableHead>
                  <TableHead className="text-right">Última Volta</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                  <TableHead className="text-right">Interval</TableHead>
                  <TableHead className="text-right">Voltas</TableHead>
                  <TableHead className="text-right">Em Pista</TableHead>
                  <TableHead className="text-right">Pits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((eq, i) => {
                  const kartId = eq.kart_atual_id;
                  const kart = kartId ? snapshot.karts[kartId] : undefined;
                  const grade = kartId ? ratings?.[kartId]?.grade : undefined;
                  return (
                    <TableRow key={eq.numero_equipa}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-mono font-semibold">
                        <div className="flex items-center gap-1.5">
                          {kart?.label ?? "—"}
                          {kartId ? (
                            <>
                              <GradeBadge grade={grade} manual={kart?.rating_manual != null} />
                              <button
                                type="button"
                                onClick={() => onEditarKart(kartId)}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={`Editar kart ${kartId}`}
                              >
                                <Pencil className="size-3.5" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {eq.numero_equipa}
                        {eq.nome ? (
                          <span className="ml-1 text-muted-foreground">{eq.nome}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatLapTime(
                          kartId
                            ? (ratings?.[kartId]?.media_melhores_voltas_seconds ?? null)
                            : null,
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${LAP_COLOR[eq.ultima_categoria]}`}
                      >
                        {formatLapTime(eq.ultimo_tempo_seconds)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        —
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        —
                      </TableCell>
                      <TableCell className="text-right font-mono">{eq.total_voltas}</TableCell>
                      <TableCell className="text-right font-mono">
                        <EmPistaTimer stintStartedAt={kart?.stint_started_at ?? null} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{eq.total_pits}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
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
  equipas,
  ratings,
  onAtribuir,
  onRemover,
  onEditarKart,
  onRetirarDaFila,
  onAdicionarManual,
  onDefinirCapacidade,
  dragInfo,
  dropTarget,
  onPointerDownOnHandle,
}: {
  fila: FilaDTO;
  karts: Record<string, KartDTO>;
  equipas: Record<string, EquipaDTO>;
  ratings: Record<string, KartRatingDTO> | null;
  onAtribuir: (kartId: string) => void;
  onRemover: () => void;
  onEditarKart: (kartId: string) => void;
  onRetirarDaFila: (kartId: string) => void;
  onAdicionarManual: (kartId: string, filaId: string) => void;
  onDefinirCapacidade: (filaId: string, capacidade: number | null) => void;
  dragInfo: { kartId: string; filaOrigemId: string; x: number; y: number } | null;
  dropTarget: { filaId: string; index: number } | null;
  onPointerDownOnHandle: (e: ReactPointerEvent, kartId: string, filaOrigemId: string) => void;
}) {
  const [novoKartId, setNovoKartId] = useState("");

  // Pré-visualização em tempo real: enquanto se arrasta um kart PARA
  // dentro desta fila, mostra logo "o espaço a abrir-se" na posição onde
  // vai cair — tal como o Pit Helper faz. Só se aplica à fila que está
  // mesmo a ser sobrevoada agora; as outras mostram a lista tal como está.
  const kartIdsParaMostrar =
    dragInfo && dropTarget?.filaId === fila.fila_id
      ? (() => {
          const semArrastado = fila.kart_ids.filter((id) => id !== dragInfo.kartId);
          const posicao = Math.min(dropTarget.index, semArrastado.length);
          return [
            ...semArrastado.slice(0, posicao),
            dragInfo.kartId,
            ...semArrastado.slice(posicao),
          ];
        })()
      : fila.kart_ids;

  function handleAdicionar() {
    const id = novoKartId.trim();
    if (!id) {
      toast.error("Indica o número do kart");
      return;
    }
    onAdicionarManual(id, fila.fila_id);
    setNovoKartId("");
  }

  function handleAjustarCapacidade(delta: number) {
    const atual = fila.capacidade;
    let novo: number;
    if (atual === null) {
      // Parte do "sem limite": "+" abre 1 slot extra a partir do que já
      // está ocupado; "-" fixa exatamente na ocupação atual.
      novo = delta > 0 ? fila.kart_ids.length + 1 : fila.kart_ids.length;
    } else {
      novo = atual + delta;
    }
    if (novo < 0) return;
    onDefinirCapacidade(fila.fila_id, novo);
  }

  const vazios = fila.capacidade !== null ? Math.max(0, fila.capacidade - fila.kart_ids.length) : 0;

  return (
    <div className="flex min-w-[150px] max-w-[260px] flex-1 flex-col overflow-hidden rounded-lg border border-border sm:min-w-[220px]">
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: fila.cor }}
      >
        <span className="truncate font-semibold text-white">{fila.nome}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleAjustarCapacidade(-1)}
            className="flex size-5 items-center justify-center rounded bg-white/20 text-white hover:bg-white/30"
            aria-label="Remover slot"
          >
            <Minus className="size-3" />
          </button>
          <span className="w-5 text-center text-xs text-white/90">{fila.capacidade ?? "∞"}</span>
          <button
            type="button"
            onClick={() => handleAjustarCapacidade(1)}
            className="flex size-5 items-center justify-center rounded bg-white/20 text-white hover:bg-white/30"
            aria-label="Adicionar slot"
          >
            <Plus className="size-3" />
          </button>
          {fila.kart_ids.length === 0 ? (
            <button
              type="button"
              onClick={onRemover}
              className="ml-1 text-white/80 hover:text-white"
              aria-label={`Remover fila ${fila.nome}`}
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div
        data-drop-fila={fila.fila_id}
        data-drop-index={kartIdsParaMostrar.length}
        className={`flex-1 space-y-1.5 bg-card p-2 ${
          dropTarget?.filaId === fila.fila_id && dropTarget.index >= kartIdsParaMostrar.length
            ? "bg-primary/10"
            : ""
        }`}
      >
        {fila.kart_ids.length === 0 && vazios === 0 && kartIdsParaMostrar.length === 0 ? (
          <p className="pointer-events-none px-1 py-3 text-center text-xs text-muted-foreground">
            Fila vazia — arrasta um kart para aqui (pega no ⠿)
          </p>
        ) : (
          kartIdsParaMostrar.map((id, i) => {
            const ehFantasma = dragInfo?.kartId === id && dropTarget?.filaId === fila.fila_id;

            if (ehFantasma) {
              // O kart está a ser arrastado — a linha "verdadeira" dele
              // segue o dedo/cursor (etiqueta flutuante); aqui só
              // mostramos o espaço tracejado a abrir-se nesta posição,
              // tal como o Pit Helper faz.
              return (
                <div
                  key={id}
                  data-drop-fila={fila.fila_id}
                  data-drop-index={i}
                  className="flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/10 p-2 py-4"
                >
                  <span className="text-xs text-primary">{karts[id]?.label ?? id}</span>
                </div>
              );
            }

            return (
              <div
                key={id}
                data-drop-fila={fila.fila_id}
                data-drop-index={i}
                className="rounded-md border border-border p-2"
              >
                <div className="mb-1 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onPointerDown={(e) => onPointerDownOnHandle(e, id, fila.fila_id)}
                      className="shrink-0 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
                      style={{ touchAction: "none" }}
                      aria-label={`Arrastar kart ${karts[id]?.label ?? id}`}
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <span className="text-xs text-muted-foreground">{i + 1}º</span>
                    <GradeBadge
                      grade={ratings?.[id]?.grade}
                      manual={karts[id]?.rating_manual != null}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onEditarKart(id)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Editar kart ${karts[id]?.label ?? id}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Retirar kart ${karts[id]?.label ?? id} da fila`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Retirar da fila?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O kart {karts[id]?.label ?? id} volta para a Fila de Espera/Triagem, sem
                            ficar atribuído a nenhuma fila.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onRetirarDaFila(id)}>
                            Retirar da Fila
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="py-1 text-center">
                  <div className="font-mono text-2xl font-extrabold leading-tight">
                    {karts[id]?.label ?? id}
                  </div>
                  <div className="truncate text-sm font-semibold" style={{ color: fila.cor }}>
                    {(() => {
                      const equipaId = karts[id]?.ultima_equipa_id;
                      const equipa = equipaId ? equipas[equipaId] : undefined;
                      if (!equipa) return "—";
                      return equipa.nome
                        ? `${equipa.numero_equipa} ${equipa.nome}`
                        : equipa.numero_equipa;
                    })()}
                  </div>
                  <div className="font-mono text-base font-bold">
                    {formatLapTime(ratings?.[id]?.media_melhores_voltas_seconds ?? null)}
                  </div>
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
            );
          })
        )}

        {Array.from({ length: vazios }).map((_, i) => (
          <div
            key={`vazio-${i}`}
            data-drop-fila={fila.fila_id}
            data-drop-index={kartIdsParaMostrar.length + i}
            className={`flex items-center justify-center rounded-md border border-dashed p-2 py-3 ${
              dropTarget?.filaId === fila.fila_id &&
              dropTarget.index === kartIdsParaMostrar.length + i
                ? "border-primary bg-primary/10"
                : "border-border"
            }`}
          >
            <span className="pointer-events-none size-2 rounded-full border border-muted-foreground" />
          </div>
        ))}

        <div className="flex gap-1.5 pt-1">
          <Input
            value={novoKartId}
            onChange={(e) => setNovoKartId(e.target.value)}
            placeholder="Nº kart"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdicionar();
            }}
          />
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAdicionar}>
            <Plus className="size-3.5" />
          </Button>
        </div>
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
