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
