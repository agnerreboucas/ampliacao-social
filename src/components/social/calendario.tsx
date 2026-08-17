import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  Eye,
  Heart,
  MapPin,
  MessageCircle,
  Plus,
  Send,
} from "lucide-react";

import {
  chaveDoDia,
  distribuirPorDia,
  gradeDoMes,
  horaDoItem,
  lerDia,
  nomeDoDiaDaSemana,
  type ItemDoDia,
} from "@/lib/social/agenda";
import { NOME_DO_FORMATO } from "@/lib/social/conteudo";
import { NETWORKS } from "@/lib/social/networks";
import { FASE_LABELS, TIPO_DE_EVENTO_LABELS } from "@/lib/social/format";
import type { Evento, FormatoPublicavel, NetworkId, Post, SocialAccount } from "@/lib/social/types";
import { cn } from "@/lib/utils";

/**
 * O calendário do mês, com os itens de cada dia.
 *
 * Uma decisão governa o desenho: **a célula do dia mostra pouco e o painel do
 * dia mostra tudo**. Encaixar seis itens numa caixa de dois centímetros produz
 * texto que ninguém lê e um mês que ninguém entende de relance. A célula mostra
 * quatro faixas e o resto vira "mais 2"; quem quer o detalhe clica no dia, e ele
 * se abre inteiro embaixo — e clicar no compromisso leva à tela dele.
 *
 * Os três papéis têm cores próprias e sempre as mesmas: evento, produção e
 * publicação. Trocar a cor entre as visões faria a pessoa reaprender o mapa a
 * cada aba.
 */

export type Visao = "producao" | "publicacao" | "tudo";

/** As fases que o quadro oferece como destino — `falhou` não é movimento. */
export type FaseDoQuadro = Exclude<Post["status"], "falhou">;

const COR_DO_PAPEL: Record<ItemDoDia["papel"], string> = {
  evento: "bg-[oklch(0.62_0.19_10)]",
  producao: "bg-[oklch(0.68_0.16_75)]",
  agendado: "bg-[oklch(0.58_0.15_250)]",
  publicado: "bg-[oklch(0.62_0.14_165)]",
};

/**
 * A faixa colorida de cada item dentro da célula do dia.
 *
 * Antes era um pontinho de seis pixels ao lado de um texto cinza, e um mês
 * cheio virava uma névoa de pontos: dava para contar quantas coisas havia no
 * dia, não para ver **de que tipo** elas eram sem parar e ler. A faixa com
 * fundo lavado é o que todo calendário que as pessoas já usam faz — e a cor
 * chega antes do texto, que é o ponto.
 *
 * O fundo é o mesmo tom da cor do papel a 12% e a barra à esquerda é o tom
 * cheio: legível nos dois temas sem uma segunda paleta.
 */
const FAIXA_DO_PAPEL: Record<ItemDoDia["papel"], { fundo: string; barra: string }> = {
  evento: {
    fundo:
      "bg-[oklch(0.62_0.19_10_/_0.14)] text-[oklch(0.45_0.17_10)] dark:text-[oklch(0.8_0.12_10)]",
    barra: "bg-[oklch(0.62_0.19_10)]",
  },
  producao: {
    fundo:
      "bg-[oklch(0.68_0.16_75_/_0.16)] text-[oklch(0.45_0.14_75)] dark:text-[oklch(0.84_0.11_75)]",
    barra: "bg-[oklch(0.68_0.16_75)]",
  },
  agendado: {
    fundo:
      "bg-[oklch(0.58_0.15_250_/_0.14)] text-[oklch(0.44_0.14_250)] dark:text-[oklch(0.82_0.1_250)]",
    barra: "bg-[oklch(0.58_0.15_250)]",
  },
  publicado: {
    fundo:
      "bg-[oklch(0.62_0.14_165_/_0.16)] text-[oklch(0.42_0.12_165)] dark:text-[oklch(0.82_0.1_165)]",
    barra: "bg-[oklch(0.62_0.14_165)]",
  },
};

const NOME_DO_PAPEL: Record<ItemDoDia["papel"], string> = {
  evento: "Compromisso",
  producao: "Em produção",
  agendado: "Agendado",
  publicado: "Publicado",
};

/** Só o que a visão pediu. É aqui que "produção", "publicação" e "tudo" diferem. */
function filtrarPorVisao(itens: ItemDoDia[], visao: Visao): ItemDoDia[] {
  if (visao === "tudo") return itens;
  if (visao === "publicacao") {
    return itens.filter((item) => item.papel === "agendado" || item.papel === "publicado");
  }
  return itens.filter((item) => item.papel === "evento" || item.papel === "producao");
}

export function CalendarioDoMes({
  ano,
  mes,
  eventos,
  posts,
  visao,
  diaAberto,
  onAbrirDia,
}: {
  ano: number;
  mes: number;
  eventos: Evento[];
  posts: Post[];
  visao: Visao;
  diaAberto: string | null;
  onAbrirDia: (dia: string) => void;
}) {
  const grade = gradeDoMes(ano, mes);
  const porDia = distribuirPorDia(eventos, posts);
  const hoje = chaveDoDia(new Date());

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((nome) => (
          <div key={nome}>{nome}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grade.map((dia) => {
          const doMes = lerDia(dia).getMonth() === mes;
          const itens = filtrarPorVisao(porDia.get(dia) ?? [], visao);
          const visiveis = itens.slice(0, 4);

          return (
            <button
              key={dia}
              type="button"
              onClick={() => onAbrirDia(dia)}
              className={cn(
                "min-h-[7.5rem] rounded-xl border p-1.5 text-left align-top transition-colors",
                diaAberto === dia
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-secondary/50",
                // O dia de fora do mês continua clicável, só recua: sumir com
                // ele quebraria a grade de sete colunas.
                !doMes && "opacity-45",
              )}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    dia === hoje
                      ? "grid size-6 place-items-center rounded-full bg-accent font-semibold text-accent-foreground"
                      : "px-1 text-muted-foreground",
                  )}
                >
                  {lerDia(dia).getDate()}
                </span>
                {itens.length > 0 ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {itens.length}
                  </span>
                ) : null}
              </div>

              <ul className="mt-1 space-y-1">
                {visiveis.map((item, indice) => {
                  const faixa = FAIXA_DO_PAPEL[item.papel];
                  const hora = horaDoItem(item);

                  return (
                    <li
                      key={`${dia}-${indice}`}
                      className={cn(
                        "flex items-center gap-1 overflow-hidden rounded-md py-0.5 pl-0.5 pr-1 text-[10px] leading-tight",
                        faixa.fundo,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("h-3.5 w-1 shrink-0 rounded-full", faixa.barra)}
                      />
                      {hora ? (
                        <span className="shrink-0 tabular-nums opacity-80">{hora}</span>
                      ) : null}
                      <span className="min-w-0 truncate font-medium">
                        {item.papel === "evento" ? item.evento.titulo : resumo(item.post)}
                      </span>
                    </li>
                  );
                })}
                {itens.length > visiveis.length ? (
                  <li className="pl-1 text-[10px] text-muted-foreground">
                    mais {itens.length - visiveis.length}
                  </li>
                ) : null}
              </ul>
            </button>
          );
        })}
      </div>

      <Legenda visao={visao} />
    </div>
  );
}

function Legenda({ visao }: { visao: Visao }) {
  const papeis: ItemDoDia["papel"][] =
    visao === "publicacao"
      ? ["agendado", "publicado"]
      : visao === "producao"
        ? ["evento", "producao"]
        : ["evento", "producao", "agendado", "publicado"];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      {papeis.map((papel) => (
        <span key={papel} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-full", COR_DO_PAPEL[papel])} />
          {NOME_DO_PAPEL[papel]}
        </span>
      ))}
    </div>
  );
}

/**
 * Em que redes a peça sai, e como ela foi.
 *
 * Antes o cartão mostrava "3" ao lado de um círculo — três o quê? Três contas,
 * mas nenhuma pista de **quais**, e um carrossel que vai só para o LinkedIn
 * parecia igual a um que vai para Instagram, Facebook e TikTok. O ponto colorido
 * de cada rede resolve isso sem ocupar espaço: é a mesma cor que a rede tem no
 * painel inteiro.
 *
 * E quando a peça já foi ao ar, os números vêm junto. Um quadro de produção que
 * mostra o que está sendo feito e esconde como foi o que já saiu obriga a pessoa
 * a trocar de tela para responder "valeu a pena?" — que é a pergunta que ela
 * está fazendo quando olha a coluna "publicado".
 */
function PontosDasRedes({ redes }: { redes: NetworkId[] }) {
  if (redes.length === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={redes.map((r) => NETWORKS[r].label).join(", ")}
    >
      {redes.map((rede, indice) => (
        <span
          key={`${rede}-${indice}`}
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: NETWORKS[rede].gradient }}
        />
      ))}
      <span className="sr-only">{redes.map((r) => NETWORKS[r].label).join(", ")}</span>
    </span>
  );
}

function NumerosDaPeca({ post, compacto = false }: { post: Post; compacto?: boolean }) {
  if (!post.metrics) return null;
  const formatar = (valor: number) => valor.toLocaleString("pt-BR");

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 tabular-nums",
        compacto && "gap-x-1.5",
      )}
    >
      <span className="inline-flex items-center gap-0.5" title="Alcance">
        <Eye className="size-3" />
        {formatar(post.metrics.reach)}
      </span>
      <span className="inline-flex items-center gap-0.5" title="Curtidas">
        <Heart className="size-3" />
        {formatar(post.metrics.likes)}
      </span>
      <span className="inline-flex items-center gap-0.5" title="Comentários">
        <MessageCircle className="size-3" />
        {formatar(post.metrics.comments)}
      </span>
    </span>
  );
}

function resumo(post: Post): string {
  const limpa = post.caption.replace(/\s+/g, " ").trim();
  return limpa.length > 40 ? `${limpa.slice(0, 40)}…` : limpa || "(sem legenda)";
}

/**
 * O dia aberto: tudo o que acontece nele, na ordem em que acontece.
 *
 * É a resposta ao "clico no dia e ele expande". Fica embaixo do calendário e
 * não numa janela sobreposta de propósito — assim dá para clicar de um dia para
 * o outro comparando, sem fechar e abrir.
 */
export function PainelDoDia({
  dia,
  itens,
  visao,
  onVincular,
  contas = [],
}: {
  dia: string;
  itens: ItemDoDia[];
  visao: Visao;
  onVincular?: (evento: Evento) => void;
  contas?: SocialAccount[];
}) {
  const redeDaConta = new Map(contas.map((conta) => [conta.id, conta.networkId]));
  const filtrados = filtrarPorVisao(itens, visao);

  if (filtrados.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nada neste dia{visao === "tudo" ? "" : " nesta visão"}.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {filtrados.map((item, indice) => (
        <li key={`${dia}-${indice}`}>
          {item.papel === "evento" ? (
            <CartaoDeEvento evento={item.evento} hora={horaDoItem(item)} onVincular={onVincular} />
          ) : (
            <CartaoDePeca
              post={item.post}
              papel={item.papel}
              hora={horaDoItem(item)}
              redes={item.post.accountIds
                .map((id) => redeDaConta.get(id))
                .filter((rede): rede is NetworkId => Boolean(rede))}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function CartaoDeEvento({
  evento,
  hora,
  onVincular,
}: {
  evento: Evento;
  hora: string | null;
  onVincular?: (evento: Evento) => void;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3">
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", COR_DO_PAPEL.evento)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-xs tabular-nums text-muted-foreground">
            {hora ?? "dia inteiro"}
          </span>
          {/* O título é o link, e não o cartão inteiro: o cartão já tem um
              botão dentro, e link envolvendo botão é HTML inválido — além de
              roubar o clique de quem só queria vincular uma peça. */}
          <Link
            to="/social/evento/$eventoId"
            params={{ eventoId: evento.id }}
            className="font-medium hover:text-accent hover:underline"
          >
            {evento.titulo}
          </Link>
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {TIPO_DE_EVENTO_LABELS[evento.tipo]}
          </span>
        </div>

        {evento.local ? (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {evento.local}
          </p>
        ) : null}

        {evento.descricao ? (
          <p className="mt-1 text-sm text-muted-foreground">{evento.descricao}</p>
        ) : null}

        <p className="mt-1.5 text-xs text-muted-foreground">
          {evento.postIds.length === 0
            ? "Nenhuma peça vinculada ainda."
            : `${evento.postIds.length} ${evento.postIds.length === 1 ? "peça vinculada" : "peças vinculadas"}.`}
          {onVincular ? (
            <button
              type="button"
              onClick={() => onVincular(evento)}
              className="ml-1.5 text-accent hover:underline"
            >
              vincular peças
            </button>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function CartaoDePeca({
  post,
  papel,
  hora,
  redes,
}: {
  post: Post;
  papel: ItemDoDia["papel"];
  hora: string | null;
  redes: NetworkId[];
}) {
  return (
    <Link
      to="/social/publicacao/$postId"
      params={{ postId: post.id }}
      className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-accent/60 hover:bg-secondary/40"
    >
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", COR_DO_PAPEL[papel])}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs tabular-nums text-muted-foreground">{hora ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{NOME_DO_PAPEL[papel]}</span>
          {post.format !== "a_definir" ? (
            <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
              {NOME_DO_FORMATO[post.format]}
            </span>
          ) : null}
          <PontosDasRedes redes={redes} />
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm">{resumo(post)}</p>
        {post.metrics ? (
          // Os números da peça publicada ficam aqui mesmo: quem olha o dia
          // quer saber como foi, e ir a outra tela para descobrir é atrito.
          <p className="mt-1 text-xs text-muted-foreground">
            <NumerosDaPeca post={post} />
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * O quadro de produção, com colunas que recolhem.
 *
 * Seis colunas abertas cabem numa tela de mesa e não cabem em nenhuma outra.
 * Recolher transforma a coluna numa faixa fina com o nome na vertical e a
 * contagem embaixo — a informação que sobrevive ao recolhimento é justamente a
 * que faz decidir se vale abrir: quantas peças estão paradas ali.
 *
 * As colunas vazias começam recolhidas. É a leitura certa do quadro: o que não
 * tem nada não deveria ocupar um sexto da largura, e o "0" na faixa continua
 * dizendo que a etapa existe e está vazia.
 *
 * Sem arrastar: os botões de mover são explícitos. Arrastar num quadro de seis
 * colunas é gesto difícil no celular — e a cobertura acontece no celular. Os
 * botões também dizem quais movimentos existem, que o arrastar esconde até a
 * pessoa tentar.
 */
/**
 * Os formatos oferecidos à pauta, com o nome que se usa falando.
 *
 * "Post simples" e "Reels" não são valores do domínio — são como as pessoas
 * chamam `imagem` e `video`. Escrever "imagem" e "vídeo" num botão faria alguém
 * procurar onde está o reels.
 */
const FORMATOS_DA_PAUTA: { id: FormatoPublicavel; rotulo: string }[] = [
  { id: "imagem", rotulo: "Post simples" },
  { id: "carrossel", rotulo: "Carrossel" },
  { id: "video", rotulo: "Reels / vídeo" },
  { id: "story", rotulo: "Story" },
];

export function QuadroDeProducao({
  colunas,
  onMover,
  podeMover,
  movendo,
  onCriar,
  recolhidas,
  onAlternar,
  onEscolherFormato,
  decidindo,
  contas,
}: {
  colunas: { fase: FaseDoQuadro; posts: Post[] }[];
  onMover: (postId: string, fase: FaseDoQuadro) => void;
  podeMover: (de: Post["status"], para: FaseDoQuadro) => boolean;
  movendo: string | null;
  onCriar?: (fase: FaseDoQuadro) => void;
  recolhidas: FaseDoQuadro[];
  onAlternar: (fase: FaseDoQuadro) => void;
  /** Quando ausente, a pauta mostra o aviso mas não oferece a escolha. */
  onEscolherFormato?: (postId: string, formato: FormatoPublicavel) => void;
  decidindo: string | null;
  /** Para traduzir as contas de destino em redes no cartão. */
  contas: SocialAccount[];
}) {
  const redeDaConta = new Map(contas.map((conta) => [conta.id, conta.networkId]));
  const redesDe = (post: Post): NetworkId[] =>
    post.accountIds
      .map((id) => redeDaConta.get(id))
      .filter((rede): rede is NetworkId => Boolean(rede));

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      {/* `items-start` e altura fixa na faixa: com `stretch`, a coluna recolhida
          esticava até a altura da maior e o rótulo vertical ia parar fora da
          tela, justamente a informação que o recolhimento devia preservar. */}
      <div className="flex items-start gap-3">
        {colunas.map((coluna, indice) => {
          const recolhida = recolhidas.includes(coluna.fase);

          if (recolhida) {
            return (
              <button
                key={coluna.fase}
                type="button"
                onClick={() => onAlternar(coluna.fase)}
                title={`Abrir ${FASE_LABELS[coluna.fase]}`}
                className="flex h-72 w-12 shrink-0 flex-col items-center justify-between rounded-2xl border border-border bg-card py-3 transition-colors hover:bg-secondary/60"
              >
                <span className="text-xs tabular-nums text-accent">{indice + 1}</span>
                <span
                  className="flex flex-1 items-center justify-center py-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {FASE_LABELS[coluna.fase]}
                </span>
                <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs tabular-nums">
                  {coluna.posts.length}
                </span>
              </button>
            );
          }

          return (
            <div
              key={coluna.fase}
              className="w-64 shrink-0 self-stretch rounded-2xl border border-border p-3"
            >
              <div className="flex items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-md bg-secondary text-[11px] tabular-nums text-accent">
                  {indice + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-[0.08em]">
                  {FASE_LABELS[coluna.fase]}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {coluna.posts.length}
                </span>
                <button
                  type="button"
                  onClick={() => onAlternar(coluna.fase)}
                  aria-label={`Recolher ${FASE_LABELS[coluna.fase]}`}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
              </div>

              {onCriar ? (
                <button
                  type="button"
                  onClick={() => onCriar(coluna.fase)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground"
                >
                  <Plus className="size-3.5" /> Nova peça aqui
                </button>
              ) : null}

              <ul className="mt-2 space-y-2">
                {coluna.posts.map((post) => (
                  <li key={post.id} className="rounded-lg border border-border p-2.5">
                    {post.origemEventoId ? (
                      // A marca de origem é o que o pedido chamou de "ideia da
                      // agenda": num quadro com pauta de todo tipo, é ela que
                      // diz que aquilo saiu de um compromisso real.
                      <Link
                        to="/social/evento/$eventoId"
                        params={{ eventoId: post.origemEventoId }}
                        className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent transition-colors hover:bg-accent/20"
                      >
                        <CalendarDays className="size-3" /> Da agenda
                      </Link>
                    ) : null}

                    <Link
                      to="/social/publicacao/$postId"
                      params={{ postId: post.id }}
                      className="block"
                    >
                      <p className="line-clamp-3 text-xs leading-snug">{resumo(post)}</p>
                    </Link>

                    {post.format === "a_definir" ? (
                      <div className="mt-2 rounded-lg border border-dashed border-border bg-secondary/40 p-2">
                        <p className="text-[10px] leading-tight text-muted-foreground">
                          Esta pauta ainda não tem formato. O que ela vai virar?
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {FORMATOS_DA_PAUTA.map((opcao) => (
                            <button
                              key={opcao.id}
                              type="button"
                              disabled={!onEscolherFormato || decidindo === post.id}
                              onClick={() => onEscolherFormato?.(post.id, opcao.id)}
                              className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] transition-colors hover:border-accent/60 hover:bg-secondary disabled:opacity-50"
                            >
                              {opcao.rotulo}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {post.format !== "a_definir" ? (
                        <span className="rounded border border-border px-1 py-0.5">
                          {NOME_DO_FORMATO[post.format]}
                        </span>
                      ) : null}
                      {post.scheduledFor ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {new Date(post.scheduledFor).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                      ) : null}
                      <PontosDasRedes redes={redesDe(post)} />
                    </div>

                    {post.metrics ? (
                      <div className="mt-1.5 text-[10px] text-muted-foreground">
                        <NumerosDaPeca post={post} compacto />
                      </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-1">
                      {colunas
                        .map((outra) => outra.fase)
                        .filter((fase) => podeMover(post.status, fase))
                        .map((fase) => (
                          <button
                            key={fase}
                            type="button"
                            disabled={movendo === post.id}
                            onClick={() => onMover(post.id, fase)}
                            className="rounded border border-border px-1.5 py-0.5 text-[10px] transition-colors hover:bg-secondary disabled:opacity-50"
                          >
                            → {FASE_LABELS[fase]}
                          </button>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A semana, em linha, para quem prefere ler sete dias a trinta. */
export function SemanaEmLinha({
  dias,
  eventos,
  posts,
  visao,
  diaAberto,
  onAbrirDia,
}: {
  dias: string[];
  eventos: Evento[];
  posts: Post[];
  visao: Visao;
  diaAberto: string | null;
  onAbrirDia: (dia: string) => void;
}) {
  const porDia = distribuirPorDia(eventos, posts);
  const hoje = chaveDoDia(new Date());

  return (
    <div className="grid gap-2 sm:grid-cols-7">
      {dias.map((dia) => {
        const itens = filtrarPorVisao(porDia.get(dia) ?? [], visao);
        return (
          <button
            key={dia}
            type="button"
            onClick={() => onAbrirDia(dia)}
            className={cn(
              "min-h-[7rem] rounded-xl border p-2 text-left transition-colors",
              diaAberto === dia
                ? "border-accent bg-accent/5"
                : "border-border hover:bg-secondary/50",
            )}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] uppercase text-muted-foreground">
                {nomeDoDiaDaSemana(dia)}
              </span>
              <span
                className={cn(
                  "text-sm tabular-nums",
                  dia === hoje ? "font-semibold text-accent" : "",
                )}
              >
                {lerDia(dia).getDate()}
              </span>
            </div>

            <ul className="mt-1.5 space-y-1">
              {itens.slice(0, 4).map((item, indice) => {
                const faixa = FAIXA_DO_PAPEL[item.papel];
                return (
                  <li
                    key={indice}
                    className={cn(
                      "flex items-center gap-1 overflow-hidden rounded-md py-0.5 pl-0.5 pr-1 text-[11px] leading-tight",
                      faixa.fundo,
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("h-3.5 w-1 shrink-0 rounded-full", faixa.barra)}
                    />
                    <span className="min-w-0 truncate font-medium">
                      {item.papel === "evento" ? item.evento.titulo : resumo(item.post)}
                    </span>
                  </li>
                );
              })}
              {itens.length > 4 ? (
                <li className="pl-1 text-[10px] text-muted-foreground">mais {itens.length - 4}</li>
              ) : null}
              {itens.length === 0 ? <li className="text-[10px] text-muted-foreground">—</li> : null}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

export { CalendarDays as IconeDaAgenda, Send as IconeDePublicacao };
