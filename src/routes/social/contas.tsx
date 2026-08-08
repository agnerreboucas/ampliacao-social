import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeDollarSign,
  Copy,
  Link2,
  LoaderCircle,
  MessageSquareWarning,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  atualizarConexao,
  conectarConta,
  iniciarConexaoMeta,
  listarContas,
  sincronizarContaReal,
  situacaoIntegracao,
} from "@/lib/api/social.functions";
import {
  AccountAvatar,
  ConnectionPill,
  EmptyState,
  InlineError,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NETWORKS, NETWORK_IDS } from "@/lib/social/networks";
import { formatLongDay, formatRelative } from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { NetworkId } from "@/lib/social/types";

export const Route = createFileRoute("/social/contas")({
  component: ContasPage,
});

function ContasPage() {
  const { projectId } = useSocialSession();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const contas = useQuery({
    queryKey: ["social", "contas", projectId],
    queryFn: () => listarContas({ data: { projectId: projectId ?? undefined } }),
    enabled: Boolean(projectId),
  });

  const integracao = useQuery({
    queryKey: ["social", "integracao"],
    queryFn: () => situacaoIntegracao(),
  });

  /**
   * Conectar de verdade: pedimos ao servidor a URL do diálogo da Meta e levamos
   * a pessoa para lá. Ela autoriza no site da Meta e volta em /oauth/retorno.
   */
  const conexaoReal = useMutation({
    mutationFn: () =>
      iniciarConexaoMeta({
        data: { projectId: projectId!, grupos: ["leitura", "publicacao", "atendimento"] },
      }),
    onSuccess: (resultado) => {
      if (resultado.modo === "oauth") {
        window.location.href = resultado.url;
        return;
      }
      toast.error(resultado.erro);
      setDialogOpen(true);
    },
    onError: () => toast.error("Não foi possível iniciar a conexão com a Meta."),
  });

  const sincronizacaoReal = useMutation({
    mutationFn: (accountId: string) => sincronizarContaReal({ data: { accountId, dias: 28 } }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      invalidate();
      toast.success(`Sincronização concluída: ${resultado.dias} dia(s) atualizados.`);
    },
    onError: () => toast.error("A sincronização falhou."),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["social"] });
  };

  const conexao = useMutation({
    mutationFn: (input: {
      accountId: string;
      acao: "reconectar" | "desconectar" | "sincronizar" | "conectar_anuncios";
    }) => atualizarConexao({ data: input }),
    onSuccess: (_result, input) => {
      invalidate();
      const mensagens = {
        reconectar: "Conta reconectada. Token renovado por 60 dias.",
        desconectar: "Conta desconectada. O histórico de métricas foi preservado.",
        sincronizar: "Sincronização concluída.",
        conectar_anuncios: "Conta de anúncios conectada. Impulsionamento liberado.",
      };
      toast.success(mensagens[input.acao]);
    },
    onError: () => toast.error("Não foi possível concluir a operação."),
  });

  const warnings = new Map(
    (contas.data?.tokenWarnings ?? []).map((warning) => [warning.accountId, warning.daysToExpire]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas conectadas"
        description="Status das conexões OAuth, permissões e última sincronização de cada perfil."
        actions={
          <button
            type="button"
            disabled={conexaoReal.isPending || !projectId}
            onClick={() =>
              integracao.data?.habilitada ? conexaoReal.mutate() : setDialogOpen(true)
            }
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {conexaoReal.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plug className="size-4" />
            )}
            {integracao.data?.habilitada ? "Conectar com Facebook" : "Conectar conta"}
          </button>
        }
      />

      {integracao.data ? (
        <SituacaoIntegracao
          habilitada={integracao.data.habilitada}
          faltando={integracao.data.faltando}
          redirectUri={integracao.data.redirectUri}
        />
      ) : null}

      {contas.isPending ? (
        <LoadingBlock rows={4} />
      ) : (contas.data?.accounts.length ?? 0) === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nenhum perfil conectado"
          description="Conecte o primeiro perfil social para iniciar o acompanhamento das métricas."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {contas.data!.accounts.map((account) => {
            const network = NETWORKS[account.networkId];
            const daysToExpire = warnings.get(account.id);
            const busy = conexao.isPending && conexao.variables?.accountId === account.id;

            return (
              <article key={account.id} className="surface-card min-w-0 p-5">
                <header className="flex items-start gap-4">
                  <AccountAvatar
                    gradient={account.avatarGradient}
                    label={account.displayName}
                    size={46}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{account.displayName}</h3>
                      <NetworkChip networkId={account.networkId} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {account.handle}
                    </p>
                  </div>
                  <ConnectionPill status={account.status} />
                </header>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Field label="Acompanhando desde">{formatLongDay(account.trackingSince)}</Field>
                  <Field label="Última sincronização">
                    {account.lastSyncAt ? formatRelative(account.lastSyncAt) : "nunca"}
                  </Field>
                  <Field label="Token expira em">
                    {account.tokenExpiresAt ? formatLongDay(account.tokenExpiresAt) : "—"}
                  </Field>
                  <Field label="Conta de anúncios">
                    {account.adAccountConnected ? "conectada" : "não conectada"}
                  </Field>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  {account.origem === "oauth" ? (
                    <StatusPill tone="positivo">
                      <ShieldCheck className="size-3" /> Conexão autorizada pela rede
                    </StatusPill>
                  ) : (
                    <StatusPill tone="neutro">Conta de demonstração</StatusPill>
                  )}
                  {!network.supportsAudienceInsights ? (
                    <StatusPill tone="neutro">Sem dados de público na API</StatusPill>
                  ) : null}
                  {!network.supportsBoost ? (
                    <StatusPill tone="neutro">Impulsionamento indisponível</StatusPill>
                  ) : null}
                  {network.supportsDirectMessages && !account.messagingApproved ? (
                    <StatusPill tone="atencao">
                      <MessageSquareWarning className="size-3" /> Mensageria aguardando aprovação
                    </StatusPill>
                  ) : null}
                  {typeof daysToExpire === "number" && account.status === "ativa" ? (
                    <StatusPill tone="atencao">
                      <AlertTriangle className="size-3" />
                      {daysToExpire <= 0
                        ? "Token expirado"
                        : `Token expira em ${daysToExpire} dia(s)`}
                    </StatusPill>
                  ) : null}
                </div>

                <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  {account.status === "ativa" ? (
                    <>
                      <ActionButton
                        onClick={() =>
                          conexao.mutate({ accountId: account.id, acao: "sincronizar" })
                        }
                        busy={busy}
                        icon={RefreshCw}
                      >
                        Sincronizar
                      </ActionButton>
                      {!account.adAccountConnected && network.supportsBoost ? (
                        <ActionButton
                          onClick={() =>
                            conexao.mutate({ accountId: account.id, acao: "conectar_anuncios" })
                          }
                          busy={busy}
                          icon={BadgeDollarSign}
                        >
                          Conectar anúncios
                        </ActionButton>
                      ) : null}
                      <ActionButton
                        onClick={() =>
                          conexao.mutate({ accountId: account.id, acao: "desconectar" })
                        }
                        busy={busy}
                        icon={Unplug}
                      >
                        Desconectar
                      </ActionButton>
                    </>
                  ) : (
                    <ActionButton
                      onClick={() => conexao.mutate({ accountId: account.id, acao: "reconectar" })}
                      busy={busy}
                      icon={Plug}
                      primary
                    >
                      Reconectar
                    </ActionButton>
                  )}
                  <Link
                    to="/social/conta/$accountId"
                    params={{ accountId: account.id }}
                    className="ml-auto text-sm text-accent hover:underline"
                  >
                    Ver métricas
                  </Link>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <SectionCard
        title="Como a renovação de token funciona"
        description="Regra de negócio do PRD 3.1."
        icon={RefreshCw}
      >
        <p className="text-sm text-muted-foreground">
          Quando a rede permite, o token é renovado automaticamente antes de expirar. Quando não
          permite, a conta aparece aqui como <span className="text-foreground">expirada</span> e o
          responsável é avisado para reconectar. Desconectar uma conta nunca apaga o histórico já
          sincronizado — a curva de crescimento continua disponível.
        </p>
      </SectionCard>

      <ConectarContaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        onConnected={invalidate}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  icon: Icon,
  primary,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof RefreshCw;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        primary
          ? "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          : "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-secondary disabled:opacity-60"
      }
    >
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
      {children}
    </button>
  );
}

function ConectarContaDialog({
  open,
  onOpenChange,
  projectId,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  onConnected: () => void;
}) {
  const [networkId, setNetworkId] = useState<NetworkId>("instagram");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const conectar = useMutation({
    mutationFn: (input: {
      projectId: string;
      networkId: NetworkId;
      handle: string;
      displayName: string;
    }) => conectarConta({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        setErro(result.erro);
        return;
      }
      onConnected();
      onOpenChange(false);
      setHandle("");
      setDisplayName("");
      toast.success(
        `${result.account.displayName} conectada. A primeira sincronização já começou.`,
      );
    },
    onError: () => setErro("A autorização não foi concluída. Tente novamente."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar conta social</DialogTitle>
          <DialogDescription>
            A conexão usa o OAuth oficial de cada rede. Neste ambiente o handshake é simulado: a
            conta entra ativa e o acompanhamento começa hoje.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!projectId) return;
            setErro(null);
            conectar.mutate({ projectId, networkId, handle, displayName });
          }}
        >
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Rede</span>
            <div className="flex flex-wrap gap-2">
              {NETWORK_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setNetworkId(id)}
                  className={
                    networkId === id
                      ? "rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-sm"
                      : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                  }
                >
                  {NETWORKS[id].label}
                  {NETWORKS[id].phase === 4 ? (
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                      fase 4
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="handle" className="text-sm font-medium">
              Identificador do perfil
            </label>
            <input
              id="handle"
              required
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              placeholder="@minhaloja"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="displayName" className="text-sm font-medium">
              Nome exibido
            </label>
            <input
              id="displayName"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Minha Loja"
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
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
              disabled={conectar.isPending || !projectId}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {conectar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Autorizar e conectar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mostra se a conexão oficial está disponível.
 *
 * Quando falta configuração, em vez de esconder o botão explicamos exatamente
 * quais variáveis de ambiente preencher e qual URL de retorno cadastrar no app
 * da Meta — é o que desbloqueia a integração.
 */
function SituacaoIntegracao({
  habilitada,
  faltando,
  redirectUri,
}: {
  habilitada: boolean;
  faltando: string[];
  redirectUri: string | null;
}) {
  if (habilitada) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm">
        <ShieldCheck className="size-4 shrink-0 text-success" />
        <span>
          Integração com a Meta ativa. Ao clicar em{" "}
          <span className="font-medium">Conectar com Facebook</span>, você autoriza na página da
          Meta e volta com as contas prontas para escolher.
        </span>
      </div>
    );
  }

  return (
    <SectionCard
      title="Conectar de verdade com Instagram e Facebook"
      description="Faltam poucos passos para o botão abrir a autorização oficial da Meta."
      icon={Plug}
    >
      <p className="text-sm text-muted-foreground">
        Enquanto isso, a plataforma segue em modo demonstração: as contas são de exemplo e nenhuma
        chamada é feita às redes.
      </p>

      <ol className="mt-4 space-y-2 text-sm">
        <li className="flex gap-2">
          <span className="text-muted-foreground">1.</span>
          <span>
            Crie um aplicativo em <span className="text-foreground">developers.facebook.com</span>{" "}
            do tipo Empresa e adicione o produto Login do Facebook.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-muted-foreground">2.</span>
          <span>
            Cadastre esta URL de retorno no aplicativo:{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">
              {redirectUri ?? "https://seu-dominio/oauth/retorno"}
            </code>
            {redirectUri ? (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(redirectUri);
                  toast.success("URL copiada.");
                }}
                className="ml-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Copy className="size-3" /> copiar
              </button>
            ) : null}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-muted-foreground">3.</span>
          <span>
            Preencha as variáveis de ambiente que faltam:{" "}
            {faltando.map((nome, indice) => (
              <span key={nome}>
                <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{nome}</code>
                {indice < faltando.length - 1 ? ", " : ""}
              </span>
            ))}
            .
          </span>
        </li>
      </ol>

      <p className="mt-4 text-xs text-muted-foreground">
        O passo a passo completo, com a lista de permissões e o que a Meta exige na revisão, está em{" "}
        <span className="text-foreground">docs/integracao-meta.md</span>.
      </p>
    </SectionCard>
  );
}
