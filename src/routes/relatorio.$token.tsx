import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Heart, Lock, Rocket, TrendingUp, Users } from "lucide-react";

import { obterRelatorioPublico } from "@/lib/api/social.functions";
import { GrowthChart, ReachChart } from "@/components/social/charts";
import {
  AccountAvatar,
  LoadingBlock,
  NetworkChip,
  SectionCard,
  StatCard,
} from "@/components/social/primitives";
import {
  formatCompact,
  formatCurrency,
  formatLongDay,
  formatNumber,
  formatPercent,
} from "@/lib/social/format";

/**
 * Página pública somente leitura de um relatório compartilhado (PRD 3.6).
 * Não exige sessão e só responde quando o link está ativo.
 */
export const Route = createFileRoute("/relatorio/$token")({
  head: () => ({
    meta: [
      { title: "Relatório — Social Hub" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Relatório de desempenho de redes sociais compartilhado." },
    ],
  }),
  component: RelatorioPublicoPage,
});

function RelatorioPublicoPage() {
  const { token } = Route.useParams();

  const relatorio = useQuery({
    queryKey: ["relatorio-publico", token],
    queryFn: () => obterRelatorioPublico({ data: { token } }),
  });

  if (relatorio.isPending) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-10">
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (!relatorio.data?.ok) {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
            <Lock className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Link indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este relatório não existe ou o compartilhamento público foi desativado pelo responsável.
          </p>
        </div>
      </div>
    );
  }

  const { report, project, accounts, summary, series, split, posts, boosts } = relatorio.data;
  const investido = boosts.reduce((total, boost) => total + boost.results.spend, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-10 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="grid size-11 place-items-center rounded-xl"
            style={{ background: "var(--gradient-brand)" }}
          >
            <BarChart3 className="size-5 text-white" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {project?.client ?? "Relatório"}
            </div>
            <h1 className="text-xl font-semibold">{report.title}</h1>
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>
            {formatLongDay(report.periodStart)} → {formatLongDay(report.periodEnd)}
          </div>
          <div className="text-xs">Somente leitura</div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {accounts.map((account) => (
          <span
            key={account.id}
            className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs"
          >
            <AccountAvatar
              gradient={account.avatarGradient}
              label={account.displayName}
              size={18}
            />
            {account.handle}
            <NetworkChip networkId={account.networkId} />
          </span>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Seguidores"
          value={formatNumber(summary.followers)}
          delta={summary.followersDeltaPct}
          hint={`${summary.followersDelta >= 0 ? "+" : ""}${formatNumber(summary.followersDelta)} no período`}
          icon={Users}
        />
        <StatCard label="Alcance" value={formatCompact(summary.reach)} icon={TrendingUp} />
        <StatCard
          label="Engajamento"
          value={formatCompact(summary.engagement)}
          hint={`Taxa de ${formatPercent(summary.engagementRate)}`}
          icon={Heart}
        />
        <StatCard label="Investimento" value={formatCurrency(investido)} icon={Rocket} />
      </div>

      <SectionCard title="Curva de crescimento" icon={TrendingUp}>
        <GrowthChart data={series} />
      </SectionCard>

      <SectionCard title="Alcance orgânico x pago" icon={Rocket}>
        <ReachChart data={series} />
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            <dt className="text-muted-foreground">Orgânico</dt>
            <dd className="mt-0.5 tabular-nums">
              {formatCompact(split.organic.reach)} de alcance ·{" "}
              {formatCompact(split.organic.engagement)} interações
            </dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            <dt className="text-muted-foreground">Pago</dt>
            <dd className="mt-0.5 tabular-nums">
              {formatCompact(split.paid.reach)} de alcance · {formatCurrency(split.paid.spend)}{" "}
              investidos
            </dd>
          </div>
        </dl>
      </SectionCard>

      {posts.length > 0 ? (
        <SectionCard title="Destaques do período" icon={Heart}>
          <ul className="divide-y divide-border">
            {posts.map((post) => (
              <li key={post.id} className="flex items-center gap-4 py-3">
                <span
                  className="size-11 shrink-0 rounded-lg"
                  style={{ background: post.coverGradient }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{post.caption}</p>
                  <p className="text-xs capitalize text-muted-foreground">{post.format}</p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <div className="font-semibold">{formatCompact(post.metrics?.reach ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">alcance</div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <footer className="pt-4 text-center text-xs text-muted-foreground">
        Relatório gerado pela plataforma de gestão de redes sociais da Ampliação Marketing Digital.
      </footer>
    </div>
  );
}
