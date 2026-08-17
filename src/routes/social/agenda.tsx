import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Send, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  aplicarAgendaIcs,
  definirFormatoDaPauta,
  lerAgendaIcs,
  listarAgenda,
  moverPecaDeFase,
  removerEvento,
  salvarEvento,
} from "@/lib/api/social.functions";
import {
  CalendarioDoMes,
  PainelDoDia,
  QuadroDeProducao,
  SemanaEmLinha,
  type FaseDoQuadro,
  type Visao,
} from "@/components/social/calendario";
import {
  InlineError,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PostEditorDialog } from "@/components/social/post-editor";
import {
  chaveDoDia,
  esperandoAprovacao,
  itensDoDia,
  lerDia,
  montarQuadro,
  nomeDoMes,
  podeMoverPara,
  semanaDe,
  tituloDoDia,
} from "@/lib/social/agenda";
import { TIPO_DE_EVENTO_LABELS } from "@/lib/social/format";
import { can } from "@/lib/social/permissions";
import { useSocialSession } from "@/lib/social/session";
import type { Evento, FormatoPublicavel, TipoDeEvento } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/agenda")({
  component: AgendaPage,
});

const VISOES: { id: Visao; rotulo: string; explica: string }[] = [
  { id: "producao", rotulo: "Produção", explica: "Em que pé está cada peça." },
  { id: "publicacao", rotulo: "Publicação", explica: "O que vai ao ar e quando." },
  {
    id: "aprovacao",
    rotulo: "Aprovações",
    explica: "Só o que está esperando um sim, no dia em que vai ao ar.",
  },
  { id: "tudo", rotulo: "Tudo", explica: "A semana como ela é: compromisso, produção e entrega." },
];

/**
 * A agenda da campanha.
 *
 * Quatro visões do mesmo material, porque são quatro perguntas diferentes: em
 * que pé está o trabalho, o que vai ao ar, o que espera aprovação, e como é a
 * semana. Forçá-las numa tela só faria a última comer as outras três.
 *
 * A visão de aprovações é a que tem dono: ela existe para quem dá o "sim" abrir
 * a plataforma e ver, no calendário, só o que trava se ninguém agir — e ver
 * **quando** cada coisa trava, que é o que uma lista não mostra.
 *
 * O dia aberto fica **embaixo do calendário**, e não numa janela sobreposta. É
 * o que permite clicar de um dia para o outro comparando — numa janela, cada
 * comparação custaria fechar e abrir.
 */
function AgendaPage() {
  const { projectId, session } = useSocialSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [visao, setVisao] = useState<Visao>("tudo");
  const [formato, setFormato] = useState<"mes" | "semana">("mes");
  const [referencia, setReferencia] = useState(() => new Date());
  const [diaAberto, setDiaAberto] = useState<string | null>(() => chaveDoDia(new Date()));
  const [editando, setEditando] = useState<Evento | "novo" | null>(null);
  const [importando, setImportando] = useState(false);
  // O dia em que a pessoa clicou no "+": vira a pergunta "compromisso ou
  // publicação?" e depois a data que os dois formulários já vêm preenchidos.
  const [criandoNoDia, setCriandoNoDia] = useState<string | null>(null);
  const [publicandoNoDia, setPublicandoNoDia] = useState<string | null>(null);
  // Colunas vazias começam recolhidas: o que não tem nada não deveria ocupar um
  // sexto da largura, e a faixa fina continua dizendo que a etapa existe.
  const [recolhidas, setRecolhidas] = useState<FaseDoQuadro[]>([]);
  const [iniciouRecolhidas, setIniciouRecolhidas] = useState(false);

  const dados = useQuery({
    queryKey: ["social", "agenda", projectId],
    queryFn: () => listarAgenda({ data: { projectId: projectId ?? undefined } }),
    enabled: Boolean(projectId),
  });

  const eventos = dados.data?.eventos ?? [];
  const posts = dados.data?.posts ?? [];
  const contas = dados.data?.contas ?? [];
  const podeEditar = can(session?.user.role, "publicar");

  const quadro = montarQuadro(posts);

  const mesDaReferencia = `${referencia.getFullYear()}-${String(referencia.getMonth() + 1).padStart(2, "0")}`;
  const noMes = (iso: string | null) => iso !== null && chaveDoDia(iso).startsWith(mesDaReferencia);
  const publicadasNoMes = posts.filter(
    (post) => post.status === "publicado" && noMes(post.publishedAt),
  );
  const agendadasNoMes = posts.filter(
    (post) => post.status === "agendado" && noMes(post.scheduledFor),
  );

  // A fila de aprovação é do projeto inteiro, não do mês: uma peça que vence
  // semana que vem não pode desaparecer da contagem porque o calendário está
  // parado em agosto.
  const aguardando = esperandoAprovacao(posts);
  const proximaAAprovar = aguardando[0]?.scheduledFor ?? null;

  // A primeira montagem com dados decide o que já nasce recolhido; depois disso
  // quem manda é o clique da pessoa, e reavaliar apagaria a escolha dela.
  useEffect(() => {
    if (iniciouRecolhidas || dados.isPending) return;
    setRecolhidas(
      quadro.filter((coluna) => coluna.posts.length === 0).map((coluna) => coluna.fase),
    );
    setIniciouRecolhidas(true);
  }, [dados.isPending, iniciouRecolhidas, quadro]);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["social"] });

  const mover = useMutation({
    mutationFn: (entrada: { postId: string; fase: FaseDoQuadro }) =>
      moverPecaDeFase({ data: entrada }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      invalidar();
    },
    onError: () => toast.error("Não foi possível mover a peça."),
  });

  // Decidir o formato da pauta é a operação que tira o compromisso da agenda e
  // o põe no caminho da produção. Fica no quadro, e não numa tela à parte,
  // porque é ali que a pessoa está olhando quando decide.
  const decidir = useMutation({
    mutationFn: (entrada: { postId: string; formato: FormatoPublicavel }) =>
      definirFormatoDaPauta({ data: entrada }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      invalidar();
      toast.success("Formato definido.");
    },
    onError: () => toast.error("Não foi possível definir o formato."),
  });

  const remover = useMutation({
    mutationFn: (id: string) => removerEvento({ data: { id } }),
    onSuccess: () => {
      invalidar();
      toast.success("Compromisso removido.");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        description="Os compromissos da campanha, a produção das peças e o que vai ao ar — no mesmo calendário."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {podeEditar ? (
              <>
                <button
                  type="button"
                  onClick={() => setImportando(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <Upload className="size-4" /> Importar .ics
                </button>
                <button
                  type="button"
                  onClick={() => setEditando("novo")}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="size-4" /> Compromisso
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
          {VISOES.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              onClick={() => setVisao(opcao.id)}
              title={opcao.explica}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                visao === opcao.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>

        {visao !== "producao" ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
            {(["mes", "semana"] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setFormato(opcao)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  formato === opcao
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opcao === "mes" ? "Mês" : "Semana"}
              </button>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {VISOES.find((opcao) => opcao.id === visao)?.explica}
        </p>
      </div>

      {dados.isPending ? (
        <LoadingBlock rows={5} />
      ) : visao === "producao" ? (
        <SectionCard
          title="Quadro de produção"
          description="Da ideia à publicação. Mover uma peça aqui é a mesma coisa que mudar a fase dela na tela de publicação."
          icon={CalendarDays}
        >
          <QuadroDeProducao
            colunas={quadro}
            onMover={(postId, fase) => mover.mutate({ postId, fase })}
            podeMover={podeMoverPara}
            movendo={mover.isPending ? (mover.variables?.postId ?? null) : null}
            recolhidas={recolhidas}
            onAlternar={(fase) =>
              setRecolhidas((atual) =>
                atual.includes(fase) ? atual.filter((f) => f !== fase) : [...atual, fase],
              )
            }
            onCriar={podeEditar ? () => navigate({ to: "/social/publicacoes" }) : undefined}
            onEscolherFormato={
              podeEditar ? (postId, formato) => decidir.mutate({ postId, formato }) : undefined
            }
            decidindo={decidir.isPending ? (decidir.variables?.postId ?? null) : null}
            contas={contas}
          />
        </SectionCard>
      ) : (
        <SectionCard
          title={
            formato === "mes"
              ? `${nomeDoMes(referencia.getMonth())} de ${referencia.getFullYear()}`
              : "Semana"
          }
          icon={CalendarDays}
          actions={
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setReferencia(deslocar(referencia, formato, -1))}
                className="rounded-lg border border-border p-1.5 hover:bg-secondary"
                aria-label="Anterior"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setReferencia(new Date());
                  setDiaAberto(chaveDoDia(new Date()));
                }}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setReferencia(deslocar(referencia, formato, 1))}
                className="rounded-lg border border-border p-1.5 hover:bg-secondary"
                aria-label="Próximo"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          }
        >
          {visao === "publicacao" && formato === "mes" ? (
            // A pergunta "o que saiu este mês?" não se responde contando
            // quadradinhos: o total vem escrito.
            <p className="mb-2 text-sm text-muted-foreground">
              <strong className="text-foreground">{publicadasNoMes.length}</strong>{" "}
              {publicadasNoMes.length === 1 ? "publicação" : "publicações"} no mês
              {agendadasNoMes.length > 0
                ? `, e mais ${agendadasNoMes.length} agendada${agendadasNoMes.length === 1 ? "" : "s"}`
                : ""}
              .
            </p>
          ) : null}

          {visao === "aprovacao" ? (
            <p className="mb-2 text-sm text-muted-foreground">
              {aguardando.length === 0 ? (
                "Nada esperando aprovação. O calendário abaixo fica vazio quando não há fila — e é assim que ele diz que está tudo em dia."
              ) : (
                <>
                  <strong className="text-foreground">{aguardando.length}</strong>{" "}
                  {aguardando.length === 1 ? "peça espera" : "peças esperam"} aprovação
                  {proximaAAprovar
                    ? `. A mais próxima sai em ${new Date(proximaAAprovar).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}.`
                    : "."}
                </>
              )}
            </p>
          ) : null}

          {formato === "mes" ? (
            <CalendarioDoMes
              ano={referencia.getFullYear()}
              mes={referencia.getMonth()}
              eventos={eventos}
              posts={posts}
              visao={visao}
              diaAberto={diaAberto}
              onAbrirDia={setDiaAberto}
              onCriarNoDia={
                podeEditar
                  ? (dia) => {
                      setDiaAberto(dia);
                      setCriandoNoDia(dia);
                    }
                  : undefined
              }
            />
          ) : (
            <SemanaEmLinha
              dias={semanaDe(chaveDoDia(referencia))}
              eventos={eventos}
              posts={posts}
              visao={visao}
              diaAberto={diaAberto}
              onAbrirDia={setDiaAberto}
            />
          )}
        </SectionCard>
      )}

      {diaAberto && visao !== "producao" ? (
        <SectionCard
          title={tituloDoDia(diaAberto)}
          description="Tudo o que acontece neste dia, na ordem em que acontece."
          icon={CalendarDays}
          actions={
            <button
              type="button"
              onClick={() => setDiaAberto(null)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary"
            >
              Fechar
            </button>
          }
        >
          <PainelDoDia
            contas={contas}
            dia={diaAberto}
            itens={itensDoDia(diaAberto, eventos, posts)}
            visao={visao}
            onVincular={podeEditar ? (evento) => setEditando(evento) : undefined}
            onNovoCompromisso={podeEditar ? () => setEditando("novo") : undefined}
            onNovaPublicacao={podeEditar ? () => setPublicandoNoDia(diaAberto) : undefined}
          />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Compromissos cadastrados"
        description="Os próximos primeiro. Importados do Google aparecem marcados."
        icon={CalendarDays}
      >
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum compromisso ainda. Cadastre a agenda da campanha ou importe um arquivo .ics do
            Google Agenda.
          </p>
        ) : (
          <ul className="space-y-2">
            {[...eventos]
              .sort((a, b) => b.comecaEm.localeCompare(a.comecaEm))
              .slice(0, 12)
              .map((evento) => (
                <li
                  key={evento.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-3"
                >
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {new Date(evento.comecaEm).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {evento.titulo}
                  </span>
                  <StatusPill tone="neutro">{TIPO_DE_EVENTO_LABELS[evento.tipo]}</StatusPill>
                  {evento.origem === "importado" ? (
                    <StatusPill tone="neutro">importado</StatusPill>
                  ) : null}
                  {podeEditar ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditando(evento)}
                        className="text-xs text-accent hover:underline"
                      >
                        editar
                      </button>
                      <button
                        type="button"
                        onClick={() => remover.mutate(evento.id)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        remover
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </SectionCard>

      {editando ? (
        <DialogoDeEvento
          evento={editando === "novo" ? null : editando}
          projectId={projectId ?? ""}
          diaSugerido={diaAberto ?? chaveDoDia(new Date())}
          usuarios={dados.data?.users ?? []}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            invalidar();
          }}
        />
      ) : null}

      {criandoNoDia ? (
        <EscolhaDoQueCriar
          dia={criandoNoDia}
          onFechar={() => setCriandoNoDia(null)}
          onCompromisso={() => {
            setCriandoNoDia(null);
            setEditando("novo");
          }}
          onPublicacao={() => {
            setPublicandoNoDia(criandoNoDia);
            setCriandoNoDia(null);
          }}
        />
      ) : null}

      {publicandoNoDia && session ? (
        // Montado só quando abre: o editor lê o dia sugerido no estado inicial,
        // e um diálogo que fica montado guardaria o dia do primeiro clique.
        <PostEditorDialog
          open
          onOpenChange={(aberto) => (aberto ? null : setPublicandoNoDia(null))}
          accounts={contas}
          projectId={projectId ?? ""}
          userId={session.user.id}
          diaSugerido={publicandoNoDia}
          onCreated={() => {
            setPublicandoNoDia(null);
            invalidar();
          }}
        />
      ) : null}

      {importando ? (
        <DialogoDeImportacao
          projectId={projectId ?? ""}
          onFechar={() => setImportando(false)}
          onImportado={() => {
            setImportando(false);
            invalidar();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * "Compromisso ou publicação?", perguntado no dia em que se clicou.
 *
 * O calendário guarda duas coisas de naturezas diferentes — o que a campanha
 * **faz** e o que a campanha **publica** — e o clique num dia vazio não diz qual
 * das duas a pessoa quer. Perguntar em uma tela de duas opções custa um clique e
 * evita o erro de abrir o formulário errado, que custa fechar, procurar o outro
 * botão e digitar a data de novo.
 */
function EscolhaDoQueCriar({
  dia,
  onFechar,
  onCompromisso,
  onPublicacao,
}: {
  dia: string;
  onFechar: () => void;
  onCompromisso: () => void;
  onPublicacao: () => void;
}) {
  return (
    <Dialog open onOpenChange={(aberto) => (aberto ? null : onFechar())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tituloDoDia(dia)}</DialogTitle>
          <DialogDescription>O que você quer criar neste dia?</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCompromisso}
            className="rounded-xl border border-border p-4 text-left transition-colors hover:border-accent/60 hover:bg-secondary/50"
          >
            <CalendarDays className="size-5 text-accent" />
            <span className="mt-2 block text-sm font-medium">Compromisso</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Agenda, gravação, prazo ou reunião interna.
            </span>
          </button>

          <button
            type="button"
            onClick={onPublicacao}
            className="rounded-xl border border-border p-4 text-left transition-colors hover:border-accent/60 hover:bg-secondary/50"
          >
            <Send className="size-5 text-accent" />
            <span className="mt-2 block text-sm font-medium">Publicação</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Uma peça para as redes, já agendada para este dia.
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function deslocar(data: Date, formato: "mes" | "semana", passo: number): Date {
  const proxima = new Date(data);
  if (formato === "mes") proxima.setMonth(proxima.getMonth() + passo);
  else proxima.setDate(proxima.getDate() + passo * 7);
  return proxima;
}

const TIPOS: TipoDeEvento[] = ["agenda", "gravacao", "prazo", "interno"];

function DialogoDeEvento({
  evento,
  projectId,
  diaSugerido,
  usuarios,
  onFechar,
  onSalvo,
}: {
  evento: Evento | null;
  projectId: string;
  diaSugerido: string;
  usuarios: { id: string; name: string }[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [tipo, setTipo] = useState<TipoDeEvento>(evento?.tipo ?? "agenda");
  const [dia, setDia] = useState(evento ? chaveDoDia(evento.comecaEm) : diaSugerido);
  const [hora, setHora] = useState(
    evento && !evento.diaInteiro ? new Date(evento.comecaEm).toTimeString().slice(0, 5) : "09:00",
  );
  const [diaInteiro, setDiaInteiro] = useState(evento?.diaInteiro ?? false);
  const [local, setLocal] = useState(evento?.local ?? "");
  const [descricao, setDescricao] = useState(evento?.descricao ?? "");
  const [responsavel, setResponsavel] = useState(evento?.responsavel ?? "");
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () =>
      salvarEvento({
        data: {
          id: evento?.id,
          projectId,
          titulo,
          descricao: descricao.trim() || null,
          tipo,
          comecaEm: montarInstante(dia, diaInteiro ? "00:00" : hora),
          terminaEm: null,
          diaInteiro,
          local: local.trim() || null,
          responsavel: responsavel || null,
        },
      }),
    onSuccess: () => {
      toast.success(evento ? "Compromisso atualizado." : "Compromisso criado.");
      onSalvo();
    },
    onError: () => setErro("Não foi possível salvar o compromisso."),
  });

  return (
    <Dialog open onOpenChange={(aberto) => (aberto ? null : onFechar())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{evento ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          <DialogDescription>
            O município é descoberto pelo texto do local — escreva como você diria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Campo rotulo="Título">
            <input
              value={titulo}
              onChange={(evt) => setTitulo(evt.target.value)}
              placeholder="Caminhada na feira da Vila Nova"
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus-visible:border-ring"
            />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <select
                value={tipo}
                onChange={(evt) => setTipo(evt.target.value as TipoDeEvento)}
                className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none"
              >
                {TIPOS.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {TIPO_DE_EVENTO_LABELS[opcao]}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Responsável">
              <select
                value={responsavel}
                onChange={(evt) => setResponsavel(evt.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none"
              >
                <option value="">Sem responsável</option>
                {usuarios.map((usuario) => (
                  <option key={usuario.id} value={usuario.id}>
                    {usuario.name}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Dia">
              <input
                type="date"
                value={dia}
                onChange={(evt) => setDia(evt.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none"
              />
            </Campo>
            <Campo rotulo="Hora">
              <input
                type="time"
                value={hora}
                disabled={diaInteiro}
                onChange={(evt) => setHora(evt.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none disabled:opacity-50"
              />
            </Campo>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={diaInteiro}
              onChange={(evt) => setDiaInteiro(evt.target.checked)}
            />
            Dia inteiro
          </label>

          <Campo rotulo="Local">
            <input
              value={local}
              onChange={(evt) => setLocal(evt.target.value)}
              placeholder="Sorocaba"
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none"
            />
          </Campo>

          <Campo rotulo="Descrição">
            <textarea
              rows={2}
              value={descricao}
              onChange={(evt) => setDescricao(evt.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm outline-none"
            />
          </Campo>

          {erro ? <InlineError>{erro}</InlineError> : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={titulo.trim().length === 0 || salvar.isPending}
            onClick={() => salvar.mutate()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function montarInstante(dia: string, hora: string): string {
  const [ano, mes, diaDoMes] = dia.split("-").map(Number);
  const [h, m] = hora.split(":").map(Number);
  return new Date(ano, mes - 1, diaDoMes, h, m).toISOString();
}

/**
 * A importação em dois passos: primeiro o que vai acontecer, depois acontece.
 *
 * Importar agenda por cima de agenda é operação que ninguém quer descobrir
 * depois — e "vai criar 12, atualizar 3, ignorar 1" é uma frase que se lê em
 * dois segundos antes de decidir.
 */
function DialogoDeImportacao({
  projectId,
  onFechar,
  onImportado,
}: {
  projectId: string;
  onFechar: () => void;
  onImportado: () => void;
}) {
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [nomeDoArquivo, setNomeDoArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const previa = useQuery({
    queryKey: ["social", "agenda-ics", projectId, nomeDoArquivo],
    queryFn: () => lerAgendaIcs({ data: { projectId, conteudo: conteudo! } }),
    enabled: Boolean(conteudo),
  });

  const aplicar = useMutation({
    mutationFn: () => aplicarAgendaIcs({ data: { projectId, conteudo: conteudo! } }),
    onSuccess: (resultado) => {
      toast.success(
        `${resultado.criados} criados, ${resultado.atualizados} atualizados, ${resultado.iguais} sem mudança.`,
      );
      onImportado();
    },
    onError: () => setErro("Não foi possível importar a agenda."),
  });

  return (
    <Dialog open onOpenChange={(aberto) => (aberto ? null : onFechar())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar agenda</DialogTitle>
          <DialogDescription>
            No Google Agenda: Configurações → a agenda desejada → Exportar. O arquivo .ics baixado é
            o que entra aqui. Reimportar não duplica: cada compromisso tem um identificador.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            type="file"
            accept=".ics,text/calendar"
            onChange={async (evt) => {
              const arquivo = evt.target.files?.[0];
              if (!arquivo) return;
              setErro(null);
              setNomeDoArquivo(arquivo.name);
              setConteudo(await arquivo.text());
            }}
            className="w-full rounded-lg border border-border bg-secondary/60 px-3 py-2 text-sm"
          />

          {previa.data ? (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
              <p>
                <strong>{previa.data.novos.length}</strong> a criar ·{" "}
                <strong>{previa.data.atualizados.length}</strong> a atualizar ·{" "}
                <strong>{previa.data.iguais}</strong> sem mudança
              </p>
              {previa.data.comRepeticao > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {previa.data.comRepeticao}{" "}
                  {previa.data.comRepeticao === 1
                    ? "compromisso se repete"
                    : "compromissos se repetem"}{" "}
                  no arquivo. Entram só na primeira ocorrência — a plataforma não lê regras de
                  repetição, e inventar as datas seguintes seria pior que não trazê-las.
                </p>
              ) : null}
              {previa.data.ignorados.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {previa.data.ignorados.slice(0, 5).map((linha, indice) => (
                    <li key={indice}>
                      · {linha.titulo}: {linha.motivo}
                    </li>
                  ))}
                </ul>
              ) : null}
              {previa.data.atualizados.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {previa.data.atualizados.slice(0, 5).map((linha) => (
                    <li key={linha.id}>
                      · {linha.titulo}: muda {linha.mudou.join(", ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {erro ? <InlineError>{erro}</InlineError> : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!previa.data || aplicar.isPending}
            onClick={() => aplicar.mutate()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            Importar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{rotulo}</span>
      {children}
    </label>
  );
}
