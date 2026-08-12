import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeDollarSign,
  Heart,
  Lightbulb,
  Radar,
  Send,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useState } from "react";

import { obterPainelGeral } from "@/lib/api/social.functions";
import { GrowthChart } from "@/components/social/charts";
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
import { NETWORKS } from "@/lib/social/networks";
import {
  PERIOD_LABELS,
  formatCompact,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { LinhaDoCanal, PesoRecomendacao, Recomendacao } from "@/lib/social/recomendacoes";
import type { PeriodKey } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/geral")({
  component: GeralPage,
});

function GeralPage() {
  const { projectId, session } = useSocialSession();
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const geral = useQuery({
    queryKey: ["social", "geral", projectId, period],
    queryFn: () => obterPainelGeral({ data: { projectId: projectId ?? undefined, period } }),
    enabled: Boolean(projectId),
  });

  const projeto = session?.projects.find((item) => item.id === projectId)?.name ?? "";
  const dados = geral.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description={`Todos os canais de ${projeto} lado a lado — ${PERIOD_LABELS[period].toLowerCase()}.`}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {geral.isPending || !dados ? (
        <LoadingBlock rows={5} />
      ) : dados.canais.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhuma conta neste projeto"
          description="Conecte um perfil para a visão geral ter o que comparar."
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
              value={formatNumber(dados.totais.followers)}
              delta={dados.totais.followersDeltaPct}
              hint={`${dados.canais.length} canal(is) somados`}
              icon={Users}
            />
            <StatCard
              label="Alcance"
              value={formatCompact(dados.totais.reach)}
              delta={dados.totais.reachDelta}
              hint="vs. período anterior"
              icon={TrendingUp}
            />
            <StatCard
              label="Engajamento"
              value={formatCompact(dados.totais.engagement)}
              delta={dados.totais.engagementDelta}
              hint={`Taxa de ${formatPercent(dados.totais.engagementRate)}`}
              icon={Heart}
            />
            <StatCard
              label="Investido"
              value={formatCurrency(dados.totais.adSpend)}
              hint={`${dados.publicacoesNoPeriodo} publicação(ões) no período`}
              icon={BadgeDollarSign}
            />
          </div>

          <Recomendacoes lista={dados.recomendacoes} />

          <SectionCard
            title="Canal a canal"
            description="Ordenado por alcance. A participação mostra quanto cada canal representa do total."
            icon={Radar}
          >
            <TabelaDeCanais canais={dados.canais} />
          </SectionCard>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <SectionCard
              title="Curva consolidada"
              description="Seguidores somados de todos os canais."
              icon={TrendingUp}
              className="lg:col-span-2"
            >
              <GrowthChart data={dados.serie} />
            </SectionCard>

            <SectionCard
              title="Por rede"
              description="O mesmo alcance, agrupado pela rede em vez do perfil."
              icon={Send}
            >
              <ul className="space-y-2.5">
                {dados.redes.map((rede) => {
                  const fatia = dados.totais.reach > 0 ? rede.alcance / dados.totais.reach : 0;
                  return (
                    <li key={rede.networkId} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <NetworkChip networkId={rede.networkId} />
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCompact(rede.alcance)}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.max(fatia * 100, 1)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {formatNumber(rede.seguidores)} seguidores ·{" "}
                        {rede.contas === 1 ? "1 perfil" : `${rede.contas} perfis`} ·{" "}
                        {formatPercent(fatia * 100, 0)} do alcance
                      </p>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

const TOM_DA_RECOMENDACAO: Record<
  PesoRecomendacao,
  { rotulo: string; classe: string; icone: typeof Lightbulb }
> = {
  risco: {
    rotulo: "Risco",
    classe: "border-destructive/40 bg-destructive/5",
    icone: TriangleAlert,
  },
  atencao: { rotulo: "Atenção", classe: "border-accent/40 bg-accent/5", icone: Radar },
  oportunidade: { rotulo: "Oportunidade", classe: "border-border", icone: Lightbulb },
};

function Recomendacoes({ lista }: { lista: Recomendacao[] }) {
  return (
    <SectionCard
      title="O que os números sugerem"
      description="Cada observação vem com a conta que a sustenta. Sem base suficiente, a plataforma prefere não opinar."
      icon={Lightbulb}
    >
      {lista.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nada a apontar por enquanto. Com mais dias de histórico e mais publicações, as observações
          aparecem aqui — inventar conselho sobre dado ralo seria pior que ficar calado.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.map((recomendacao) => {
            const tom = TOM_DA_RECOMENDACAO[recomendacao.peso];
            const Icone = tom.icone;
            return (
              <li key={recomendacao.id} className={cn("min-w-0 rounded-xl border p-4", tom.classe)}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icone className="size-4 shrink-0 text-muted-foreground" />
                  <h3 className="min-w-0 flex-1 font-medium">{recomendacao.titulo}</h3>
                  <StatusPill tone={recomendacao.peso === "risco" ? "erro" : "neutro"}>
                    {recomendacao.area}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{recomendacao.acao}</p>
                {/* A evidência fica visualmente separada da sugestão de propósito:
                    é o que permite discordar do conselho sem discordar do número. */}
                <p className="mt-2.5 border-t border-border/60 pt-2 text-xs tabular-nums text-muted-foreground">
                  {recomendacao.evidencia}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function TabelaDeCanais({ canais }: { canais: LinhaDoCanal[] }) {
  return (
    // A tabela rola dentro do próprio quadro: numa tela estreita, o que não
    // pode acontecer é a página inteira deslizar de lado.
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-[0.1em] text-muted-foreground">
            <th className="pb-2 font-medium">Canal</th>
            <th className="pb-2 text-right font-medium">Seguidores</th>
            <th className="pb-2 text-right font-medium">Alcance</th>
            <th className="pb-2 text-right font-medium">Engajamento</th>
            <th className="pb-2 text-right font-medium">Taxa</th>
            <th className="pb-2 text-right font-medium">Investido</th>
            <th className="pb-2 text-right font-medium">Participação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {canais.map((canal) => (
            <tr key={canal.accountId} className="transition-colors hover:bg-secondary/40">
              <td className="py-3">
                <Link
                  to="/social/conta/$accountId"
                  params={{ accountId: canal.accountId }}
                  className="flex min-w-0 items-center gap-3"
                >
                  <AccountAvatar gradient={canal.avatarGradient} label={canal.nome} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{canal.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {NETWORKS[canal.networkId].label} · {canal.handle}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="py-3 text-right tabular-nums">
                {formatNumber(canal.seguidores)}
                <span
                  className={cn(
                    "ml-1.5 text-xs",
                    canal.variacaoSeguidores >= 0 ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  {canal.variacaoSeguidores >= 0 ? "+" : ""}
                  {formatNumber(canal.variacaoSeguidores)}
                </span>
              </td>
              <td className="py-3 text-right tabular-nums">{formatCompact(canal.alcance)}</td>
              <td className="py-3 text-right tabular-nums">{formatCompact(canal.engajamento)}</td>
              <td className="py-3 text-right tabular-nums">
                {formatPercent(canal.taxaEngajamento)}
              </td>
              <td className="py-3 text-right tabular-nums">{formatCurrency(canal.investido)}</td>
              <td className="py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(canal.participacao * 100, 1)}%` }}
                    />
                  </div>
                  <span className="w-10 text-right tabular-nums text-xs">
                    {formatPercent(canal.participacao * 100, 0)}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
