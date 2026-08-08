import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  Heart,
  MessagesSquare,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";

import { obterPainel } from "@/lib/api/social.functions";
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
  formatNumber,
  formatPercent,
} from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { PeriodKey } from "@/lib/social/types";

export const Route = createFileRoute("/social/")({
  component: PainelPage,
});

function PainelPage() {
  const { projectId, session } = useSocialSession();
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const painel = useQuery({
    queryKey: ["social", "painel", projectId, period],
    queryFn: () => obterPainel({ data: { projectId: projectId ?? undefined, period } }),
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
            description="Barras empilhadas: quanto veio do orgânico e quanto veio de mídia paga."
            icon={TrendingUp}
          >
            <ReachChart data={data.series} />
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <QuickTile
              to="/social/caixa"
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
                  <li key={post.id} className="flex items-center gap-4 py-3">
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
                      <div className="font-semibold">{formatCompact(post.metrics?.reach ?? 0)}</div>
                      <div className="text-xs text-muted-foreground">alcance</div>
                    </div>
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
