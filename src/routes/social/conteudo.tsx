import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock,
  Hash,
  Image as ImagemIcone,
  Lightbulb,
  MessageSquare,
  ThumbsDown,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

import { analisarConteudo } from "@/lib/api/social.functions";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  PeriodFilter,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import { NOME_DO_FORMATO, type DesempenhoDoGrupo } from "@/lib/social/conteudo";
import {
  BLOCOS,
  DIAS_CURTOS,
  type HorariosDoFormato,
  type MapaDeHorarios,
  type Recomendacao,
} from "@/lib/social/horarios";
import {
  POST_STATUS_LABELS,
  formatCompact,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { PeriodKey } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/conteudo")({
  component: ConteudoPage,
});

/**
 * O que rendeu, o que não rendeu, e o caminho até cada peça.
 *
 * A tela é organizada de trás para frente em relação ao painel: começa pela
 * conclusão — o que funcionou —, depois mostra os cortes que sustentam a
 * conclusão, e só então a lista peça a peça. Quem tem pressa lê o topo; quem
 * vai discordar tem como chegar ao número.
 */
function ConteudoPage() {
  const { projectId } = useSocialSession();
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const dados = useQuery({
    queryKey: ["social", "conteudo", projectId, period],
    queryFn: () => analisarConteudo({ data: { projectId: projectId ?? undefined, period } }),
    enabled: Boolean(projectId),
  });

  const dado = dados.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conteúdo"
        description="Qual peça rendeu, qual não rendeu, e o que elas têm em comum."
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {dados.isPending || !dado ? (
        <LoadingBlock rows={4} />
      ) : dado.pecas.length === 0 ? (
        <EmptyState
          icon={ImagemIcone}
          title="Nenhuma publicação com números no período"
          description="Assim que houver publicações medidas, a análise aparece aqui."
        />
      ) : (
        <>
          <SectionCard
            title="O que os números do conteúdo dizem"
            description="Só entram grupos com pelo menos três peças. Duas peças boas são acaso, não padrão."
            icon={Lightbulb}
          >
            {dado.destaques.positivos.length === 0 && dado.destaques.negativos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum grupo se destacou o bastante para virar conclusão. Com mais publicações do
                mesmo formato ou assunto, os padrões aparecem.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <ListaDeDestaques
                  titulo="Está funcionando"
                  icone={TrendingUp}
                  grupos={dado.destaques.positivos}
                  tom="positivo"
                />
                <ListaDeDestaques
                  titulo="Não está rendendo"
                  icone={ThumbsDown}
                  grupos={dado.destaques.negativos}
                  tom="negativo"
                />
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Quando publicar"
            description="Do que já foi ao ar: em que dia e em que faixa do dia a campanha alcança mais gente."
            icon={Clock}
          >
            <QuandoPublicar horarios={dado.horarios} />
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Por formato" icon={ImagemIcone}>
              <Barras grupos={dado.porFormato} />
            </SectionCard>
            <SectionCard title="Por assunto" description="Das hashtags e da legenda." icon={Hash}>
              <Barras grupos={dado.porAssunto} />
            </SectionCard>
            <SectionCard title="Por dia da semana" icon={CalendarDays}>
              <Barras grupos={dado.porDiaDaSemana} />
            </SectionCard>
            <SectionCard title="Por horário" icon={Clock}>
              <Barras grupos={dado.porFaixaDeHorario} />
            </SectionCard>
          </div>

          <SectionCard
            title="Peça a peça"
            description="Ordenado por alcance. Clique para abrir a publicação com tudo o que ela gerou."
            icon={TrendingUp}
          >
            <ul className="divide-y divide-border">
              {dado.pecas.map((peca) => (
                <li key={peca.post.id}>
                  <Link
                    to="/social/publicacao/$postId"
                    params={{ postId: peca.post.id }}
                    className="-mx-2 flex min-w-0 items-start gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-secondary/50"
                  >
                    <span
                      aria-hidden
                      className="size-12 shrink-0 rounded-lg"
                      style={{ background: peca.post.coverGradient }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{peca.post.caption || "Sem legenda"}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{NOME_DO_FORMATO[peca.post.format]}</span>
                        {peca.post.publishedAt ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{formatDateTime(peca.post.publishedAt)}</span>
                          </>
                        ) : null}
                        <span aria-hidden>·</span>
                        <span>{POST_STATUS_LABELS[peca.post.status]}</span>
                        {peca.comentarios > 0 ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1">
                              <MessageSquare className="size-3" />
                              {peca.comentarios} na caixa
                            </span>
                          </>
                        ) : null}
                      </p>
                      {peca.assuntos.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {peca.assuntos.map((assunto) => (
                            <span
                              key={assunto}
                              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {assunto}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums">
                        {formatCompact(peca.alcance)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">alcance</div>
                      <div
                        className={cn(
                          "mt-1 text-[11px] font-medium tabular-nums",
                          peca.contraMedia >= 0 ? "text-emerald-600" : "text-destructive",
                        )}
                      >
                        {peca.contraMedia >= 0 ? "+" : ""}
                        {peca.contraMedia.toFixed(0)}% vs. média
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}

/**
 * O mapa de calor e as conclusões que saem dele.
 *
 * A ordem é deliberada: **a recomendação vem antes do mapa**. Quem abre a tela
 * quer saber que horas publicar, não estudar uma grade — o mapa fica logo
 * abaixo, para quem vai discordar da recomendação e precisa ver de onde ela saiu.
 *
 * A cor mede alcance médio, e a escala vem só das casas confiáveis: uma casa de
 * uma peça com alcance fora da curva esticaria a régua e achataria o resto do
 * mapa até tudo parecer igual.
 */
function QuandoPublicar({
  horarios,
}: {
  horarios: {
    mapa: MapaDeHorarios;
    melhoresCasas: Recomendacao[];
    melhoresBlocos: Recomendacao[];
    porFormato: HorariosDoFormato[];
  };
}) {
  const { mapa, melhoresCasas, melhoresBlocos: blocos, porFormato } = horarios;

  if (mapa.pecas === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma publicação com data e números no período — sem isso não há horário a recomendar.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Melhores horários
          </p>
          {blocos.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              As publicações estão espalhadas demais pelos horários para apontar um melhor. Publicar
              mais vezes na mesma faixa é o que faz o padrão aparecer.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {blocos.map((bloco, indice) => (
                <LinhaDeHorario key={bloco.bloco} posicao={indice + 1} recomendacao={bloco} />
              ))}
            </ol>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Cruzando com o dia da semana
          </p>
          {melhoresCasas.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Ainda não há publicações suficientes num mesmo dia e horário para cruzar os dois. O
              ranking ao lado, que soma os sete dias, já é confiável antes deste.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {melhoresCasas.map((casa, indice) => (
                <LinhaDeHorario
                  key={`${casa.dia}-${casa.bloco}`}
                  posicao={indice + 1}
                  recomendacao={casa}
                />
              ))}
            </ol>
          )}
        </div>
      </div>

      <MapaDeCalor mapa={mapa} />

      <div>
        <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Por tipo de conteúdo
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          A diferença entre formatos é real — story é consumido no intervalo do dia e reels à noite.
          Aqui o corte é só por faixa do dia: dividir as peças por formato já reduz muito a amostra.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {porFormato.map((item) => (
            <div key={item.formato} className="rounded-xl border border-border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{item.rotulo}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {item.pecas} {item.pecas === 1 ? "peça" : "peças"}
                </span>
              </div>

              {item.melhores.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{item.ressalva}</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {item.melhores.map((melhor) => (
                    <li key={melhor.bloco} className="text-sm">
                      <span className="font-medium tabular-nums">{melhor.quando}</span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {formatCompact(melhor.alcanceMedio)} de alcance médio ·{" "}
                        <ContraMedia valor={melhor.contraMedia} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LinhaDeHorario({
  posicao,
  recomendacao,
}: {
  posicao: number;
  recomendacao: Recomendacao;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border p-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs tabular-nums">
        {posicao}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{recomendacao.quando}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {formatCompact(recomendacao.alcanceMedio)} de alcance médio ·{" "}
          {formatPercent(recomendacao.taxaMedia)} de interação · {recomendacao.pecas}{" "}
          {recomendacao.pecas === 1 ? "peça" : "peças"}
        </p>
      </div>
      <ContraMedia valor={recomendacao.contraMedia} destaque />
    </li>
  );
}

function ContraMedia({ valor, destaque = false }: { valor: number; destaque?: boolean }) {
  const acima = valor >= 0;
  return (
    <span
      className={cn(
        "tabular-nums",
        destaque && "shrink-0 text-sm font-medium",
        acima ? "text-[oklch(0.55_0.13_165)]" : "text-[oklch(0.55_0.15_25)]",
      )}
    >
      {acima ? "+" : ""}
      {Math.round(valor)}% vs. média
    </span>
  );
}

/**
 * A grade de sete dias por oito faixas.
 *
 * Casas vazias continuam desenhadas: o olho compara linhas e colunas, e "nunca
 * publicamos nesse horário" é informação, não ausência dela. A casa com poucas
 * peças aparece com um tracejado — presente, mas visivelmente não conclusiva.
 */
function MapaDeCalor({ mapa }: { mapa: MapaDeHorarios }) {
  const casa = (dia: number, bloco: number) =>
    mapa.casas.find((item) => item.dia === dia && item.bloco === bloco);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-16" />
              {BLOCOS.map((bloco) => (
                <th
                  key={bloco.indice}
                  className="pb-1 text-[10px] font-medium tabular-nums text-muted-foreground"
                >
                  {bloco.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS_CURTOS.map((dia, indiceDoDia) => (
              <tr key={dia}>
                <th className="pr-2 text-right text-[11px] font-medium text-muted-foreground">
                  {dia}
                </th>
                {BLOCOS.map((bloco) => {
                  const atual = casa(indiceDoDia, bloco.indice);
                  const intensidade =
                    atual && atual.confiavel && mapa.maiorAlcance > 0
                      ? Math.min(atual.alcanceMedio / mapa.maiorAlcance, 1)
                      : 0;

                  return (
                    <td key={bloco.indice}>
                      <div
                        title={
                          atual && atual.pecas > 0
                            ? `${dia}, ${bloco.rotulo}: ${formatCompact(atual.alcanceMedio)} de alcance médio em ${atual.pecas} ${atual.pecas === 1 ? "peça" : "peças"}${atual.confiavel ? "" : " — poucas para concluir"}`
                            : `${dia}, ${bloco.rotulo}: nada publicado`
                        }
                        className={cn(
                          "grid h-8 place-items-center rounded-md text-[10px] tabular-nums",
                          !atual || atual.pecas === 0
                            ? "border border-dashed border-border text-transparent"
                            : atual.confiavel
                              ? "text-foreground"
                              : "border border-dashed border-border text-muted-foreground",
                        )}
                        style={
                          atual && atual.confiavel
                            ? {
                                // Uma cor só, variando a opacidade: duas cores
                                // dariam a impressão de duas categorias, e aqui
                                // é uma grandeza contínua.
                                background: `oklch(0.62 0.14 165 / ${0.12 + intensidade * 0.6})`,
                              }
                            : undefined
                        }
                      >
                        {atual && atual.pecas > 0 ? atual.pecas : "·"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        O número é quantas peças saíram naquele horário; a cor é o alcance médio delas. Casa
        tracejada tem peças de menos para virar conclusão — e casa vazia significa que nunca se
        publicou ali.
      </p>
    </div>
  );
}

function ListaDeDestaques({
  titulo,
  icone: Icone,
  grupos,
  tom,
}: {
  titulo: string;
  icone: typeof TrendingUp;
  grupos: DesempenhoDoGrupo[];
  tom: "positivo" | "negativo";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tom === "positivo"
          ? "border-emerald-600/30 bg-emerald-600/5"
          : "border-destructive/30 bg-destructive/5",
      )}
    >
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icone
          className={cn("size-4", tom === "positivo" ? "text-emerald-600" : "text-destructive")}
        />
        {titulo}
      </h3>
      {grupos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nada se destacou deste lado.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {grupos.map((grupo) => (
            <li key={`${grupo.rotulo}-${grupo.chave}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{grupo.rotulo}</span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    tom === "positivo" ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  {grupo.contraMedia >= 0 ? "+" : ""}
                  {grupo.contraMedia.toFixed(0)}%
                </span>
              </div>
              {/* O tamanho da amostra fica junto do número, não numa nota de
                  rodapé: é o que separa achado de acaso. */}
              <p className="text-xs text-muted-foreground">
                {formatNumber(grupo.alcanceMedio)} de alcance médio em {grupo.pecas} peça(s)
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Barras({ grupos }: { grupos: DesempenhoDoGrupo[] }) {
  if (grupos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados para este corte.</p>;
  }

  const maior = Math.max(...grupos.map((grupo) => grupo.alcanceMedio), 1);

  return (
    <ul className="space-y-3">
      {grupos.map((grupo) => (
        <li key={grupo.chave}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{grupo.rotulo}</span>
            <span className="shrink-0 tabular-nums">{formatCompact(grupo.alcanceMedio)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max((grupo.alcanceMedio / maior) * 100, 2)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {grupo.pecas} peça(s) · taxa {formatPercent(grupo.taxa)}
            {grupo.pecas < 3 ? (
              <StatusPill tone="neutro" className="ml-1.5">
                amostra pequena
              </StatusPill>
            ) : null}
          </p>
          {grupo.ressalva ? (
            // A barra ordena por alcance médio e não sabe que story joga outro
            // jogo. A ressalva vai colada ao número, não num rodapé: quem lê a
            // barra precisa ler a ressalva junto ou não lê.
            <p className="mt-0.5 text-[11px] text-accent">{grupo.ressalva}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
