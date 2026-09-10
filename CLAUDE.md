# Kart Endurance — Ferramenta de Gestão de Karts (resumo para retomar no Claude Code)

Ferramenta de análise e gestão de karts em tempo real para uma corrida de
endurance (Palmela, 19/09). Dois codebases separados — ver abaixo.

## Arquitetura

### Backend — no servidor Hetzner (`91.99.18.25`)
- Python, FastAPI + WebSocket, tudo em `~/kart-endurance/` no servidor
- Deploy: `docker compose up -d --build <serviço>` (serviços: `kart-server`,
  `kart-adapter`, `kart-capture`, `caddy`)
- URL pública: `https://91-99-18-25.sslip.io`
- Ficheiros principais:
  - `models.py` — `Kart` e `Equipa` (dataclasses)
  - `queue_manager.py` — `KartQueueManager`, o "cérebro": máquina de
    estados dos karts, filas, rating, forecast
  - `server.py` — endpoints FastAPI + WebSocket
  - `rating_thresholds.py` — tabela de tempos-alvo configurável (1-5)
  - `browser_adapter.py` — parser do feed real do Apex Timing (corre
    dentro do container `kart-adapter`)
  - `demo_race.py` — simulador de corrida embutido no servidor
  - `race_simulator.py` — simulador externo (script à parte)
  - `forecast.py` — previsão de duração de turnos
  - `kart_rating.py` — **morto, não usado**, ficou no repo por inércia
- **Sem git configurado no servidor** — os ficheiros são copiados
  manualmente (`scp`) ou editados diretamente. Se o Claude Code tiver
  SSH, pode editar e fazer `docker compose up -d --build` diretamente,
  sem precisar de `scp`.

### Frontend — local (Windows) + Lovable + GitHub
- React/TypeScript, TanStack Start, componentes shadcn/ui
- Pasta local: `C:\Users\fpaco.fpaco-asus\Desktop\kartrace-manager`
- Repo: `github.com/filipebmp/kartrace-manager` (também sincronizado
  com o Lovable — às vezes o Lovable fica "preso" um commit atrás, aí
  o utilizador tem de clicar "Publish" lá)
- Deploy: `git add . && git commit -m "..." && git push` a partir da
  pasta local
- Ficheiros principais:
  - `src/lib/kartFeed/kartFeedClient.ts` — cliente WebSocket+REST,
    tipos DTO, hooks React (`useKartFeed`, `useKartFeedActions`, etc.)
  - `src/components/race/StaffQueuePanel.tsx` — TODA a interface do
    staff (Fila, Dashboard, Configurações, Demo) — ficheiro grande,
    ~2470 linhas

## Modelo de dados — IMPORTANTE, já mudámos de ideias duas vezes hoje

**Decisão final, confirmada pelo utilizador**: o **Rating (1-5, Muito
Mau→Muito Bom) é do KART FÍSICO**, não da equipa/piloto.

Porquê: fisicamente, todos os karts partem iguais mas o chassis, a
pressão dos pneus e pequenas afinações do motor fazem alguns serem
melhores que outros — e isso não muda consoante quem conduz. O
transponder (que identifica a equipa no Live Timing) desloca-se com a
equipa quando troca de kart — por isso a equipa é só "quem está a
conduzir agora", nunca teve nem deve ter rating próprio.

- `Kart.rating_manual` — override manual do staff (1-5), tem sempre
  prioridade sobre o automático
- Rating automático = média das X melhores voltas do turno atual do
  KART (não da equipa) — ver `rating_thresholds.py` /
  `_voltas_turno_atual` (dict keyed por `kart_id`)
- Cores fixas: 5=Roxo, 4=Verde, 3=Amarelo, 2=Laranja, 1=Vermelho
  (`GRADE_COLORS` no frontend)

**Não voltar a mudar isto sem confirmação explícita e muito clara —
já causou bastante retrabalho hoje.**

## Live Timing real (Apex Timing) — o que falta decifrar

O feed real ainda não está totalmente decifrado. Já sabemos:
- Formato das linhas: `r<linha>c<coluna>|<código>|<valor>`
- Tempo de volta: código `tn`/`ti`/`tb`, formato `M:SS.mmm`
- "Em Pista" no Apex é um contador **contínuo** desde que o piloto
  entra no turno até voltar à box (não reinicia por volta)

**Ainda por decifrar** (precisa de captura fresca correlacionada com
uma sessão ao vivo, tal como fizemos para o tempo de volta):
- Número real do kart físico (coluna "Kart" no Apex)
- Nome do piloto/equipa (coluna "Driver")
- Posição/Rank (coluna "Rnk")
- PITIN/PITOUT reais (sinal ainda não identificado com confiança)

Até isto ficar decifrado, as equipas reais usam `r{numero_da_linha}`
como identificador placeholder, e **não têm kart físico associado**
— por isso não têm rating (o rating precisa de um `kart_id`).

Deteção de fim de sessão: heurística por intervalo — se passarem 5 min
sem nenhuma volta de ninguém, assume-se que a sessão anterior acabou e
limpa-se automaticamente os dados com prefixo `r` na próxima volta que
chegar (`browser_adapter.py`, `_gap_sem_sessao_seconds`).

## Funcionalidades já construídas

- **Filas de sorteio** (Vermelha/Azul/customizáveis): triagem, sorteio,
  arrastar (drag-and-drop por eventos de ponteiro, funciona com
  rato e touch), "slots" visuais (nunca bloqueiam, só indicativos),
  adicionar kart manualmente, retirar da fila (devolve a EM_PISTA,
  restaura a última equipa conhecida — nunca volta para a Fila de
  Espera)
- **"Paragem manual na box"** — botão persistente para registar uma
  paragem quando o staff vê um kart chegar mas o Live Timing não
  apanhou; só aceita karts que estão mesmo EM_PISTA neste momento
- **Demo embutida** — cria os seus próprios karts/equipas com prefixo
  `demo-`, isolada de dados reais, limpa-se sozinha ao parar
- **Dashboard** — colunas ordenáveis, resumo (Pace/Melhor Kart/Últimas
  Entradas), painel de detalhe ao clicar num kart (histórico de
  voltas do turno, colorido por rating)
- **Configurações** — tabela de tempos-alvo editável, nº de filas por
  defeito

## Fluxo de trabalho até agora (o que o Claude Code pode simplificar)

Sempre que havia alterações:
1. Editar ficheiro localmente (sandbox desta conversa)
2. Validar: `tsc --noEmit`, `eslint --fix`, `vite build` (frontend) /
   `python3 -c "import ast; ast.parse(...)"` + testes manuais com
   `uvicorn` local (backend)
3. Empacotar em zip, o utilizador descarrega, copia manualmente para
   as pastas certas (`scp` para o servidor, `Copy-Item` no Windows)
4. `docker compose up -d --build` (backend) ou `git push` (frontend)

Com acesso direto (SSH no servidor + pasta local no Windows), o
Claude Code pode saltar o passo 3 por completo.

## Coisas a que vale a pena estar atento

- **Testar sempre antes de dar como certo** — este projeto já teve
  vários bugs subtis (ex.: eventos WebSocket esquecidos no switch do
  frontend, `Dockerfile.server` sem um módulo novo, IDs de evento da
  demo a colidir entre corridas) que só apareceram em teste real.
- **Nunca esquecer de ligar novos eventos do backend ao
  `applyIncrementalEvent` do frontend** (`kartFeedClient.ts`) — já
  aconteceu várias vezes ficar tudo a funcionar no backend mas o
  frontend não atualizar porque faltava o `case` no switch.
- **Isto é código para uma corrida real, já perto** (19/09) — testar
  bem antes de dar instruções de deploy, não assumir que "deve
  funcionar" sem confirmar.
