import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  ChevronDown,
  Eye,
  Heart,
  LoaderCircle,
  MessagesSquare,
  MousePointerClick,
  Radar,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";

import { detalharPeriodo, obterPainel, obterPainelGeral } from "@/lib/api/social.functions";
import { CartaoDeRede } from "@/components/social/cartao-rede";
import { Recomendacoes, TabelaDeCanais } from "@/components/social/resumo-dos-canais";
import { GrowthChart, ReachChart, SplitDonut } from "@/components/social/charts";
import {
  AccountAvatar,
  EmptyState,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  PeriodFilter,
  SectionCard,
  StatCard,
  StatusPill,
} from "@/components/social/primitives";
import {
  PERIOD_LABELS,
  formatCompact,
  formatCurrency,
  formatLongDay,
  formatNumber,
  formatPercent,
} from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { SeriesPoint } from "@/lib/social/analytics";
import type { PeriodKey } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/")({
  component: PainelPage,
});

function PainelPage() {
  const { projectId, session } = useSocialSession();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [pontoAberto, setPontoAberto] = useState<SeriesPoint | null>(null);

  const painel = useQuery({
    queryKey: ["social", "painel", projectId, period],
    queryFn: () => obterPainel({ data: { projectId: projectId ?? undefined, period } }),
    enabled: Boolean(projectId),
  });

  // A leitura canal a canal e as observações vinham de uma segunda tela, que
  // repetia todo o resto desta. Consulta separada porque é um cálculo à parte —
  // e porque o resto do painel não deve esperar por ela para aparecer.
  const resumo = useQuery({
    queryKey: ["social", "painel-geral", projectId, period],
    queryFn: () => obterPainelGeral({ data: { projectId: projectId ?? undefined, period } }),
    enabled: Boolean(projectId),
  });

  const projectName = session?.projects.find((project) => project.id === projectId)?.name ?? "";
  const data = painel.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel"
        description={`Crescimento consolidado de ${projectName} — ${PERIOD_LABELS[period].toLowerCase()}.`}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {painel.isPending || !data ? (
        <LoadingBlock rows={4} />
      ) : data.accounts.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhuma conta conectada neste projeto"
          description="Conecte um perfil do Instagram ou Facebook para começar a acompanhar o crescimento."
          action={
            <Link
              to="/social/contas"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Conectar conta <ArrowRight className="size-4" />
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Seguidores"
              value={formatNumber(data.summary.followers)}
              delta={data.summary.followersDeltaPct}
              hint={`${data.summary.followersDelta >= 0 ? "+" : ""}${formatNumber(data.summary.followersDelta)} no período`}
              icon={Users}
            />
            <StatCard
              label="Alcance"
              value={formatCompact(data.summary.reach)}
              delta={data.summary.reachDelta}
              hint="vs. período anterior"
              icon={TrendingUp}
            />
            <StatCard
              label="Engajamento"
              value={formatCompact(data.summary.engagement)}
              delta={data.summary.engagementDelta}
              hint={`Taxa de ${formatPercent(data.summary.engagementRate)}`}
              icon={Heart}
            />
            <StatCard
              label="Investimento em mídia"
              value={formatCurrency(data.summary.adSpend)}
              hint={`${data.activeBoosts} impulsionamento(s) ativo(s)`}
              icon={BadgeDollarSign}
            />
          </div>

          <SectionCard
            title="Suas redes"
            description="Cada rede com o próprio quadro. Clique em uma para abrir o detalhe dela."
            icon={Radar}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.redes.map((rede) => (
                <CartaoDeRede key={rede.networkId} {...rede} />
              ))}
            </div>
          </SectionCard>

          {/*
            As observações vêm depois dos cartões, e não antes.
            Com seis redes, o bloco de recomendações empurrava as duas últimas
            para fora da primeira dobra — e cartão que só se vê rolando não dá
            panorama nenhum. A ordem também ficou mais correta: primeiro o que
            aconteceu, depois a leitura do que aconteceu.
          */}
          {resumo.data ? <Recomendacoes lista={resumo.data.recomendacoes} /> : null}

          {resumo.data ? (
            <SectionCard
              title="Canal a canal"
              description="Ordenado por alcance. A participação mostra quanto cada canal representa do total."
              icon={Radar}
            >
              <TabelaDeCanais canais={resumo.data.canais} />
            </SectionCard>
          ) : null}

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <SectionCard
              title="Curva de crescimento"
              description="Seguidores somados de todas as contas do projeto."
              icon={TrendingUp}
              className="lg:col-span-2"
            >
              <GrowthChart data={data.series} />
            </SectionCard>

            <SectionCard
              title="Orgânico x pago"
              description="Participação no alcance do período."
              icon={Rocket}
            >
              <SplitDonut split={data.split} />
              <dl className="mt-4 space-y-3 text-sm">
                <SplitRow
                  color="var(--color-accent)"
                  label="Orgânico"
                  reach={data.split.organic.reach}
                  impressions={data.split.organic.impressions}
                  engagement={data.split.organic.engagement}
                />
                <SplitRow
                  color="var(--color-primary)"
                  label="Pago"
                  reach={data.split.paid.reach}
                  impressions={data.split.paid.impressions}
                  engagement={data.split.paid.engagement}
                  extra={`${formatCurrency(data.split.paid.spend)} investidos`}
                />
              </dl>
            </SectionCard>
          </div>

          <SectionCard
            title="Alcance por origem"
            description="Barras empilhadas: quanto veio do orgânico e quanto veio de mídia paga. Clique em um dia para abrir o detalhamento por canal."
            icon={TrendingUp}
            actions={
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MousePointerClick className="size-3.5" />
                clique em uma barra
              </span>
            }
          >
            <ReachChart
              data={data.series}
              onSelecionarDia={setPontoAberto}
              diaSelecionado={pontoAberto?.date ?? null}
            />
          </SectionCard>

          {pontoAberto ? (
            <DetalhamentoDoDia
              ponto={pontoAberto}
              projectId={projectId}
              onFechar={() => setPontoAberto(null)}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <QuickTile
              to="/social/relacionamento"
              icon={MessagesSquare}
              label="Interações pendentes"
              value={data.pendingInbox}
              hint="comentários e mensagens sem resposta"
            />
            <QuickTile
              to="/social/publicacoes"
              icon={CalendarClock}
              label="Na fila de publicação"
              value={data.scheduled}
              hint="agendados e aguardando aprovação"
            />
            <QuickTile
              to="/social/impulsionamentos"
              icon={Rocket}
              label="Impulsionamentos ativos"
              value={data.activeBoosts}
              hint="campanhas em veiculação"
            />
          </div>

          <SectionCard
            title="Contas do projeto"
            description="Evolução individual no período selecionado."
            icon={Users}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {data.accounts.map(({ account, summary, daysTracked }) => (
                <Link
                  key={account.id}
                  to="/social/conta/$accountId"
                  params={{ accountId: account.id }}
                  className="flex min-w-0 items-center gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-secondary/50"
                >
                  <AccountAvatar gradient={account.avatarGradient} label={account.displayName} />
                  <div className="min-w-0 flex-1">
                    {/* Em telas estreitas o chip da rede desce para a linha de
                        baixo em vez de comer o espaço do nome da conta. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{account.displayName}</span>
                      <NetworkChip networkId={account.networkId} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatNumber(summary.followers)} seguidores ·{" "}
                      {daysTracked > 0 ? `${daysTracked} dias de histórico` : "sem histórico ainda"}
                    </div>
                  </div>
                  <StatusPill tone={summary.followersDelta >= 0 ? "positivo" : "erro"}>
                    {summary.followersDelta >= 0 ? "+" : ""}
                    {formatNumber(summary.followersDelta)}
                  </StatusPill>
                </Link>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Publicações com maior alcance"
            description="Os cinco posts que mais alcançaram pessoas."
            icon={Sparkles}
          >
            {data.topPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma publicação com métricas consolidadas ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {data.topPosts.map((post) => (
                  <li key={post.id}>
                    <Link
                      to="/social/publicacao/$postId"
                      params={{ postId: post.id }}
                      className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-secondary/50"
                    >
                      <span
                        className="size-11 shrink-0 rounded-lg"
                        style={{ background: post.coverGradient }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{post.caption}</p>
                        <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                          {post.format}
                        </p>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        <div className="font-semibold">
                          {formatCompact(post.metrics?.reach ?? 0)}
                        </div>
                        <div className="text-xs text-muted-foreground">alcance</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function SplitRow({
  color,
  label,
  reach,
  impressions,
  engagement,
  extra,
}: {
  color: string;
  label: string;
  reach: number;
  impressions: number;
  engagement: number;
  extra?: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <span className="font-medium">{label}</span>
        <span className="ml-auto tabular-nums">{formatCompact(reach)}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {formatCompact(impressions)} impressões · {formatCompact(engagement)} interações
        {extra ? ` · ${extra}` : ""}
      </div>
    </div>
  );
}

function QuickTile({
  to,
  icon: Icon,
  label,
  value,
  hint,
}: {
  to: string;
  icon: typeof MessagesSquare;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="surface-card flex items-center gap-4 p-5 transition-colors hover:bg-card-elevated"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-secondary text-accent">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <ArrowRight className="ml-auto size-4 text-muted-foreground" />
    </Link>
  );
}

/**
 * O que aconteceu no dia que o usuário clicou, canal por canal.
 *
 * Duas camadas de profundidade, porque é assim que a pergunta costuma vir: "o
 * que houve nesse dia?" e, logo em seguida, "o que houve nesse dia *no
 * Instagram*?". A primeira camada compara os canais entre si; a segunda abre um
 * canal e mostra tudo que ele registrou — inclusive de onde os números vieram.
 */
function DetalhamentoDoDia({
  ponto,
  projectId,
  onFechar,
}: {
  ponto: SeriesPoint;
  projectId: string | null;
  onFechar: () => void;
}) {
  const [canalAberto, setCanalAberto] = useState<string | null>(null);

  const detalhe = useQuery({
    queryKey: ["social", "detalhe", projectId, ponto.inicio, ponto.date],
    queryFn: () =>
      detalharPeriodo({
        data: { projectId: projectId ?? undefined, inicio: ponto.inicio, fim: ponto.date },
      }),
    enabled: Boolean(projectId),
  });

  const agrupado = ponto.dias > 1;
  const titulo = agrupado
    ? `${formatLongDay(ponto.inicio)} a ${formatLongDay(ponto.date)}`
    : formatLongDay(ponto.date);

  return (
    <SectionCard
      title={agrupado ? `Detalhamento de ${ponto.dias} dias` : "Detalhamento do dia"}
      description={
        agrupado
          ? `${titulo} — esta barra agrupa ${ponto.dias} dias, e os números abaixo somam o período inteiro.`
          : titulo
      }
      icon={Eye}
      actions={
        <button
          type="button"
          onClick={onFechar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
        >
          <X className="size-3.5" />
          Fechar
        </button>
      }
    >
      {detalhe.isPending ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Abrindo o dia…
        </div>
      ) : !detalhe.data ? (
        <p className="py-4 text-sm text-muted-foreground">Não foi possível abrir este dia.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ResumoDoDia rotulo="Alcance total" valor={formatNumber(detalhe.data.totais.alcance)} />
            <ResumoDoDia
              rotulo="Orgânico x pago"
              valor={`${formatCompact(detalhe.data.totais.organico)} · ${formatCompact(detalhe.data.totais.pago)}`}
            />
            <ResumoDoDia
              rotulo="Engajamento"
              valor={formatNumber(detalhe.data.totais.engajamento)}
            />
            <ResumoDoDia rotulo="Investido" valor={formatCurrency(detalhe.data.totais.investido)} />
          </div>

          <ul className="space-y-2">
            {detalhe.data.canais.map((canal) => {
              const aberto = canalAberto === canal.conta.id;
              const participacao =
                detalhe.data.totais.alcance > 0 ? canal.alcance / detalhe.data.totais.alcance : 0;

              return (
                <li
                  key={canal.conta.id}
                  className="overflow-hidden rounded-xl border border-border"
                >
                  <button
                    type="button"
                    onClick={() => setCanalAberto(aberto ? null : canal.conta.id)}
                    className="flex w-full min-w-0 flex-wrap items-center gap-3 p-3 text-left transition-colors hover:bg-secondary/50"
                  >
                    <AccountAvatar
                      gradient={canal.conta.avatarGradient}
                      label={canal.conta.displayName}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {canal.conta.displayName}
                        </span>
                        <NetworkChip networkId={canal.conta.networkId} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{canal.conta.handle}</p>
                    </div>

                    {canal.temDado ? (
                      <div className="flex shrink-0 items-center gap-4 text-right">
                        <div>
                          <div className="text-sm font-semibold tabular-nums">
                            {formatNumber(canal.alcance)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {formatPercent(participacao)} do alcance
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            aberto && "rotate-180",
                          )}
                        />
                      </div>
                    ) : (
                      <StatusPill tone="neutro">sem dado neste dia</StatusPill>
                    )}
                  </button>

                  {aberto && canal.temDado ? <DetalheDoCanal canal={canal} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function ResumoDoDia({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

type CanalDetalhado = Awaited<ReturnType<typeof detalharPeriodo>>["canais"][number];

function DetalheDoCanal({ canal }: { canal: CanalDetalhado }) {
  const linhas: { rotulo: string; valor: string }[] = [
    { rotulo: "Alcance orgânico", valor: formatNumber(canal.soma.organicReach) },
    { rotulo: "Alcance pago", valor: formatNumber(canal.soma.paidReach) },
    { rotulo: "Impressões orgânicas", valor: formatNumber(canal.soma.organicImpressions) },
    { rotulo: "Impressões pagas", valor: formatNumber(canal.soma.paidImpressions) },
    { rotulo: "Engajamento orgânico", valor: formatNumber(canal.soma.organicEngagement) },
    { rotulo: "Engajamento pago", valor: formatNumber(canal.soma.paidEngagement) },
    { rotulo: "Taxa de engajamento", valor: formatPercent(canal.taxaEngajamento) },
    { rotulo: "Seguidores ganhos", valor: formatNumber(canal.soma.followersGained) },
    { rotulo: "Seguidores perdidos", valor: formatNumber(canal.soma.followersLost) },
    {
      rotulo: "Seguidores no fim do dia",
      valor: canal.followers === null ? "—" : formatNumber(canal.followers),
    },
    { rotulo: "Investido", valor: formatCurrency(canal.soma.adSpend) },
    { rotulo: "Interações recebidas", valor: formatNumber(canal.interacoes) },
  ];

  return (
    <div className="space-y-4 border-t border-border bg-secondary/20 p-4">
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        {linhas.map((linha) => (
          <div
            key={linha.rotulo}
            className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border/60 pb-1"
          >
            <dt className="truncate text-xs text-muted-foreground">{linha.rotulo}</dt>
            <dd className="shrink-0 text-sm font-medium tabular-nums">{linha.valor}</dd>
          </div>
        ))}
      </dl>

      {canal.publicacoes.length > 0 ? (
        <section>
          <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Publicado neste período
          </h4>
          <ul className="mt-2 space-y-1.5">
            {canal.publicacoes.map((post) => (
              <li key={post.id}>
                <Link
                  to="/social/publicacao/$postId"
                  params={{ postId: post.id }}
                  className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card/40 p-2.5 transition-colors hover:bg-secondary/60"
                >
                  <span
                    aria-hidden
                    className="size-8 shrink-0 rounded-md"
                    style={{ background: post.coverGradient }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {post.caption || "Sem legenda"}
                  </span>
                  {post.metrics ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatCompact(post.metrics.reach)} alcance
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canal.leituras.length > 0 ? (
        <section>
          <h4 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            De onde vieram estes números
          </h4>
          <ul className="mt-2 space-y-1">
            {canal.leituras.map((leitura) => (
              <li key={leitura.id} className="text-[11px] text-muted-foreground">
                Leitura manual de {leitura.autor} em{" "}
                {new Date(leitura.registradaEm).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link
        to="/social/conta/$accountId"
        params={{ accountId: canal.conta.id }}
        className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
      >
        Ver o histórico completo deste canal
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
