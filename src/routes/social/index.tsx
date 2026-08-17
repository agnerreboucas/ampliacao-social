import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  ChevronDown,
  Clock,
  Eye,
  Heart,
  Info,
  Lightbulb,
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
import { useMemo, useState } from "react";

import {
  detalharPeriodo,
  obterPainel,
  obterPainelGeral,
  quadroDeHorarios,
} from "@/lib/api/social.functions";
import { CartaoDeRede } from "@/components/social/cartao-rede";
import { Recomendacoes, TabelaDeCanais } from "@/components/social/resumo-dos-canais";
import { GrowthChart, QuadroDeBarras, ReachChart, SplitDonut } from "@/components/social/charts";
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
import { NOME_DO_FORMATO, type DesempenhoDoGrupo } from "@/lib/social/conteudo";
import {
  barrasDoQuadro,
  categoriasDoQuadro,
  pecasDaBarra,
  rotuloDaBarra,
  type AtividadeDoBloco,
  type EixoDoQuadro,
  type HorariosDoFormato,
  type MetricaDoQuadro,
  type PecaNoTempo,
  type Recomendacao,
  type RecorteDoQuadro,
} from "@/lib/social/horarios";
import { NETWORKS } from "@/lib/social/networks";
import { NOME_DO_GENERO } from "@/lib/social/publico";
import { useSocialSession } from "@/lib/social/session";
import type { SeriesPoint } from "@/lib/social/analytics";
import type { Genero, NetworkId, PeriodKey, PostFormat } from "@/lib/social/types";
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

  // O quadro de horários e público. Consulta própria pelo mesmo motivo da de
  // cima: é outro cálculo, e o painel não deve esperar por ela para aparecer.
  const quadro = useQuery({
    queryKey: ["social", "quadro-horarios", projectId, period],
    queryFn: () => quadroDeHorarios({ data: { projectId: projectId ?? undefined, period } }),
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

          {quadro.data ? <GraficoDoQuadro dado={quadro.data} /> : null}

          <DeOndeVemOsNumeros redes={data.redes} seguidores={data.summary.followers} />

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
          {quadro.data ? <QuadroDeHorarios dado={quadro.data} /> : null}

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

/**
 * O quadro de horários, mídia e público, no Painel.
 *
 * **Fechado, ele responde quatro perguntas em quatro números.** Aberto, mostra
 * a comparação hora a hora entre quando a campanha publica e quando o público
 * está na rede — que é a única coisa aqui que não caberia num número só.
 *
 * Começa fechado de propósito. O Painel é a tela que alguém abre de passagem;
 * um bloco de análise sempre expandido empurraria o resto para baixo da dobra
 * todos os dias por causa de uma leitura que se faz uma vez por semana.
 *
 * As duas barras do mapa aberto são a razão de o quadro existir: uma diz onde a
 * campanha acerta, a outra onde o público está, e o desencontro entre elas é uma
 * decisão esperando para ser tomada.
 */
function QuadroDeHorarios({ dado }: { dado: DadoDoQuadro }) {
  const [aberto, setAberto] = useState(false);

  const melhor = dado.melhoresBlocos[0];
  const generoLider = [...dado.publico.porGenero].sort((a, b) => b.pessoas - a.pessoas)[0];
  const maiorAtividade = Math.max(...dado.atividade.map((bloco) => bloco.atividade), 1);
  const maiorAlcance = Math.max(...dado.blocosDoDia.map((bloco) => bloco.alcanceMedio), 1);

  return (
    <SectionCard
      title="Horários, mídia e público"
      description="O que os números dizem sobre quando publicar, em que formato e para quem."
      icon={Clock}
      actions={
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary"
        >
          {aberto ? "Recolher" : "Aprofundar"}
          <ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} />
        </button>
      }
    >
      {dado.pecas === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma publicação medida no período — sem isso não há horário nem formato a apontar.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Ficha
              rotulo="Melhor horário"
              valor={melhor ? melhor.quando : "Sem padrão ainda"}
              apoio={
                melhor
                  ? `${formatCompact(melhor.alcanceMedio)} de alcance médio · ${melhor.contraMedia >= 0 ? "+" : ""}${Math.round(melhor.contraMedia)}% vs. média`
                  : "As peças estão espalhadas demais pelos horários"
              }
              para="/social/conteudo"
            />
            <Ficha
              rotulo="Formato que rende"
              valor={dado.melhorFormato ? dado.melhorFormato.rotulo : "Sem padrão ainda"}
              apoio={
                dado.melhorFormato
                  ? `${formatCompact(dado.melhorFormato.alcanceMedio)} de alcance médio · ${dado.melhorFormato.contraMedia >= 0 ? "+" : ""}${Math.round(dado.melhorFormato.contraMedia)}% vs. média`
                  : "Nenhum formato com três peças no período"
              }
              para="/social/conteudo"
            />
            <Ficha
              rotulo="Público"
              valor={
                dado.publico.faixaDominante
                  ? `${dado.publico.faixaDominante} anos`
                  : "Sem dado da rede"
              }
              apoio={
                generoLider && dado.publico.pessoas > 0
                  ? `${NOME_DO_GENERO[generoLider.genero]} é ${formatPercent(generoLider.fatia * 100, 0)} · ${formatCompact(dado.publico.pessoas)} seguidores`
                  : "A rede só devolve o perfil acima de cem seguidores"
              }
              para="/social/publico"
            />
            <Ficha
              rotulo="Público na rede"
              valor={dado.pico ? dado.pico.rotulo : "Sem dado da rede"}
              apoio={
                dado.pico
                  ? `${formatPercent(dado.pico.fatia * 100, 0)} da atividade do dia acontece nesta faixa`
                  : "Depende do perfil de público da conta conectada"
              }
              para="/social/publico"
            />
          </div>

          {dado.leitura ? (
            <p className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" />
              {dado.leitura}
            </p>
          ) : null}

          {aberto ? (
            <div className="space-y-5 border-t border-border pt-5">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Onde a campanha acerta × onde o público está
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A barra escura é o alcance médio das peças publicadas naquela faixa. A clara é a
                  atividade do público, que vem do perfil da rede e não do que publicamos.
                </p>

                <div className="mt-3 space-y-2">
                  {dado.atividade.map((bloco) => {
                    const daCampanha = dado.blocosDoDia.find((item) => item.bloco === bloco.bloco);

                    return (
                      <div key={bloco.bloco} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                          {bloco.rotulo}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Trilha
                            fracao={daCampanha ? daCampanha.alcanceMedio / maiorAlcance : 0}
                            cor="bg-accent"
                            titulo={
                              daCampanha && daCampanha.pecas > 0
                                ? `${formatCompact(daCampanha.alcanceMedio)} de alcance médio em ${daCampanha.pecas} ${daCampanha.pecas === 1 ? "peça" : "peças"}`
                                : "Nada publicado nesta faixa"
                            }
                          />
                          <Trilha
                            fracao={bloco.atividade / maiorAtividade}
                            cor="bg-accent/35"
                            titulo={`${formatPercent(bloco.fatia * 100, 0)} da atividade do público`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  Melhor horário por tipo de conteúdo
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {dado.horariosPorFormato.map((item) => (
                    <div key={item.formato} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{item.rotulo}</span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {item.pecas}
                        </span>
                      </div>
                      {item.melhores.length === 0 ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">{item.ressalva}</p>
                      ) : (
                        <p className="mt-1 text-sm tabular-nums">
                          {item.melhores[0].quando}
                          <span className="block text-[11px] text-muted-foreground">
                            {formatCompact(item.melhores[0].alcanceMedio)} de alcance médio
                          </span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Link
                to="/social/conteudo"
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                Ver a análise completa, com o mapa de calor da semana
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

type DadoDoQuadro = {
  pecas: number;
  melhoresBlocos: Recomendacao[];
  blocosDoDia: Recomendacao[];
  melhorFormato: DesempenhoDoGrupo | null;
  atividade: AtividadeDoBloco[];
  pico: AtividadeDoBloco | null;
  publico: {
    pessoas: number;
    contas: number;
    porGenero: { genero: Genero; pessoas: number; fatia: number }[];
    faixaDominante: string | null;
  };
  leitura: string | null;
  horariosPorFormato: HorariosDoFormato[];
  noTempo: PecaNoTempo[];
};

/** Um número do quadro, com o caminho para a tela onde ele se explica. */
function Ficha({
  rotulo,
  valor,
  apoio,
  para,
}: {
  rotulo: string;
  valor: string;
  apoio: string;
  para: "/social/conteudo" | "/social/publico";
}) {
  return (
    <Link
      to={para}
      className="rounded-xl border border-border p-3 transition-colors hover:border-accent/60 hover:bg-secondary/40"
    >
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{valor}</p>
      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{apoio}</p>
    </Link>
  );
}

function Trilha({ fracao, cor, titulo }: { fracao: number; cor: string; titulo: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-secondary" title={titulo}>
      <div
        className={cn("h-full rounded-full", cor)}
        style={{ width: `${Math.max(Math.min(fracao, 1) * 100, fracao > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

const EIXOS: { id: EixoDoQuadro; rotulo: string }[] = [
  { id: "horario", rotulo: "Por horário" },
  { id: "dia", rotulo: "Por dia da semana" },
];

const RECORTES: { id: RecorteDoQuadro; rotulo: string }[] = [
  { id: "formato", rotulo: "Mídia" },
  { id: "rede", rotulo: "Rede" },
];

const METRICAS: { id: MetricaDoQuadro; rotulo: string }[] = [
  { id: "alcance", rotulo: "Alcance" },
  { id: "interacoes", rotulo: "Interações" },
];

/**
 * O gráfico de barras do painel: mídia e rede, ao longo do dia e da semana.
 *
 * Fica logo acima de "Suas redes" porque a ordem de leitura é essa: primeiro
 * **quando e com o quê** a campanha alcança gente, depois **em que rede** isso
 * aterrissou. Herda a gramática do gráfico de alcance por origem — barra
 * empilhada, clique abre o detalhe embaixo — para não obrigar ninguém a
 * aprender uma segunda forma de ler barras na mesma tela.
 *
 * Os três seletores são o que transformam uma figura em exploração: o mesmo
 * conjunto de peças visto por horário ou por dia, cortado por mídia ou por rede,
 * medido em alcance ou em interações. As oito combinações são calculadas no
 * navegador, então trocar é instantâneo.
 */
function GraficoDoQuadro({ dado }: { dado: DadoDoQuadro }) {
  const [eixo, setEixo] = useState<EixoDoQuadro>("horario");
  const [recorte, setRecorte] = useState<RecorteDoQuadro>("formato");
  const [metrica, setMetrica] = useState<MetricaDoQuadro>("alcance");
  const [barraAberta, setBarraAberta] = useState<string | null>(null);

  const barras = useMemo(
    () => barrasDoQuadro(dado.noTempo, { eixo, recorte, metrica }),
    [dado.noTempo, eixo, recorte, metrica],
  );
  const categorias = useMemo(
    () => categoriasDoQuadro(dado.noTempo, recorte),
    [dado.noTempo, recorte],
  );

  // Trocar o eixo troca o significado da chave da barra: "h-6" não existe no
  // eixo de dias. Fechar o painel evita mostrar o detalhe de uma barra que não
  // está mais na tela.
  const trocarEixo = (proximo: EixoDoQuadro) => {
    setEixo(proximo);
    setBarraAberta(null);
  };

  const corDaCategoria = (chave: string) => {
    if (recorte === "rede") {
      return chave === "sem_rede"
        ? "var(--color-muted-foreground)"
        : NETWORKS[chave as NetworkId].color;
    }
    // Formato não é marca: é grandeza da mesma família. Uma cor só, com
    // opacidades diferentes, mantém a leitura e não compete com as cores das
    // redes na mesma tela.
    const posicao = categorias.indexOf(chave);
    const opacidade = 1 - (posicao / Math.max(categorias.length, 1)) * 0.65;
    return `color-mix(in oklch, var(--color-accent) ${Math.round(opacidade * 100)}%, transparent)`;
  };

  const rotuloDaCategoria = (chave: string) => {
    if (recorte === "formato") return NOME_DO_FORMATO[chave as PostFormat] ?? chave;
    return chave === "sem_rede" ? "Sem rede escolhida" : NETWORKS[chave as NetworkId].label;
  };

  if (dado.noTempo.length === 0) {
    return (
      <SectionCard
        title="Mídia, redes, dias e horários"
        description="Nenhuma publicação medida no período."
        icon={BarChart3}
      >
        <p className="text-sm text-muted-foreground">
          Assim que houver publicações com números, o gráfico aparece aqui.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Mídia, redes, dias e horários"
      description="Barras empilhadas do que já foi ao ar. Clique em uma barra para ver as peças dela."
      icon={BarChart3}
      actions={
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MousePointerClick className="size-3.5" />
          clique em uma barra
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Seletor opcoes={EIXOS} valor={eixo} onEscolher={trocarEixo} />
          <Seletor opcoes={RECORTES} valor={recorte} onEscolher={setRecorte} />
          <Seletor opcoes={METRICAS} valor={metrica} onEscolher={setMetrica} />
        </div>

        <QuadroDeBarras
          barras={barras}
          categorias={categorias}
          corDaCategoria={corDaCategoria}
          rotuloDaCategoria={rotuloDaCategoria}
          onSelecionar={(chave) => setBarraAberta((atual) => (atual === chave ? null : chave))}
          selecionada={barraAberta}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {categorias.map((categoria) => (
            <span key={categoria} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: corDaCategoria(categoria) }}
              />
              {rotuloDaCategoria(categoria)}
            </span>
          ))}
        </div>

        {recorte === "rede" ? (
          // A ressalva fica junto do número, não numa nota de pé de página: uma
          // peça que saiu em três redes entra com um terço em cada, porque a rede
          // não devolve alcance por canal para uma publicação só.
          <p className="text-[11px] text-muted-foreground">
            Uma peça publicada em mais de uma rede é dividida igualmente entre elas. O total da
            barra é exato; a repartição é aproximada.
          </p>
        ) : null}

        {barraAberta ? (
          <PecasDaBarra
            chave={barraAberta}
            pecas={pecasDaBarra(dado.noTempo, barraAberta)}
            onFechar={() => setBarraAberta(null)}
          />
        ) : null}
      </div>
    </SectionCard>
  );
}

function Seletor<T extends string>({
  opcoes,
  valor,
  onEscolher,
}: {
  opcoes: { id: T; rotulo: string }[];
  valor: T;
  onEscolher: (id: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
      {opcoes.map((opcao) => (
        <button
          key={opcao.id}
          type="button"
          onClick={() => onEscolher(opcao.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            valor === opcao.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opcao.rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * As peças da barra clicada.
 *
 * É o "aprofundar" do gráfico: a barra diz quanto, esta lista diz **o quê**. Sem
 * ela, um pico às 18h é um número sem nome, e ninguém consegue repetir o que deu
 * certo.
 */
function PecasDaBarra({
  chave,
  pecas,
  onFechar,
}: {
  chave: string;
  pecas: PecaNoTempo[];
  onFechar: () => void;
}) {
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium capitalize">{rotuloDaBarra(chave)}</p>
          <p className="text-xs text-muted-foreground">
            {pecas.length} {pecas.length === 1 ? "peça publicada" : "peças publicadas"} nesta faixa
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {pecas.map((peca) => (
          <li key={peca.id}>
            <Link
              to="/social/publicacao/$postId"
              params={{ postId: peca.id }}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-border bg-card p-3 transition-colors hover:border-accent/60"
            >
              <span className="min-w-0 flex-1 text-sm">
                {peca.legenda || "(sem legenda)"}
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {NOME_DO_FORMATO[peca.formato]}
                  {peca.redes.length > 0
                    ? ` · ${peca.redes.map((rede) => NETWORKS[rede].label).join(", ")}`
                    : ""}
                  {peca.publicadoEm
                    ? ` · ${new Date(peca.publicadoEm).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                {formatCompact(peca.alcance)}
                <span className="block text-[11px] text-muted-foreground">
                  {formatCompact(peca.interacoes)} interações
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * De onde vêm os números que estão na tela.
 *
 * Existe porque a plataforma vai passar um bom tempo com **parte** dos dados
 * reais: uma rede com exportação importada e cinco esperando conexão. Somar as
 * duas coisas no mesmo painel sem dizer qual é qual é como o painel mente sem
 * nenhuma linha de código errada — e quem lê tira conclusão de um total que
 * mistura leitura de verdade com ausência de leitura.
 *
 * O aviso é derivado, não escrito à mão: some quando todas as redes tiverem
 * dados, e volta sozinho quando alguém acrescentar uma rede nova.
 */
function DeOndeVemOsNumeros({
  redes,
  seguidores,
}: {
  redes: { networkId: NetworkId; semDados: boolean }[];
  seguidores: number;
}) {
  const sem = redes.filter((rede) => rede.semDados);
  const com = redes.filter((rede) => !rede.semDados);

  // Sem nenhuma pendência não há o que avisar, e um aviso permanente vira ruído.
  if (sem.length === 0 && seguidores > 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <Info className="size-3.5" />
        De onde vêm estes números
      </p>

      <ul className="mt-2 space-y-1.5 text-sm">
        {com.length > 0 ? (
          <li>
            <span className="font-medium">
              {com.map((rede) => NETWORKS[rede.networkId].label).join(", ")}
            </span>{" "}
            — dados importados da exportação da própria rede.
          </li>
        ) : null}

        {sem.length > 0 ? (
          <li className="text-muted-foreground">
            <span className="font-medium text-foreground">
              {sem.map((rede) => NETWORKS[rede.networkId].label).join(", ")}
            </span>{" "}
            — ainda sem dado nenhum. Os cartões aparecem vazios de propósito: não é queda, é leitura
            que nunca chegou.
          </li>
        ) : null}

        <li className="text-muted-foreground">
          As <span className="font-medium text-foreground">conversas</span> em Relacionamento são
          ilustrativas. A contagem de comentários é real; os textos só chegam com a conta conectada
          por OAuth — a exportação de conteúdo não os traz.
        </li>

        {seguidores === 0 ? (
          <li className="text-muted-foreground">
            O <span className="font-medium text-foreground">total de seguidores</span> não vem na
            exportação de conteúdo — ela informa quantos seguidores cada publicação gerou, não
            quantos a conta tem. Fica em zero até alguém informar.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
