import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Copy,
  Download,
  ExternalLink,
  FileBarChart,
  Link2Off,
  LoaderCircle,
  Share2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  alternarCompartilhamento,
  gerarPdfDoRelatorio,
  gerarRelatorio,
  listarRelatorios,
} from "@/lib/api/social.functions";
import {
  AccountAvatar,
  EmptyState,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import { PERIOD_KEYS, PERIOD_LABELS, formatDateTime, formatLongDay } from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { PeriodKey } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const { projectId, session } = useSocialSession();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [accountIds, setAccountIds] = useState<string[]>([]);

  const dados = useQuery({
    queryKey: ["social", "relatorios", projectId],
    queryFn: () => listarRelatorios({ data: { projectId: projectId ?? undefined } }),
    enabled: Boolean(projectId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["social", "relatorios"] });
  const accounts = dados.data?.accounts ?? [];
  const reports = dados.data?.reports ?? [];

  const gerar = useMutation({
    mutationFn: () =>
      gerarRelatorio({
        data: {
          projectId: projectId!,
          accountIds: accountIds.length > 0 ? accountIds : accounts.map((account) => account.id),
          title: title || `Relatório — ${PERIOD_LABELS[period]}`,
          period,
          createdBy: session!.user.id,
        },
      }),
    onSuccess: () => {
      invalidate();
      setTitle("");
      setAccountIds([]);
      toast.success("Relatório gerado.");
    },
    onError: () => toast.error("Não foi possível gerar o relatório."),
  });

  const compartilhar = useMutation({
    mutationFn: (input: { reportId: string; enabled: boolean }) =>
      alternarCompartilhamento({ data: input }),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        result.report.shareEnabled
          ? "Link público ativado (somente leitura)."
          : "Link público desativado.",
      );
    },
  });

  /**
   * Baixa o PDF do relatório.
   *
   * O arquivo chega em base64 e vira um blob aqui: é o caminho que funciona
   * igual no aplicativo e no HTML único, sem depender de um endereço de
   * download no servidor.
   */
  const baixarPdf = useMutation({
    mutationFn: (reportId: string) => gerarPdfDoRelatorio({ data: { reportId } }),
    onSuccess: (resultado) => {
      const binario = atob(resultado.base64);
      const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
      const endereco = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));

      const link = document.createElement("a");
      link.href = endereco;
      link.download = resultado.nome;
      link.click();
      // Sem revogar, o blob fica na memória da aba até ela fechar.
      URL.revokeObjectURL(endereco);

      toast.success("PDF gerado.");
    },
    onError: () => toast.error("Não foi possível gerar o PDF."),
  });

  const shareUrl = (token: string) =>
    typeof window === "undefined"
      ? `/relatorio/${token}`
      : `${window.location.origin}/relatorio/${token}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Consolide crescimento, publicações e mídia paga em um documento apresentável."
      />

      <SectionCard title="Gerar relatório" icon={FileBarChart}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!projectId || !session) return;
            gerar.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="titulo" className="text-sm font-medium">
                Título
              </label>
              <input
                id="titulo"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ex.: Resultados de agosto"
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="periodo" className="text-sm font-medium">
                Período
              </label>
              <select
                id="periodo"
                value={period}
                onChange={(event) => setPeriod(event.target.value as PeriodKey)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              >
                {PERIOD_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {PERIOD_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Contas incluídas</span>
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => {
                const checked = accountIds.length === 0 || accountIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() =>
                      setAccountIds((current) => {
                        const base =
                          current.length === 0 ? accounts.map((item) => item.id) : current;
                        return base.includes(account.id)
                          ? base.filter((id) => id !== account.id)
                          : [...base, account.id];
                      })
                    }
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                      checked
                        ? "border-accent bg-accent/10"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <AccountAvatar
                      gradient={account.avatarGradient}
                      label={account.displayName}
                      size={20}
                    />
                    {account.handle}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Sem seleção, o relatório inclui todas as contas do projeto.
            </p>
          </div>

          <button
            type="submit"
            disabled={gerar.isPending || accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {gerar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Gerar relatório
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Relatórios do projeto" icon={Share2}>
        {dados.isPending ? (
          <LoadingBlock rows={2} />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title="Nenhum relatório gerado"
            description="Gere o primeiro relatório para compartilhar a evolução do projeto com o cliente."
          />
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{report.title}</h3>
                      {report.shareEnabled ? (
                        <StatusPill tone="positivo">link público ativo</StatusPill>
                      ) : (
                        <StatusPill tone="neutro">privado</StatusPill>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatLongDay(report.periodStart)} → {formatLongDay(report.periodEnd)} ·{" "}
                      {report.accountIds.length} conta(s) · gerado em{" "}
                      {formatDateTime(report.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => baixarPdf.mutate(report.id)}
                      disabled={baixarPdf.isPending}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
                    >
                      {baixarPdf.isPending && baixarPdf.variables === report.id ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      Baixar PDF
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        compartilhar.mutate({ reportId: report.id, enabled: !report.shareEnabled })
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                    >
                      {report.shareEnabled ? (
                        <>
                          <Link2Off className="size-3.5" /> Desativar link
                        </>
                      ) : (
                        <>
                          <Share2 className="size-3.5" /> Compartilhar
                        </>
                      )}
                    </button>
                    {report.shareEnabled ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(shareUrl(report.shareToken));
                            toast.success("Link copiado.");
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                        >
                          <Copy className="size-3.5" /> Copiar link
                        </button>
                        <a
                          href={`/relatorio/${report.shareToken}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                        >
                          <ExternalLink className="size-3.5" /> Abrir
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
