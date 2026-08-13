import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Table2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { conferirImportacao, importarHistorico, listarContas } from "@/lib/api/social.functions";
import {
  AccountAvatar,
  InlineError,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import { ROTULOS, resumirPlano, type Plano } from "@/lib/social/importacao";
import { formatCurrency, formatLongDay, formatNumber } from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/importar")({
  component: ImportarPage,
});

/** Como cada ordem de data detectada é explicada para quem vai conferir. */
const ORDEM_EM_PALAVRAS: Record<Plano["ordemDaData"], string> = {
  "dia-mes": "dia/mês/ano",
  "mes-dia": "mês/dia/ano",
  iso: "ano-mês-dia",
  indefinida: "não foi possível determinar",
};

function ImportarPage() {
  const { projectId } = useSocialSession();
  const queryClient = useQueryClient();

  const [accountId, setAccountId] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [nomeDoArquivo, setNomeDoArquivo] = useState("");
  const [arrastando, setArrastando] = useState(false);

  const contas = useQuery({
    queryKey: ["social", "contas", projectId],
    queryFn: () => listarContas({ data: { projectId: projectId ?? undefined } }),
    enabled: Boolean(projectId),
  });

  const conferir = useMutation({
    mutationFn: () => conferirImportacao({ data: { accountId, conteudo } }),
    onError: () => toast.error("Não foi possível ler a planilha."),
  });

  const importar = useMutation({
    mutationFn: () => importarHistorico({ data: { accountId, conteudo, nomeDoArquivo } }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      toast.success(`${resultado.plano.linhas.length} dia(s) importado(s).`);
      // Tudo que mostra número precisa esquecer o que tinha em cache.
      queryClient.invalidateQueries({ queryKey: ["social"] });
      setConteudo("");
      setNomeDoArquivo("");
      conferir.reset();
    },
    onError: () => toast.error("Não foi possível importar."),
  });

  const receberArquivo = async (arquivo: File) => {
    const texto = await arquivo.text();
    setConteudo(texto);
    setNomeDoArquivo(arquivo.name);
    conferir.reset();
  };

  const plano = conferir.data?.plano;
  const contasDoProjeto = contas.data?.accounts ?? [];
  const contaEscolhida = contasDoProjeto.find((conta) => conta.id === accountId);
  const prontoParaConferir = Boolean(accountId && conteudo.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar histórico"
        description="Traga de uma vez os números que já existem: exportação do Meta Business Suite, planilha do Google ou qualquer CSV."
      />

      <SectionCard
        title="1. Escolha a conta"
        description="O histórico entra nesta conta. Cada canal tem o seu."
        icon={Table2}
      >
        {contas.isPending ? (
          <LoadingBlock rows={2} />
        ) : contasDoProjeto.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este projeto ainda não tem contas. Cadastre uma em Contas antes de importar.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {contasDoProjeto.map((conta) => (
              <button
                key={conta.id}
                type="button"
                onClick={() => {
                  setAccountId(conta.id);
                  conferir.reset();
                }}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  accountId === conta.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:bg-secondary/50",
                )}
              >
                <AccountAvatar
                  gradient={conta.avatarGradient}
                  label={conta.displayName}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{conta.displayName}</span>
                    <NetworkChip networkId={conta.networkId} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{conta.handle}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="2. Traga a planilha"
        description="Arraste o arquivo, escolha do computador ou cole o conteúdo. Precisa de uma coluna de data e ao menos uma de número."
        icon={FileSpreadsheet}
      >
        <div className="space-y-4">
          <div
            onDragOver={(evento) => {
              evento.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(evento) => {
              evento.preventDefault();
              setArrastando(false);
              const arquivo = evento.dataTransfer.files[0];
              if (arquivo) void receberArquivo(arquivo);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
              arrastando ? "border-accent bg-accent/5" : "border-border",
            )}
          >
            <span className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
              <Upload className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Solte o arquivo aqui</p>
              <p className="mt-0.5 text-xs text-muted-foreground">CSV, TSV ou texto separado</p>
            </div>
            <label className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
              Escolher do computador
              <input
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                className="sr-only"
                onChange={(evento) => {
                  const arquivo = evento.target.files?.[0];
                  if (arquivo) void receberArquivo(arquivo);
                }}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="colar" className="text-sm font-medium">
              Ou cole aqui
            </label>
            <textarea
              id="colar"
              value={conteudo}
              onChange={(evento) => {
                setConteudo(evento.target.value);
                if (!nomeDoArquivo) setNomeDoArquivo("colado");
                conferir.reset();
              }}
              rows={6}
              placeholder={
                "Data;Seguidores;Alcance orgânico;Investimento\n01/07/2026;10.000;4.500;R$ 35,50"
              }
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {nomeDoArquivo && conteudo ? (
              <p className="text-xs text-muted-foreground">
                {nomeDoArquivo} · {formatNumber(conteudo.split("\n").length)} linha(s)
              </p>
            ) : null}
          </div>

          <button
            type="button"
            disabled={!prontoParaConferir || conferir.isPending}
            onClick={() => conferir.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {conferir.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Conferir antes de importar
          </button>
        </div>
      </SectionCard>

      {plano ? (
        <SectionCard
          title="3. Confira o que vai entrar"
          description="Nada foi gravado ainda. Esta é a chance de perceber uma coluna trocada antes que ela vire histórico."
          icon={CheckCircle2}
        >
          <div className="space-y-5">
            {plano.problemas.length > 0 ? (
              <div className="space-y-2">
                <InlineError>
                  {plano.problemas.length} linha(s) com problema
                  {plano.utilizavel ? " — o resto pode ser importado mesmo assim." : "."}
                </InlineError>
                <ul className="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3 text-xs">
                  {plano.problemas.map((problema, indice) => (
                    <li key={indice} className="flex gap-2">
                      <span className="shrink-0 font-mono text-muted-foreground">
                        linha {problema.linha}
                      </span>
                      <span>{problema.mensagem}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {plano.utilizavel ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Resumo rotulo="Dias no arquivo" valor={formatNumber(plano.linhas.length)} />
                  <Resumo
                    rotulo="Novos"
                    valor={formatNumber(plano.linhas.length - plano.conflitos.length)}
                  />
                  <Resumo
                    rotulo="Serão reescritos"
                    valor={formatNumber(plano.conflitos.length)}
                    alerta={plano.conflitos.length > 0}
                  />
                  <Resumo
                    rotulo="Período"
                    valor={
                      plano.primeiroDia && plano.ultimoDia
                        ? `${formatLongDay(plano.primeiroDia)} → ${formatLongDay(plano.ultimoDia)}`
                        : "—"
                    }
                    pequeno
                  />
                </div>

                {/* A ordem da data é a única coisa que pode estar errada sem
                    dar erro nenhum, e o estrago seria o histórico inteiro
                    deslocado. Por isso ela é dita em palavras, com exemplo. */}
                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm">
                  <CalendarRange className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div>
                    <p>
                      As datas foram lidas como{" "}
                      <strong>{ORDEM_EM_PALAVRAS[plano.ordemDaData]}</strong>.
                    </p>
                    {plano.primeiroDia ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        A primeira linha virou {formatLongDay(plano.primeiroDia)}. Se não for esse
                        dia, converta a coluna de datas para AAAA-MM-DD e traga o arquivo de novo.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    Colunas reconhecidas
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {plano.colunas.map((coluna, indice) => (
                      <span
                        key={indice}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs",
                          coluna.campo
                            ? "bg-accent/10 text-accent"
                            : "bg-secondary text-muted-foreground line-through",
                        )}
                        title={coluna.campo ? ROTULOS[coluna.campo] : "ignorada"}
                      >
                        {coluna.cabecalho}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Colunas riscadas são ignoradas. Campos que não vieram no arquivo não são
                    alterados nos dias que já existem.
                  </p>
                </div>

                {conferir.data?.amostra?.length ? (
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      Primeiras linhas, já convertidas
                    </h3>
                    <div className="mt-2 -mx-1 overflow-x-auto px-1">
                      <table className="w-full min-w-[34rem] text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            <th className="pb-1.5 font-medium">Dia</th>
                            <th className="pb-1.5 text-right font-medium">Seguidores</th>
                            <th className="pb-1.5 text-right font-medium">Alcance orgânico</th>
                            <th className="pb-1.5 text-right font-medium">Alcance pago</th>
                            <th className="pb-1.5 text-right font-medium">Investido</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {conferir.data.amostra.map((linha) => (
                            <tr key={linha.date}>
                              <td className="py-1.5">{formatLongDay(linha.date)}</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatNumber(linha.valores.followers)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatNumber(linha.valores.organicReach)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatNumber(linha.valores.paidReach)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatCurrency(linha.valores.adSpend)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {plano.conflitos.length > 0 ? (
                  <p className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
                    <span>
                      {plano.conflitos.length} dia(s) já têm números guardados e serão substituídos
                      pelos da planilha. Isso não tem desfazer.
                    </span>
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={importar.isPending}
                    onClick={() => importar.mutate()}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                  >
                    {importar.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    Importar para {contaEscolhida?.handle ?? "a conta"}
                  </button>
                  <span className="text-xs text-muted-foreground">{resumirPlano(plano)}</span>
                </div>
              </>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {importar.data?.ok ? (
        <SectionCard title="Pronto" icon={CheckCircle2}>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone="positivo">
              {importar.data.plano.linhas.length} dia(s) no histórico
            </StatusPill>
            <span className="text-sm text-muted-foreground">
              Os painéis e os relatórios já estão usando estes números.
            </span>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function Resumo({
  rotulo,
  valor,
  alerta,
  pequeno,
}: {
  rotulo: string;
  valor: string;
  alerta?: boolean;
  pequeno?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-3",
        alerta ? "border-accent/50 bg-accent/5" : "border-border",
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</div>
      <div
        className={cn(
          "mt-1 truncate font-semibold tabular-nums",
          pequeno ? "text-sm" : "text-lg",
          alerta && "text-accent",
        )}
      >
        {valor}
      </div>
    </div>
  );
}
