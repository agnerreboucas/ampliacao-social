import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, CircleDot, Clock, MapPin, Plus, Send } from "lucide-react";

import {
  chaveDoDia,
  distribuirPorDia,
  gradeDoMes,
  horaDoItem,
  lerDia,
  nomeDoDiaDaSemana,
  type ItemDoDia,
} from "@/lib/social/agenda";
import { FASE_LABELS, TIPO_DE_EVENTO_LABELS } from "@/lib/social/format";
import type { Evento, Post } from "@/lib/social/types";
import { cn } from "@/lib/utils";

/**
 * O calendário do mês, com os itens de cada dia.
 *
 * Uma decisão governa o desenho: **a célula do dia mostra pouco e o painel do
 * dia mostra tudo**. Encaixar seis itens numa caixa de dois centímetros produz
 * texto que ninguém lê e um mês que ninguém entende de relance. A célula mostra
 * três marcas e o resto vira "+2"; quem quer o detalhe clica, e o dia se abre
 * inteiro embaixo.
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
          const visiveis = itens.slice(0, 3);

          return (
            <button
              key={dia}
              type="button"
              onClick={() => onAbrirDia(dia)}
              className={cn(
                "min-h-[5.5rem] rounded-lg border p-1.5 text-left align-top transition-colors",
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
                      ? "rounded-full bg-foreground px-1.5 py-0.5 font-semibold text-background"
                      : "text-muted-foreground",
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

              <ul className="mt-1 space-y-0.5">
                {visiveis.map((item, indice) => (
                  <li
                    key={`${dia}-${indice}`}
                    className="flex items-center gap-1 text-[10px] leading-tight"
                  >
                    <span
                      aria-hidden
                      className={cn("size-1.5 shrink-0 rounded-full", COR_DO_PAPEL[item.papel])}
                    />
                    <span className="min-w-0 truncate">
                      {item.papel === "evento" ? item.evento.titulo : resumo(item.post)}
                    </span>
                  </li>
                ))}
                {itens.length > visiveis.length ? (
                  <li className="text-[10px] text-muted-foreground">
                    +{itens.length - visiveis.length}
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
}: {
  dia: string;
  itens: ItemDoDia[];
  visao: Visao;
  onVincular?: (evento: Evento) => void;
}) {
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
            <CartaoDePeca post={item.post} papel={item.papel} hora={horaDoItem(item)} />
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
          <span className="font-medium">{evento.titulo}</span>
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
}: {
  post: Post;
  papel: ItemDoDia["papel"];
  hora: string | null;
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
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-xs tabular-nums text-muted-foreground">{hora ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{NOME_DO_PAPEL[papel]}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-sm">{resumo(post)}</p>
        {post.metrics ? (
          // Os números da peça publicada ficam aqui mesmo: quem olha o dia
          // quer saber como foi, e ir a outra tela para descobrir é atrito.
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {post.metrics.reach.toLocaleString("pt-BR")} de alcance ·{" "}
            {post.metrics.likes.toLocaleString("pt-BR")} curtidas ·{" "}
            {post.metrics.comments.toLocaleString("pt-BR")} comentários
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
export function QuadroDeProducao({
  colunas,
  onMover,
  podeMover,
  movendo,
  onCriar,
  recolhidas,
  onAlternar,
}: {
  colunas: { fase: FaseDoQuadro; posts: Post[] }[];
  onMover: (postId: string, fase: FaseDoQuadro) => void;
  podeMover: (de: Post["status"], para: FaseDoQuadro) => boolean;
  movendo: string | null;
  onCriar?: (fase: FaseDoQuadro) => void;
  recolhidas: FaseDoQuadro[];
  onAlternar: (fase: FaseDoQuadro) => void;
}) {
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
                    <Link
                      to="/social/publicacao/$postId"
                      params={{ postId: post.id }}
                      className="block"
                    >
                      <p className="line-clamp-3 text-xs leading-snug">{resumo(post)}</p>
                    </Link>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                      {post.scheduledFor ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {new Date(post.scheduledFor).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <CircleDot className="size-3" />
                        {post.accountIds.length}
                      </span>
                    </div>

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
              {itens.slice(0, 4).map((item, indice) => (
                <li key={indice} className="flex items-start gap-1 text-[11px] leading-tight">
                  <span
                    aria-hidden
                    className={cn("mt-1 size-1.5 shrink-0 rounded-full", COR_DO_PAPEL[item.papel])}
                  />
                  <span className="min-w-0 truncate">
                    {item.papel === "evento" ? item.evento.titulo : resumo(item.post)}
                  </span>
                </li>
              ))}
              {itens.length > 4 ? (
                <li className="text-[10px] text-muted-foreground">+{itens.length - 4}</li>
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
