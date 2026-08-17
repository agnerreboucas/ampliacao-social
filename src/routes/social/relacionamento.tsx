import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  AtSign,
  CheckCheck,
  CirclePlay,
  Images,
  Image as ImageIcon,
  Inbox,
  Lightbulb,
  LoaderCircle,
  MessageCircle,
  Radio,
  Send,
  Users,
  UserCheck,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  atualizarInbox,
  classificarPessoa,
  listarInbox,
  responderEmLote,
  responderInbox,
} from "@/lib/api/social.functions";
import {
  AccountAvatar,
  EmptyState,
  InlineError,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  StatusPill,
} from "@/components/social/primitives";
import { formatCompact, formatDateTime, formatNumber, formatRelative } from "@/lib/social/format";
import { diaPorExtenso, nomeDoFormato, type PecaDeOrigem } from "@/lib/social/rastreio";
import { NETWORKS } from "@/lib/social/networks";
import {
  MODELOS_POR_RELACAO,
  RELACAO_INFO,
  RELACOES,
  VARIAVEIS_MODELO,
  aplicarModelo,
  contarPorRelacao,
} from "@/lib/social/relacionamento";
import { useSocialSession } from "@/lib/social/session";
import type {
  InboxItem,
  NetworkId,
  PlatformUser,
  PostFormat,
  RelacaoPessoa,
  SocialAccount,
} from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/relacionamento")({
  component: RelacionamentoPage,
});

type Filtro = "pendentes" | "respondidos" | "todos";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendentes", label: "Pendentes" },
  { id: "respondidos", label: "Respondidos" },
  { id: "todos", label: "Todos" },
];

function RelacionamentoPage() {
  const { projectId, session } = useSocialSession();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [rede, setRede] = useState<NetworkId | "todas">("todas");
  const [relacaoFiltro, setRelacaoFiltro] = useState<RelacaoPessoa | "todas">("todas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [textoLote, setTextoLote] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ignorados, setIgnorados] = useState<{ itemId: string; motivo: string }[]>([]);
  const notifiedRef = useRef<string | null>(null);

  // Polling: as redes entregam comentários e mensagens por webhook; aqui a tela
  // consulta o servidor em intervalo curto para refletir novas interações.
  const inbox = useQuery({
    queryKey: ["social", "inbox", projectId],
    queryFn: () => listarInbox({ data: { projectId: projectId ?? undefined, poll: true } }),
    enabled: Boolean(projectId),
    refetchInterval: 15_000,
  });

  const items = useMemo(() => inbox.data?.items ?? [], [inbox.data]);
  const accounts = useMemo(() => inbox.data?.accounts ?? [], [inbox.data]);
  const users = inbox.data?.users ?? [];
  const origens = inbox.data?.origens ?? {};
  const conversasPorPeca = inbox.data?.conversasPorPeca ?? {};

  const redePorConta = useMemo(() => {
    const mapa: Record<string, NetworkId> = {};
    for (const account of accounts) mapa[account.id] = account.networkId;
    return mapa;
  }, [accounts]);

  // Notifica quando uma interação nova entra na caixa (PRD 3.5).
  useEffect(() => {
    const novoId = inbox.data?.novoId;
    if (!novoId || notifiedRef.current === novoId) return;
    notifiedRef.current = novoId;
    const item = items.find((candidate) => candidate.id === novoId);
    if (item) {
      toast(`Nova ${item.kind} de ${item.authorName}`, { description: item.text });
    }
  }, [inbox.data, items]);

  const contagem = contarPorRelacao(items);

  // Redes que realmente têm interação — filtrar por uma rede vazia só frustra.
  const redesPresentes = useMemo(() => {
    const encontradas = new Set<NetworkId>();
    for (const item of items) {
      const networkId = redePorConta[item.accountId];
      if (networkId) encontradas.add(networkId);
    }
    return [...encontradas];
  }, [items, redePorConta]);

  const filtrados = items.filter((item) => {
    const porStatus =
      filtro === "todos"
        ? true
        : filtro === "pendentes"
          ? item.status === "pendente"
          : item.status === "respondido";
    const porRede = rede === "todas" || redePorConta[item.accountId] === rede;
    const porRelacao = relacaoFiltro === "todas" || item.relacao === relacaoFiltro;
    return porStatus && porRede && porRelacao;
  });

  // A conversa aberta continua visível mesmo quando muda de status e sai do
  // filtro atual — responder não deve fazer o item sumir da tela.
  const selected = items.find((item) => item.id === selectedId) ?? filtrados[0] ?? null;
  const selecionadosEmLote = items.filter((item) => marcados.includes(item.id));
  const emLote = selecionadosEmLote.length > 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["social"] });

  const responder = useMutation({
    mutationFn: (input: { itemId: string; texto: string; autor: string }) =>
      responderInbox({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        setErro(result.erro);
        return;
      }
      setTexto("");
      setErro(null);
      invalidate();
      toast.success("Resposta enviada para a rede de origem.");
    },
    onError: () => setErro("Não foi possível enviar a resposta."),
  });

  const responderLote = useMutation({
    mutationFn: (input: { itemIds: string[]; texto: string; autor: string }) =>
      responderEmLote({ data: input }),
    onSuccess: (result) => {
      setIgnorados(result.ignorados);
      setErro(null);
      invalidate();
      if (result.enviados.length > 0) {
        setTextoLote("");
        setMarcados([]);
        toast.success(
          `${result.enviados.length} ${result.enviados.length === 1 ? "resposta enviada" : "respostas enviadas"}.`,
        );
      } else {
        toast.error("Nenhuma das interações selecionadas pode receber resposta agora.");
      }
    },
    onError: () => setErro("Não foi possível enviar as respostas."),
  });

  const atualizar = useMutation({
    mutationFn: (input: {
      itemId: string;
      status?: "pendente" | "respondido";
      assignedTo?: string | null;
    }) => atualizarInbox({ data: input }),
    onSuccess: invalidate,
  });

  const classificar = useMutation({
    mutationFn: (input: { handle: string; relacao: RelacaoPessoa }) =>
      classificarPessoa({ data: input }),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        `${result.handle} agora é ${RELACAO_INFO[result.relacao].label.toLowerCase()}.`,
      );
    },
  });

  const alternarMarcado = (itemId: string) => {
    setIgnorados([]);
    setMarcados((atual) =>
      atual.includes(itemId) ? atual.filter((id) => id !== itemId) : [...atual, itemId],
    );
  };

  const marcarTodosDoFiltro = () => {
    setIgnorados([]);
    const ids = filtrados.map((item) => item.id);
    const todosMarcados = ids.every((id) => marcados.includes(id));
    setMarcados(todosMarcados ? [] : ids);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerenciamento de relacionamento"
        description="Todos os comentários e mensagens de todas as redes em um só lugar — responda um a um ou selecione vários e fale com todos de uma vez."
        actions={
          <StatusPill tone="destaque">
            <Radio className="size-3 live-dot" /> Atualizando a cada 15s
          </StatusPill>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {RELACOES.map((relacao) => {
          const info = RELACAO_INFO[relacao];
          const ativo = relacaoFiltro === relacao;
          return (
            <button
              key={relacao}
              type="button"
              onClick={() => setRelacaoFiltro(ativo ? "todas" : relacao)}
              className={cn(
                "surface-card min-w-0 p-4 text-left transition-colors",
                ativo ? "ring-2 ring-ring" : "hover:bg-secondary/40",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: info.color }}
                />
                <span className="truncate text-sm font-medium">{info.label}</span>
                <span className="ml-auto shrink-0 text-lg font-semibold tabular-nums">
                  {contagem[relacao]}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{info.descricao}</p>
            </button>
          );
        })}
      </div>

      {inbox.isPending ? (
        <LoadingBlock rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nenhuma interação ainda"
          description="Assim que chegar um comentário ou mensagem nas contas conectadas, ele aparece aqui."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_1fr]">
          <div className="surface-card flex max-h-[70vh] min-w-0 flex-col overflow-hidden">
            <div className="space-y-2 border-b border-border p-3">
              <div className="flex flex-wrap items-center gap-1">
                {FILTROS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFiltro(option.id)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      filtro === option.id
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                    {option.id === "pendentes" && inbox.data?.pendentes
                      ? ` (${inbox.data.pendentes})`
                      : ""}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRede("todas")}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    rede === "todas"
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Todas as redes
                </button>
                {redesPresentes.map((networkId) => (
                  <button
                    key={networkId}
                    type="button"
                    onClick={() => setRede(networkId)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      rede === networkId
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {NETWORKS[networkId].label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={marcarTodosDoFiltro}
                  disabled={filtrados.length === 0}
                  className="text-[11px] text-accent hover:underline disabled:opacity-50"
                >
                  {filtrados.length > 0 && filtrados.every((item) => marcados.includes(item.id))
                    ? "Limpar seleção"
                    : `Selecionar os ${filtrados.length} deste filtro`}
                </button>
                {emLote ? (
                  <StatusPill tone="destaque">
                    <Users className="size-3" /> {selecionadosEmLote.length} selecionados
                  </StatusPill>
                ) : null}
              </div>
            </div>

            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {filtrados.map((item) => {
                const networkId = redePorConta[item.accountId];
                const marcado = marcados.includes(item.id);
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex items-start gap-2 p-3 transition-colors",
                      marcado
                        ? "bg-primary/10"
                        : selected?.id === item.id && !emLote
                          ? "bg-secondary/70"
                          : "hover:bg-secondary/40",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternarMarcado(item.id)}
                      aria-label={`Selecionar interação de ${item.authorName}`}
                      className="mt-3 size-4 shrink-0 accent-[var(--color-primary)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setErro(null);
                      }}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <AccountAvatar
                        gradient={item.avatarGradient}
                        label={item.authorName}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{item.authorName}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {formatRelative(item.receivedAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {item.text}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <RelacaoPill relacao={item.relacao} />
                          {networkId ? <NetworkChip networkId={networkId} /> : null}
                          <KindPill kind={item.kind} />
                          {item.status === "pendente" ? (
                            <StatusPill tone="atencao">pendente</StatusPill>
                          ) : (
                            <StatusPill tone="positivo">respondido</StatusPill>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtrados.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma interação neste filtro.
                </li>
              ) : null}
            </ul>
          </div>

          {emLote ? (
            <BulkPanel
              itens={selecionadosEmLote}
              accounts={accounts}
              texto={textoLote}
              onTexto={setTextoLote}
              erro={erro}
              ignorados={ignorados}
              enviando={responderLote.isPending}
              onLimpar={() => {
                setMarcados([]);
                setIgnorados([]);
              }}
              onEnviar={() =>
                responderLote.mutate({
                  itemIds: selecionadosEmLote.map((item) => item.id),
                  texto: textoLote,
                  autor: session?.user.name ?? "Equipe",
                })
              }
            />
          ) : selected ? (
            <ConversationPanel
              item={selected}
              account={accounts.find((account) => account.id === selected.accountId)}
              origem={selected.postId ? (origens[selected.postId] ?? null) : null}
              conversasDaPeca={selected.postId ? (conversasPorPeca[selected.postId] ?? 0) : 0}
              users={users}
              texto={texto}
              onTexto={setTexto}
              erro={erro}
              enviando={responder.isPending}
              onEnviar={() => {
                setSelectedId(selected.id);
                responder.mutate({
                  itemId: selected.id,
                  texto,
                  autor: session?.user.name ?? "Equipe",
                });
              }}
              onAtribuir={(userId) =>
                atualizar.mutate({ itemId: selected.id, assignedTo: userId || null })
              }
              onStatus={(status) => atualizar.mutate({ itemId: selected.id, status })}
              onRelacao={(relacao) =>
                classificar.mutate({ handle: selected.authorHandle, relacao })
              }
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

const ICONE_DO_FORMATO: Record<PostFormat, typeof ImageIcon> = {
  a_definir: Lightbulb,
  imagem: ImageIcon,
  carrossel: Images,
  video: Video,
  story: CirclePlay,
};

/**
 * A peça que provocou a conversa, no topo dela.
 *
 * Fica antes do texto do comentário de propósito: quem abre a conversa lê a
 * origem primeiro e responde já sabendo do que a pessoa está falando. Antes
 * daqui a tela mostrava só o identificador interno da publicação, que não diz
 * formato, nem dia, nem tamanho — e obrigava a procurar a peça na mão.
 */
function OrigemDaConversa({
  postId,
  origem,
  conversasDaPeca,
}: {
  postId: string;
  origem: PecaDeOrigem | null;
  conversasDaPeca: number;
}) {
  if (!origem) {
    // Publicação apagada na rede, interação importada de uma planilha, ou
    // comentário em anúncio que nunca virou post. Dizer isso é melhor que
    // esconder: quem procura a peça precisa saber que não vai achar.
    return (
      <div className="rounded-xl border border-dashed border-border px-3.5 py-2.5 text-xs text-muted-foreground">
        Veio da publicação <code className="text-foreground">{postId}</code>, que não está mais na
        plataforma — pode ter sido apagada na rede ou ter entrado por importação.
      </div>
    );
  }

  const Icone = ICONE_DO_FORMATO[origem.formato];
  const quando = diaPorExtenso(origem.publicadoEm);

  return (
    <Link
      to="/social/publicacao/$postId"
      params={{ postId: origem.id }}
      className="block rounded-xl border border-border p-3 transition-colors hover:border-accent/60 hover:bg-secondary/40"
    >
      <div className="flex items-start gap-3">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-lg"
          style={{ background: origem.coverGradient }}
        >
          <Icone className="size-5 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-medium capitalize text-foreground">
              {nomeDoFormato(origem.formato)}
            </span>
            {origem.redes.map((rede) => (
              <NetworkChip key={rede} networkId={rede} />
            ))}
            {quando ? <span>· {quando}</span> : <span>· ainda não publicado</span>}
          </div>

          <p className="mt-1 line-clamp-2 text-sm">{origem.trecho}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {origem.metricas ? (
              <>
                <span>{formatCompact(origem.metricas.alcance)} de alcance</span>
                <span>{formatNumber(origem.metricas.curtidas)} curtidas</span>
                <span>{formatNumber(origem.metricas.comentarios)} comentários na rede</span>
              </>
            ) : (
              <span>sem números da rede ainda</span>
            )}
            {conversasDaPeca > 1 ? (
              <StatusPill tone="destaque">
                {conversasDaPeca} conversas nasceram desta peça
              </StatusPill>
            ) : null}
          </div>
        </div>

        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </Link>
  );
}

function RelacaoPill({ relacao }: { relacao: RelacaoPessoa }) {
  const info = RELACAO_INFO[relacao];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        background: `color-mix(in oklch, ${info.color} 18%, transparent)`,
        color: info.color,
      }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: info.color }} />
      {info.label}
    </span>
  );
}

function KindPill({ kind }: { kind: InboxItem["kind"] }) {
  return (
    <StatusPill tone="neutro">
      {kind === "comentario" ? <AtSign className="size-3" /> : <MessageCircle className="size-3" />}
      {kind === "comentario" ? "comentário" : "mensagem"}
    </StatusPill>
  );
}

/**
 * Resposta em lote.
 *
 * A prévia é o ponto do painel: antes de enviar, o time vê exatamente como o
 * texto chega para as primeiras pessoas, com as variáveis já trocadas. Uma
 * mensagem que sai igual para dez pessoas é o que a rede lê como spam.
 */
function BulkPanel({
  itens,
  accounts,
  texto,
  onTexto,
  erro,
  ignorados,
  enviando,
  onLimpar,
  onEnviar,
}: {
  itens: InboxItem[];
  accounts: SocialAccount[];
  texto: string;
  onTexto: (value: string) => void;
  erro: string | null;
  ignorados: { itemId: string; motivo: string }[];
  enviando: boolean;
  onLimpar: () => void;
  onEnviar: () => void;
}) {
  const contagem = contarPorRelacao(itens);
  const predominante = RELACOES.reduce((maior, relacao) =>
    contagem[relacao] > contagem[maior] ? relacao : maior,
  );
  const modelos = MODELOS_POR_RELACAO[predominante];
  const previa = itens.slice(0, 3);

  return (
    <div className="surface-card flex max-h-[70vh] min-w-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <Users className="size-5 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium">
            Falar com {itens.length} {itens.length === 1 ? "pessoa" : "pessoas"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {RELACOES.filter((relacao) => contagem[relacao] > 0)
              .map((relacao) => `${contagem[relacao]} ${RELACAO_INFO[relacao].label.toLowerCase()}`)
              .join(" · ")}
          </p>
        </div>
        <button
          type="button"
          onClick={onLimpar}
          className="ml-auto rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
        >
          Limpar seleção
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap gap-2">
          {modelos.map((modelo) => (
            <button
              key={modelo.titulo}
              type="button"
              onClick={() => onTexto(modelo.texto)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
            >
              Usar modelo: {modelo.titulo}
            </button>
          ))}
        </div>

        <div>
          <textarea
            rows={5}
            value={texto}
            onChange={(event) => onTexto(event.target.value)}
            placeholder="Escreva a mensagem que vai para as pessoas selecionadas…"
            className="w-full resize-y rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Variáveis:{" "}
            {VARIAVEIS_MODELO.map((variavel) => (
              <span key={variavel.chave} className="mr-2">
                <code className="rounded bg-secondary px-1">{variavel.chave}</code>{" "}
                {variavel.descricao.toLowerCase()}
              </span>
            ))}
          </p>
        </div>

        {texto.trim() ? (
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase">Como vai chegar</h3>
            {previa.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl rounded-tr-sm border border-border bg-primary/10 px-4 py-3"
              >
                <p className="text-[11px] text-muted-foreground">
                  para {item.authorName} ({item.authorHandle})
                </p>
                <p className="mt-1 text-sm">
                  {aplicarModelo(texto, { nome: item.authorName, handle: item.authorHandle })}
                </p>
              </div>
            ))}
            {itens.length > previa.length ? (
              <p className="text-[11px] text-muted-foreground">
                … e mais {itens.length - previa.length}.
              </p>
            ) : null}
          </section>
        ) : null}

        {ignorados.length > 0 ? (
          <section className="space-y-1.5 rounded-lg border border-border p-3">
            <h3 className="text-xs font-medium">
              {ignorados.length} não {ignorados.length === 1 ? "recebeu" : "receberam"}
            </h3>
            {ignorados.map((ignorado) => {
              const item = itens.find((candidate) => candidate.id === ignorado.itemId);
              return (
                <p key={ignorado.itemId} className="text-xs text-muted-foreground">
                  <span className="text-foreground">{item?.authorName ?? ignorado.itemId}</span> —{" "}
                  {ignorado.motivo}
                </p>
              );
            })}
          </section>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border p-4">
        {erro ? <InlineError>{erro}</InlineError> : null}
        <button
          type="button"
          onClick={onEnviar}
          disabled={enviando || texto.trim().length === 0}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {enviando ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Enviar para {itens.length} {itens.length === 1 ? "pessoa" : "pessoas"}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Comentários são respondidos publicamente na rede de origem. Mensagens diretas só saem
          dentro da janela de 24h depois do último contato da pessoa e em contas com mensageria
          aprovada — quem estiver fora aparece aqui com o motivo, sem tentativa de envio.
        </p>
      </div>
    </div>
  );
}

function ConversationPanel({
  item,
  account,
  origem,
  conversasDaPeca,
  users,
  texto,
  onTexto,
  erro,
  enviando,
  onEnviar,
  onAtribuir,
  onStatus,
  onRelacao,
}: {
  item: InboxItem;
  account?: SocialAccount;
  origem: PecaDeOrigem | null;
  conversasDaPeca: number;
  users: PlatformUser[];
  texto: string;
  onTexto: (value: string) => void;
  erro: string | null;
  enviando: boolean;
  onEnviar: () => void;
  onAtribuir: (userId: string) => void;
  onStatus: (status: "pendente" | "respondido") => void;
  onRelacao: (relacao: RelacaoPessoa) => void;
}) {
  const modelos = MODELOS_POR_RELACAO[item.relacao];

  return (
    <div className="surface-card flex max-h-[70vh] min-w-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <AccountAvatar gradient={item.avatarGradient} label={item.authorName} size={40} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.authorName}</span>
            <span className="text-sm text-muted-foreground">{item.authorHandle}</span>
            <RelacaoPill relacao={item.relacao} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <KindPill kind={item.kind} />
            {account ? <NetworkChip networkId={account.networkId} /> : null}
            {account ? <span>{account.handle}</span> : null}
            <span>· {item.interacoes} interações no total</span>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="relacao">
            Grau de relação
          </label>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
            <Users className="size-3.5 text-muted-foreground" />
            <select
              id="relacao"
              value={item.relacao}
              onChange={(event) => onRelacao(event.target.value as RelacaoPessoa)}
              className="bg-transparent text-xs outline-none"
            >
              {RELACOES.map((relacao) => (
                <option key={relacao} value={relacao}>
                  {RELACAO_INFO[relacao].label}
                </option>
              ))}
            </select>
          </div>

          <label className="sr-only" htmlFor="responsavel">
            Responsável
          </label>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
            <UserCheck className="size-3.5 text-muted-foreground" />
            <select
              id="responsavel"
              value={item.assignedTo ?? ""}
              onChange={(event) => onAtribuir(event.target.value)}
              className="bg-transparent text-xs outline-none"
            >
              <option value="">Sem responsável</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => onStatus(item.status === "pendente" ? "respondido" : "pendente")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
          >
            <CheckCheck className="size-3.5" />
            {item.status === "pendente" ? "Marcar como respondido" : "Reabrir"}
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {item.postId ? (
          <OrigemDaConversa
            postId={item.postId}
            origem={origem}
            conversasDaPeca={conversasDaPeca}
          />
        ) : null}

        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-secondary/50 px-4 py-3">
          <p className="text-sm">{item.text}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {formatDateTime(item.receivedAt)}
          </p>
        </div>

        {item.replies.map((reply) => (
          <div
            key={reply.id}
            className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/20 px-4 py-3"
          >
            <p className="text-sm">{reply.text}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {reply.author} · {formatDateTime(reply.sentAt)}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border p-4">
        {erro ? <InlineError>{erro}</InlineError> : null}
        <div className="flex flex-wrap gap-2">
          {modelos.map((modelo) => (
            <button
              key={modelo.titulo}
              type="button"
              onClick={() =>
                onTexto(
                  aplicarModelo(modelo.texto, {
                    nome: item.authorName,
                    handle: item.authorHandle,
                  }),
                )
              }
              className="rounded-lg border border-border px-2.5 py-1 text-[11px] hover:bg-secondary"
            >
              {modelo.titulo}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={texto}
            onChange={(event) => onTexto(event.target.value)}
            placeholder={`Responder ${item.kind === "comentario" ? "no comentário" : "na conversa"}…`}
            className="min-h-11 flex-1 resize-y rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={onEnviar}
            disabled={enviando || texto.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {enviando ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Enviar
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A resposta é publicada na rede de origem. Mensagens diretas dependem das permissões de
          mensageria aprovadas para a conta.
        </p>
      </div>
    </div>
  );
}
