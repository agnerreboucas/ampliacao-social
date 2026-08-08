import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeDollarSign,
  Clock,
  Heart,
  History,
  Info,
  MapPin,
  Rocket,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";

import { obterConta } from "@/lib/api/social.functions";
import { ActivityChart, GrowthChart, ReachChart, SpendChart } from "@/components/social/charts";
import {
  AccountAvatar,
  ConnectionPill,
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
import type { PeriodKey } from "@/lib/social/types";

export const Route = createFileRoute("/social/conta/$accountId")({
  component: ContaPage,
});

function ContaPage() {
  const { accountId } = Route.useParams();
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const conta = useQuery({
    queryKey: ["social", "conta", accountId, period],
    queryFn: () => obterConta({ data: { accountId, period } }),
  });

  if (conta.isPending || !conta.data) {
    return <LoadingBlock rows={5} />;
  }

  const {
    account,
    summary,
    series,
    split,
    audience,
    capabilities,
    boosts,
    posts,
    firstDay,
    windowDays,
  } = conta.data;

  const costPerThousand = split.paid.reach > 0 ? (split.paid.spend / split.paid.reach) * 1000 : 0;

  return (
    <div className="space-y-6">
      <Link
        to="/social/contas"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Contas conectadas
      </Link>

      <PageHeader
        title={account.displayName}
        description={`${account.handle} · acompanhando desde ${formatLongDay(account.trackingSince)}`}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <AccountAvatar gradient={account.avatarGradient} label={account.displayName} size={32} />
        <NetworkChip networkId={account.networkId} />
        <ConnectionPill status={account.status} />
        {account.adAccountConnected ? (
          <StatusPill tone="destaque">
            <BadgeDollarSign className="size-3" /> Anúncios conectados
          </StatusPill>
        ) : null}
        <StatusPill tone="neutro">{windowDays} dias no filtro atual</StatusPill>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Seguidores"
          value={formatNumber(summary.followers)}
          delta={summary.followersDeltaPct}
          hint={`${summary.followersDelta >= 0 ? "+" : ""}${formatNumber(summary.followersDelta)} no período`}
          icon={Users}
        />
        <StatCard
          label="Alcance"
          value={formatCompact(summary.reach)}
          delta={summary.reachDelta}
          hint={PERIOD_LABELS[period]}
          icon={TrendingUp}
        />
        <StatCard
          label="Engajamento"
          value={formatCompact(summary.engagement)}
          delta={summary.engagementDelta}
          hint={`Taxa de ${formatPercent(summary.engagementRate)}`}
          icon={Heart}
        />
        <StatCard
          label="Investimento"
          value={formatCurrency(summary.adSpend)}
          hint={
            costPerThousand > 0
              ? `${formatCurrency(costPerThousand)} por mil alcançados`
              : "sem mídia paga"
          }
          icon={BadgeDollarSign}
        />
      </div>

      <SectionCard
        title="Evolução desde o início do acompanhamento"
        description={
          firstDay
            ? `Curva completa a partir de ${formatLongDay(firstDay)}, independente do filtro de período.`
            : "Ainda não há histórico sincronizado para esta conta."
        }
        icon={History}
      >
        {conta.data.lifetimeSeries.length > 1 ? (
          <GrowthChart data={conta.data.lifetimeSeries} height={280} />
        ) : (
          <p className="text-sm text-muted-foreground">
            A primeira sincronização ainda não trouxe pontos suficientes para desenhar a curva. Os
            dados aparecem aqui assim que a rede responder.
          </p>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Crescimento no período"
          description={PERIOD_LABELS[period]}
          icon={TrendingUp}
        >
          <GrowthChart data={series} />
        </SectionCard>
        <SectionCard
          title="Alcance orgânico x pago"
          description="Barras empilhadas por período agregado."
          icon={Rocket}
        >
          <ReachChart data={series} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Comparativo do período" icon={Rocket} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-2 font-medium">Métrica</th>
                  <th className="pb-2 text-right font-medium">Orgânico</th>
                  <th className="pb-2 text-right font-medium">Pago</th>
                  <th className="pb-2 text-right font-medium">Participação paga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                <ComparisonRow
                  label="Alcance"
                  organic={split.organic.reach}
                  paid={split.paid.reach}
                />
                <ComparisonRow
                  label="Impressões"
                  organic={split.organic.impressions}
                  paid={split.paid.impressions}
                />
                <ComparisonRow
                  label="Engajamento"
                  organic={split.organic.engagement}
                  paid={split.paid.engagement}
                />
                <tr>
                  <td className="py-2">Investimento</td>
                  <td className="py-2 text-right text-muted-foreground">—</td>
                  <td className="py-2 text-right">{formatCurrency(split.paid.spend)}</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {costPerThousand > 0 ? `${formatCurrency(costPerThousand)} / mil` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Investimento no tempo" icon={BadgeDollarSign}>
          <SpendChart data={series} />
        </SectionCard>
      </div>

      <SectionCard
        title="Perfil do público"
        description="Disponível conforme o que a API da rede expõe."
        icon={Users}
      >
        {!audience || !audience.available ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              {audience?.unavailableReason ??
                `A API do ${capabilities.label} não expõe dados de perfil do público para esta conta.`}{" "}
              Os números de novos seguidores continuam disponíveis pela sincronização diária.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-3">
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <UserPlus className="size-3.5" /> Últimos 30 dias
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">
                  +{formatNumber(audience.newFollowers)}
                </div>
                <div className="text-xs text-muted-foreground">
                  novos seguidores · {formatNumber(audience.unfollows)} deixaram de seguir
                </div>
              </div>
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <MapPin className="size-3.5" /> Principais cidades
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {audience.topCities.map((city) => (
                    <li key={city.city} className="flex items-center gap-3">
                      <span className="w-28 truncate">{city.city}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${city.share}%` }}
                        />
                      </span>
                      <span className="tabular-nums text-muted-foreground">{city.share}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <Heart className="size-3.5" /> Quem mais interage
              </div>
              <ul className="mt-3 space-y-3">
                {audience.topInteractors.map((person) => (
                  <li key={person.handle} className="flex items-center gap-3">
                    <AccountAvatar gradient={person.avatarGradient} label={person.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{person.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{person.handle}</div>
                    </div>
                    <span className="text-sm tabular-nums">{person.interactions}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <Clock className="size-3.5" /> Horários de maior atividade
              </div>
              <div className="mt-3">
                <ActivityChart data={audience.activityByHour} />
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Publicações recentes" icon={TrendingUp}>
          {posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma publicação nesta conta ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link
                    to="/social/publicacao/$postId"
                    params={{ postId: post.id }}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-secondary/50"
                  >
                    <span
                      className="size-10 shrink-0 rounded-lg"
                      style={{ background: post.coverGradient }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{post.caption}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {post.format} · {post.status.replace("_", " ")}
                      </p>
                    </div>
                    {post.metrics ? (
                      <span className="text-sm tabular-nums">
                        {formatCompact(post.metrics.reach)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Impulsionamentos da conta" icon={Rocket}>
          {boosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum impulsionamento registrado para esta conta.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {boosts.map((boost) => (
                <li key={boost.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm capitalize">{boost.objective}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(boost.budgetTotal)} · {boost.durationDays} dias
                    </p>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <div>{formatCompact(boost.results.reach)}</div>
                    <div className="text-xs text-muted-foreground">alcance</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ComparisonRow({ label, organic, paid }: { label: string; organic: number; paid: number }) {
  const total = organic + paid;
  const share = total > 0 ? (paid / total) * 100 : 0;
  return (
    <tr>
      <td className="py-2">{label}</td>
      <td className="py-2 text-right">{formatNumber(organic)}</td>
      <td className="py-2 text-right">{formatNumber(paid)}</td>
      <td className="py-2 text-right text-muted-foreground">{formatPercent(share)}</td>
    </tr>
  );
}
