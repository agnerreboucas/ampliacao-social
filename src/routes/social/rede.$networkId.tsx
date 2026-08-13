import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeDollarSign,
  Heart,
  Lightbulb,
  MessagesSquare,
  Rocket,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";

import { obterRede } from "@/lib/api/social.functions";
import { GrowthChart, SplitDonut } from "@/components/social/charts";
import {
  AccountAvatar,
  EmptyState,
  LoadingBlock,
  PageHeader,
  PeriodFilter,
  SectionCard,
  StatCard,
  StatusPill,
} from "@/components/social/primitives";
import { NETWORKS, statusLabel } from "@/lib/social/networks";
import {
  PERIOD_LABELS,
  formatCompact,
  formatCurrency,
  formatNumber,
  formatPercent,
} from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { NetworkId, PeriodKey } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/rede/$networkId")({
  component: RedePage,
});

/**
 * O segundo nível do painel: uma rede social por inteiro.
 *
 * O caminho é sempre o mesmo — o painel resume tudo, o cartão da rede abre
 * aqui, e cada perfil daqui abre o próprio detalhe. Cada passo responde uma
 * pergunta mais estreita, e nenhuma tela tenta responder as três.
 */
function RedePage() {
  const { networkId } = Route.useParams();
  const { projectId } = useSocialSession();
  const [period, setPeriod] = useState<PeriodKey>("30d");

  const rede = NETWORKS[networkId as NetworkId];

  const dados = useQuery({
    queryKey: ["social", "rede", networkId, projectId, period],
    queryFn: () =>
      obterRede({
        data: {
          networkId: networkId as NetworkId,
          projectId: projectId ?? undefined,
          period,
        },
      }),
    enabled: Boolean(projectId) && Boolean(rede),
  });

  if (!rede) {
    return (
      <EmptyState
        icon={Send}
        title="Rede desconhecida"
        description="O endereço aponta para uma rede que a plataforma não conhece."
        action={
          <Link to="/social" className="text-sm text-accent hover:underline">
            Voltar ao painel
          </Link>
        }
      />
    );
  }

  const dado = dados.data;

  return (
    <div className="space-y-6">
      <Link
        to="/social"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Painel
      </Link>

      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="mt-1 size-10 shrink-0 rounded-xl"
          style={{ background: rede.gradient }}
        />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={rede.label}
            description={
              dado
                ? `${dado.contas.length === 1 ? "1 perfil" : `${dado.contas.length} perfis`} · ${PERIOD_LABELS[period].toLowerCase()}`
                : "Carregando…"
            }
            actions={<PeriodFilter value={period} onChange={setPeriod} />}
          />
        </div>
      </div>

      {dados.isPending || !dado ? (
        <LoadingBlock rows={4} />
      ) : dado.contas.length === 0 ? (
        <EmptyState
          icon={Send}
          title={`Nenhum perfil de ${rede.label} neste projeto`}
          description="Cadastre um perfil desta rede para acompanhá-la aqui."
          action={
            <Link
              to="/social/contas"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Ir para Contas
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Seguidores"
              value={formatNumber(dado.resumo.followers)}
              delta={dado.resumo.followersDeltaPct}
              hint={`${dado.resumo.followersDelta >= 0 ? "+" : ""}${formatNumber(dado.resumo.followersDelta)} no período`}
              icon={Users}
            />
            <StatCard
              label="Alcance"
              value={formatCompact(dado.resumo.reach)}
              delta={dado.resumo.reachDelta}
              hint="vs. período anterior"
              icon={TrendingUp}
            />
            <StatCard
              label="Engajamento"
              value={formatCompact(dado.resumo.engagement)}
              hint={`Taxa de ${formatPercent(dado.resumo.engagementRate)}`}
              icon={Heart}
            />
            <StatCard
              label="Investido"
              value={formatCurrency(dado.resumo.adSpend)}
              hint={`${dado.impulsionamentos} impulsionamento(s)`}
              icon={BadgeDollarSign}
            />
          </div>

          {dado.recomendacoes.length > 0 ? (
            <SectionCard
              title={`O que os números do ${rede.label} sugerem`}
              description="Cada observação vem com a conta que a sustenta."
              icon={Lightbulb}
            >
              <ul className="grid gap-3 lg:grid-cols-2">
                {dado.recomendacoes.map((recomendacao) => (
                  <li
                    key={recomendacao.id}
                    className={cn(
                      "min-w-0 rounded-xl border p-4",
                      recomendacao.peso === "risco"
                        ? "border-destructive/40 bg-destructive/5"
                        : recomendacao.peso === "atencao"
                          ? "border-accent/40 bg-accent/5"
                          : "border-border",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 font-medium">{recomendacao.titulo}</h3>
                      <StatusPill tone={recomendacao.peso === "risco" ? "erro" : "neutro"}>
                        {recomendacao.area}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{recomendacao.acao}</p>
                    <p className="mt-2.5 border-t border-border/60 pt-2 text-xs tabular-nums text-muted-foreground">
                      {recomendacao.evidencia}
                    </p>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <SectionCard
              title="Curva de seguidores"
              description={`Perfis de ${rede.label} somados.`}
              icon={TrendingUp}
              className="lg:col-span-2"
            >
              <GrowthChart data={dado.serie} />
            </SectionCard>

            <SectionCard title="Orgânico x pago" description="Alcance do período." icon={Rocket}>
              <SplitDonut split={dado.split} />
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <dt>Orgânico</dt>
                  <dd className="tabular-nums">{formatCompact(dado.split.organic.reach)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <dt>Pago</dt>
                  <dd className="tabular-nums">{formatCompact(dado.split.paid.reach)}</dd>
                </div>
              </dl>
            </SectionCard>
          </div>

          <SectionCard
            title="Perfis desta rede"
            description="Clique para abrir o histórico completo de um perfil."
            icon={Users}
          >
            <ul className="grid gap-3 md:grid-cols-2">
              {dado.canais.map((canal) => {
                const conta = dado.contas.find((item) => item.account.id === canal.accountId);
                return (
                  <li key={canal.accountId}>
                    <Link
                      to="/social/conta/$accountId"
                      params={{ accountId: canal.accountId }}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-secondary/50"
                    >
                      <AccountAvatar gradient={canal.avatarGradient} label={canal.nome} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{canal.nome}</span>
                          {conta && conta.account.status !== "ativa" ? (
                            <StatusPill tone="erro">{statusLabel(conta.account.status)}</StatusPill>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {canal.handle} · {formatNumber(canal.seguidores)} seguidores ·{" "}
                          {formatCompact(canal.alcance)} de alcance
                        </p>
                      </div>
                      <StatusPill tone={canal.variacaoSeguidores >= 0 ? "positivo" : "erro"}>
                        {canal.variacaoSeguidores >= 0 ? "+" : ""}
                        {formatNumber(canal.variacaoSeguidores)}
                      </StatusPill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <Atalho
              to="/social/publicacoes"
              icon={Send}
              valor={dado.publicadas.length}
              rotulo="Publicações recentes"
              extra={dado.naFila > 0 ? `${dado.naFila} na fila` : "nenhuma na fila"}
            />
            <Atalho
              to="/social/relacionamento"
              icon={MessagesSquare}
              valor={dado.pendentes}
              rotulo="Interações pendentes"
              extra="sem resposta"
            />
            <Atalho
              to="/social/impulsionamentos"
              icon={Rocket}
              valor={dado.impulsionamentos}
              rotulo="Impulsionamentos"
              extra="nesta rede"
            />
          </div>
        </>
      )}
    </div>
  );
}

function Atalho({
  to,
  icon: Icone,
  valor,
  rotulo,
  extra,
}: {
  to: string;
  icon: typeof Send;
  valor: number;
  rotulo: string;
  extra: string;
}) {
  return (
    <Link
      to={to}
      className="surface-card flex items-center gap-4 p-5 transition-colors hover:bg-card-elevated"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-secondary text-accent">
        <Icone className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-semibold tabular-nums">{valor}</div>
        <div className="text-sm">{rotulo}</div>
        <div className="text-xs text-muted-foreground">{extra}</div>
      </div>
    </Link>
  );
}
