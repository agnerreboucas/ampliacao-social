import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BadgeDollarSign, History, LoaderCircle, Plug, Rocket, Square, Target } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  criarImpulsionamento,
  encerrarImpulsionamento,
  listarCampanhasWindsor,
  listarImpulsionamentos,
  situacaoWindsor,
} from "@/lib/api/social.functions";
import {
  AccountAvatar,
  EmptyState,
  InlineError,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  SectionCard,
  StatCard,
  StatusPill,
  type PillTone,
} from "@/components/social/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BOOST_OBJECTIVE_LABELS,
  BOOST_STATUS_LABELS,
  formatCompact,
  formatCurrency,
  formatLongDay,
} from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { PeriodoWindsor } from "@/lib/social/windsor/cliente.server";
import type { Boost, BoostObjective, BoostStatus, Post, SocialAccount } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/impulsionamentos")({
  component: ImpulsionamentosPage,
});

const BOOST_TONES: Record<BoostStatus, PillTone> = {
  em_analise: "atencao",
  ativo: "positivo",
  encerrado: "neutro",
  rejeitado: "erro",
};

const OBJECTIVES: { id: BoostObjective; label: string; hint: string }[] = [
  { id: "alcance", label: "Alcance", hint: "mostrar para o máximo de pessoas" },
  { id: "engajamento", label: "Engajamento", hint: "curtidas, comentários e salvamentos" },
  { id: "trafego", label: "Tráfego", hint: "cliques para um destino" },
  { id: "mensagens", label: "Mensagens", hint: "iniciar conversas no direct" },
];

function ImpulsionamentosPage() {
  const { projectId } = useSocialSession();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [periodoWindsor, setPeriodoWindsor] = useState<PeriodoWindsor>("last_90d");

  const dados = useQuery({
    queryKey: ["social", "impulsionamentos", projectId],
    queryFn: () => listarImpulsionamentos({ data: { projectId: projectId ?? undefined } }),
    enabled: Boolean(projectId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["social"] });

  // Windsor.ai: mídia paga real das contas que o cliente conectou lá.
  const windsor = useQuery({
    queryKey: ["social", "windsor", "situacao"],
    queryFn: () => situacaoWindsor(),
  });

  const campanhasReais = useQuery({
    queryKey: ["social", "windsor", "campanhas", periodoWindsor],
    queryFn: () =>
      listarCampanhasWindsor({ data: { conector: "facebook", periodo: periodoWindsor } }),
    enabled: Boolean(windsor.data?.habilitada),
  });

  const encerrar = useMutation({
    mutationFn: (boostId: string) => encerrarImpulsionamento({ data: { boostId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Impulsionamento encerrado.");
    },
    onError: () => toast.error("Não foi possível encerrar o impulsionamento."),
  });

  const boosts = dados.data?.boosts ?? [];
  const accounts = dados.data?.accounts ?? [];
  const posts = dados.data?.posts ?? [];
  const elegiveis = dados.data?.elegiveis ?? [];

  const ativos = boosts.filter(
    (boost) => boost.status === "ativo" || boost.status === "em_analise",
  );
  const encerrados = boosts.filter(
    (boost) => boost.status !== "ativo" && boost.status !== "em_analise",
  );

  const investido = boosts.reduce((sum, boost) => sum + boost.results.spend, 0);
  const alcance = boosts.reduce((sum, boost) => sum + boost.results.reach, 0);
  const cliques = boosts.reduce((sum, boost) => sum + boost.results.clicks, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Impulsionamentos"
        description="Transforme publicações orgânicas em mídia paga sem sair da plataforma."
        actions={
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            disabled={elegiveis.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Rocket className="size-4" /> Impulsionar publicação
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Investido" value={formatCurrency(investido)} icon={BadgeDollarSign} />
        <StatCard
          label="Alcance pago"
          value={formatCompact(alcance)}
          hint={alcance > 0 ? `${formatCurrency((investido / alcance) * 1000)} por mil` : undefined}
          icon={Target}
        />
        <StatCard label="Cliques" value={formatCompact(cliques)} icon={Rocket} />
      </div>

      <CampanhasDoWindsor
        habilitada={windsor.data?.habilitada ?? false}
        consulta={campanhasReais}
        periodo={periodoWindsor}
        onPeriodo={setPeriodoWindsor}
      />

      {dados.isPending ? (
        <LoadingBlock rows={3} />
      ) : (
        <>
          <SectionCard title="Em veiculação" icon={Rocket}>
            {ativos.length === 0 ? (
              <EmptyState
                icon={Rocket}
                title="Nenhuma campanha ativa"
                description={
                  elegiveis.length === 0
                    ? "Para impulsionar, a conta precisa estar ativa e com a conta de anúncios conectada."
                    : "Escolha uma publicação já feita e defina orçamento, duração e público."
                }
                action={
                  elegiveis.length === 0 ? (
                    <Link
                      to="/social/contas"
                      className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
                    >
                      Revisar conexões
                    </Link>
                  ) : null
                }
              />
            ) : (
              <ul className="space-y-3">
                {ativos.map((boost) => (
                  <BoostRow
                    key={boost.id}
                    boost={boost}
                    post={posts.find((candidate) => candidate.id === boost.postId)}
                    account={accounts.find((candidate) => candidate.id === boost.accountId)}
                    onStop={() => encerrar.mutate(boost.id)}
                    busy={encerrar.isPending && encerrar.variables === boost.id}
                  />
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Histórico"
            description="Impulsionamentos encerrados por conta e por publicação."
            icon={History}
          >
            {encerrados.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum impulsionamento encerrado ainda.
              </p>
            ) : (
              <ul className="space-y-3">
                {encerrados.map((boost) => (
                  <BoostRow
                    key={boost.id}
                    boost={boost}
                    post={posts.find((candidate) => candidate.id === boost.postId)}
                    account={accounts.find((candidate) => candidate.id === boost.accountId)}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}

      <ImpulsionarDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        posts={elegiveis}
        accounts={accounts}
        onCreated={invalidate}
      />
    </div>
  );
}

function BoostRow({
  boost,
  post,
  account,
  onStop,
  busy,
}: {
  boost: Boost;
  post?: Post;
  account?: SocialAccount;
  onStop?: () => void;
  busy?: boolean;
}) {
  const progresso = boost.budgetTotal > 0 ? (boost.results.spend / boost.budgetTotal) * 100 : 0;
  const custoPorMil =
    boost.results.reach > 0 ? (boost.results.spend / boost.results.reach) * 1000 : 0;

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start gap-4">
        {account ? (
          <AccountAvatar gradient={account.avatarGradient} label={account.displayName} size={40} />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={BOOST_TONES[boost.status]}>
              {BOOST_STATUS_LABELS[boost.status]}
            </StatusPill>
            <span className="text-sm font-medium">{BOOST_OBJECTIVE_LABELS[boost.objective]}</span>
            {account ? <NetworkChip networkId={account.networkId} /> : null}
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm text-muted-foreground">
            {post?.caption ?? "Publicação removida"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatLongDay(boost.startedAt)} → {formatLongDay(boost.endsAt)} · {boost.durationDays}{" "}
            dias · {boost.audience.locations.join(", ")} · {boost.audience.ageMin}–
            {boost.audience.ageMax} anos
            {boost.audience.interests.length > 0 ? ` · ${boost.audience.interests.join(", ")}` : ""}
          </p>
        </div>

        {onStop ? (
          <button
            type="button"
            onClick={onStop}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
          >
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Square className="size-3.5" />
            )}
            Encerrar
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Metric
          label="Investido"
          value={`${formatCurrency(boost.results.spend)} de ${formatCurrency(boost.budgetTotal)}`}
        />
        <Metric label="Alcance" value={formatCompact(boost.results.reach)} />
        <Metric label="Engajamento" value={formatCompact(boost.results.engagement)} />
        <Metric label="Custo por mil" value={custoPorMil > 0 ? formatCurrency(custoPorMil) : "—"} />
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, progresso)}%` }}
        />
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

function ImpulsionarDialog({
  open,
  onOpenChange,
  posts,
  accounts,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  posts: Post[];
  accounts: SocialAccount[];
  onCreated: () => void;
}) {
  const [postId, setPostId] = useState("");
  const [objective, setObjective] = useState<BoostObjective>("alcance");
  const [budgetTotal, setBudgetTotal] = useState(150);
  const [durationDays, setDurationDays] = useState(7);
  const [locations, setLocations] = useState("São Paulo (+10 km)");
  const [ageMin, setAgeMin] = useState(25);
  const [ageMax, setAgeMax] = useState(54);
  const [interests, setInterests] = useState("Supermercados, Ofertas");
  const [erro, setErro] = useState<string | null>(null);

  const selectedPost = posts.find((post) => post.id === postId) ?? posts[0];
  const boostableAccounts = accounts.filter(
    (account) => selectedPost?.accountIds.includes(account.id) && account.adAccountConnected,
  );
  const [accountId, setAccountId] = useState("");
  const targetAccount =
    boostableAccounts.find((account) => account.id === accountId) ?? boostableAccounts[0];

  const criar = useMutation({
    mutationFn: () =>
      criarImpulsionamento({
        data: {
          postId: selectedPost!.id,
          accountId: targetAccount!.id,
          objective,
          budgetTotal,
          durationDays,
          locations: locations
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          ageMin,
          ageMax,
          interests: interests
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        setErro(result.erro);
        return;
      }
      onCreated();
      onOpenChange(false);
      toast.success("Impulsionamento criado. A rede vai revisar antes de começar a veicular.");
    },
    onError: () => setErro("Não foi possível criar o impulsionamento."),
  });

  const diario = durationDays > 0 ? budgetTotal / durationDays : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Impulsionar publicação</DialogTitle>
          <DialogDescription>
            Só aparecem aqui publicações já feitas em contas com a conta de anúncios conectada e
            permissão ativa na rede.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            setErro(null);
            if (!selectedPost || !targetAccount) {
              setErro("Escolha uma publicação e uma conta de destino.");
              return;
            }
            criar.mutate();
          }}
        >
          <div className="space-y-2">
            <span className="text-sm font-medium">Publicação</span>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {posts.map((post) => (
                <label
                  key={post.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                    selectedPost?.id === post.id
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  <input
                    type="radio"
                    name="post"
                    className="sr-only"
                    checked={selectedPost?.id === post.id}
                    onChange={() => {
                      setPostId(post.id);
                      setAccountId("");
                    }}
                  />
                  <span
                    className="size-10 shrink-0 rounded-lg"
                    style={{ background: post.coverGradient }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{post.caption}</span>
                    <span className="block text-xs capitalize text-muted-foreground">
                      {post.format} · alcance orgânico {formatCompact(post.metrics?.reach ?? 0)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {boostableAccounts.length > 1 ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Conta de destino</label>
              <select
                value={targetAccount?.id ?? ""}
                onChange={(event) => setAccountId(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              >
                {boostableAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName} — {account.handle}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-2">
            <span className="text-sm font-medium">Objetivo</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {OBJECTIVES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setObjective(option.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    objective === option.id
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="orcamento" className="text-sm font-medium">
                Orçamento total (R$)
              </label>
              <input
                id="orcamento"
                type="number"
                min={6}
                step={10}
                value={budgetTotal}
                onChange={(event) => setBudgetTotal(Number(event.target.value))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="duracao" className="text-sm font-medium">
                Duração (dias)
              </label>
              <input
                id="duracao"
                type="number"
                min={1}
                max={90}
                value={durationDays}
                onChange={(event) => setDurationDays(Number(event.target.value))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              />
            </div>
          </div>

          <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            Equivale a <span className="text-foreground">{formatCurrency(diario)}</span> por dia.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="locais" className="text-sm font-medium">
                Localizações (separadas por vírgula)
              </label>
              <input
                id="locais"
                value={locations}
                onChange={(event) => setLocations(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="idadeMin" className="text-sm font-medium">
                Idade mínima
              </label>
              <input
                id="idadeMin"
                type="number"
                min={13}
                max={65}
                value={ageMin}
                onChange={(event) => setAgeMin(Number(event.target.value))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="idadeMax" className="text-sm font-medium">
                Idade máxima
              </label>
              <input
                id="idadeMax"
                type="number"
                min={13}
                max={65}
                value={ageMax}
                onChange={(event) => setAgeMax(Number(event.target.value))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="interesses" className="text-sm font-medium">
                Interesses (separados por vírgula)
              </label>
              <input
                id="interesses"
                value={interests}
                onChange={(event) => setInterests(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              />
            </div>
          </div>

          {erro ? <InlineError>{erro}</InlineError> : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={criar.isPending || posts.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {criar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Criar impulsionamento
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const PERIODOS_WINDSOR: { id: PeriodoWindsor; rotulo: string }[] = [
  { id: "last_30d", rotulo: "30 dias" },
  { id: "last_90d", rotulo: "90 dias" },
  { id: "last_6m", rotulo: "6 meses" },
  { id: "last_year", rotulo: "1 ano" },
  { id: "last_2years", rotulo: "2 anos" },
];

/**
 * Campanhas reais de mídia paga vindas do Windsor.ai.
 *
 * Este é o caminho curto para dado real: o cliente conecta as contas no
 * Windsor, a plataforma lê com uma chave só, e nada disso depende da revisão do
 * aplicativo pela Meta — que é o que leva semanas.
 */
function CampanhasDoWindsor({
  habilitada,
  consulta,
  periodo,
  onPeriodo,
}: {
  habilitada: boolean;
  consulta: ReturnType<typeof useQuery<Awaited<ReturnType<typeof listarCampanhasWindsor>>>>;
  periodo: PeriodoWindsor;
  onPeriodo: (periodo: PeriodoWindsor) => void;
}) {
  if (!habilitada) {
    return (
      <SectionCard
        title="Mídia paga real pelo Windsor.ai"
        description="Um atalho para dados reais sem esperar a revisão da Meta."
        icon={Plug}
      >
        <p className="text-sm text-muted-foreground">
          O Windsor.ai concentra as contas de anúncio do cliente (Meta Ads, Google Ads, TikTok e
          outras). Conectando lá uma vez, a plataforma lê tudo com uma única chave.
        </p>
        <ol className="mt-4 space-y-2 text-sm">
          <li className="flex gap-2">
            <span className="text-muted-foreground">1.</span>
            <span>
              Conecte as contas do cliente em <span className="text-foreground">windsor.ai</span>.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-muted-foreground">2.</span>
            <span>
              Copie a chave de API e preencha{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">WINDSOR_API_KEY</code>.
            </span>
          </li>
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Detalhes em <span className="text-foreground">docs/integracao-windsor.md</span>.
        </p>
      </SectionCard>
    );
  }

  const dados = consulta.data;

  return (
    <SectionCard
      title="Mídia paga real (Windsor.ai)"
      description="Campanhas lidas direto das contas de anúncio conectadas."
      icon={BadgeDollarSign}
      actions={
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-card/60 p-1">
          {PERIODOS_WINDSOR.map((opcao) => (
            <button
              key={opcao.id}
              type="button"
              onClick={() => onPeriodo(opcao.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                periodo === opcao.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
      }
    >
      {consulta.isPending ? (
        <LoadingBlock rows={3} />
      ) : !dados?.ok ? (
        <InlineError>{dados?.erro ?? "Não foi possível ler o Windsor.ai."}</InlineError>
      ) : dados.campanhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma veiculação neste período. Experimente um intervalo maior — contas sem campanhas
          recentes só aparecem em janelas mais longas.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Investido" value={formatCurrency(dados.totais.investido)} />
            <Metric label="Alcance" value={formatCompact(dados.totais.alcance)} />
            <Metric label="CPM" value={formatCurrency(dados.totais.cpm)} />
            <Metric label="CPC" value={formatCurrency(dados.totais.cpc)} />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-2 font-medium">Campanha</th>
                  <th className="pb-2 text-right font-medium">Investido</th>
                  <th className="pb-2 text-right font-medium">Alcance</th>
                  <th className="pb-2 text-right font-medium">CPM</th>
                  <th className="pb-2 text-right font-medium">Dias</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular-nums">
                {dados.campanhas.slice(0, 12).map((campanha) => (
                  <tr key={`${campanha.contaAnuncios}-${campanha.campanha}`}>
                    <td className="max-w-[280px] py-2">
                      <div className="truncate" title={campanha.campanha}>
                        {campanha.campanha}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {campanha.contaAnuncios}
                      </div>
                    </td>
                    <td className="py-2 text-right">{formatCurrency(campanha.investido)}</td>
                    <td className="py-2 text-right">{formatCompact(campanha.alcance)}</td>
                    <td className="py-2 text-right text-muted-foreground">
                      {formatCurrency(campanha.cpm)}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{campanha.dias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {dados.campanhas.length} campanha(s) em {dados.contasDeAnuncio.join(", ")} · dados reais
            lidos pelo Windsor.ai
          </p>
        </>
      )}
    </SectionCard>
  );
}
