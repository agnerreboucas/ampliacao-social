import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CloudUpload,
  Database,
  Download,
  LoaderCircle,
  PencilLine,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  exportarDados,
  importarDados,
  registrarAtualizacao,
  situacaoAtualizacao,
} from "@/lib/api/social.functions";
import {
  AccountAvatar,
  InlineError,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import {
  CAMPOS_MANUAIS,
  JANELAS,
  ORDEM_JANELAS,
  janelaDe,
  type Janela,
} from "@/lib/social/atualizacao";
import { formatCurrency, formatNumber } from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { AtualizacaoManual, SocialAccount, ValoresManuais } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/atualizar")({
  component: AtualizarPage,
});

function hojeLocal(): string {
  const agora = new Date();
  const mes = `${agora.getMonth() + 1}`.padStart(2, "0");
  const dia = `${agora.getDate()}`.padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

function AtualizarPage() {
  const { projectId, session } = useSocialSession();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(hojeLocal);
  const [contaAberta, setContaAberta] = useState<string | null>(null);

  const situacao = useQuery({
    queryKey: ["social", "atualizacao", projectId, date],
    queryFn: () => situacaoAtualizacao({ data: { projectId: projectId ?? undefined, date } }),
    enabled: Boolean(projectId),
  });

  const contas = situacao.data?.contas ?? [];
  const porConta = situacao.data?.porConta ?? [];
  const noBanco = situacao.data?.destino.tipo === "postgres";

  const baixar = useMutation({
    mutationFn: () => exportarDados(),
    onSuccess: (resultado) => {
      // O download é o caminho até o Git: baixa, substitui dados/plataforma.json
      // no repositório, commita.
      const blob = new Blob([resultado.conteudo], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resultado.nome;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(
        noBanco
          ? "Cópia de segurança baixada."
          : "Arquivo baixado. Agora é substituir no repositório e commitar.",
      );
    },
    onError: () => toast.error("Não foi possível gerar o arquivo."),
  });

  const carregar = useMutation({
    mutationFn: (conteudo: string) => importarDados({ data: { conteudo } }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["social"] });
      toast.success(
        `Carregado: ${resultado.contas} contas e ${resultado.atualizacoes} atualizações.`,
      );
    },
    onError: () => toast.error("Não foi possível ler o arquivo."),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atualização manual"
        description="Enquanto a leitura automática das redes não sai, os números entram aqui. Atualize quantas vezes por dia quiser — o histórico continua diário, só fica mais preciso."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary">
              <CloudUpload className="size-4" />
              Carregar arquivo
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (event) => {
                  const arquivo = event.target.files?.[0];
                  if (!arquivo) return;
                  carregar.mutate(await arquivo.text());
                  event.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => baixar.mutate()}
              disabled={baixar.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {baixar.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {noBanco ? "Baixar cópia" : "Baixar para o Git"}
            </button>
          </div>
        }
      />

      <div className="surface-card flex min-w-0 flex-wrap items-end gap-4 p-4">
        <div>
          <label htmlFor="data" className="text-xs text-muted-foreground">
            Dia dos números
          </label>
          <input
            id="data"
            type="date"
            value={date}
            max={hojeLocal()}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 block rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          As redes reportam o acumulado do dia. Registrar de novo o mesmo dia{" "}
          <strong className="text-foreground">substitui</strong> a linha em vez de criar outra —
          três leituras não viram três pontos no gráfico, viram um ponto mais certo. O que fica
          guardado de cada leitura é o movimento entre elas.
        </p>
        {situacao.data ? (
          <p className="text-[11px] text-muted-foreground">
            {situacao.data.totalRegistros} leituras guardadas
          </p>
        ) : null}
      </div>

      {situacao.isPending ? (
        <LoadingBlock rows={4} />
      ) : (
        <div className="space-y-4">
          {contas.map((conta) => {
            const dados = porConta.find((item) => item.accountId === conta.id);
            if (!dados) return null;
            return (
              <CartaoDaConta
                key={conta.id}
                conta={conta}
                date={date}
                registros={dados.registros}
                progresso={dados.progresso}
                valoresIniciais={dados.valores}
                temDoDia={dados.temDoDia}
                aberto={contaAberta === conta.id}
                onAlternar={() => setContaAberta(contaAberta === conta.id ? null : conta.id)}
                autor={session?.user.name ?? "Equipe"}
                onSalvo={() => queryClient.invalidateQueries({ queryKey: ["social"] })}
              />
            );
          })}
        </div>
      )}

      <SectionCard
        title="Onde os números ficam guardados"
        description={
          noBanco
            ? "Banco de dados: o que você salva já está valendo, sem passo manual."
            : "Arquivo versionado no Git: o caminho sem servidor e sem custo mensal."
        }
        icon={noBanco ? Database : PencilLine}
      >
        {noBanco ? (
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">1.</strong> Digite os números aqui e salve. Vai
              direto para o banco, em uma transação — ou grava tudo, ou não grava nada.
            </li>
            <li>
              <strong className="text-foreground">2.</strong> Pronto. Qualquer pessoa que abrir a
              plataforma já vê os números novos, sem commit e sem republicar.
            </li>
            <li>
              <strong className="text-foreground">3.</strong> O botão “Baixar” continua servindo
              para tirar uma cópia de segurança quando você quiser.
            </li>
          </ol>
        ) : (
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">1.</strong> Digite os números aqui e salve. O
              arquivo{" "}
              <code className="rounded bg-secondary px-1 text-xs">dados/plataforma.json</code> é
              gravado automaticamente.
            </li>
            <li>
              <strong className="text-foreground">2.</strong> Clique em “Baixar para o Git” e
              substitua esse arquivo no repositório.
            </li>
            <li>
              <strong className="text-foreground">3.</strong> Faça o commit e o push. A automação
              reconstrói o HTML com os números novos.
            </li>
          </ol>
        )}
        {situacao.data ? (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            {noBanco ? <Database className="size-3.5" /> : null}
            {noBanco ? "Banco em" : "Arquivo em"}{" "}
            <code className="rounded bg-secondary px-1">{situacao.data.destino.descricao}</code>
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}

function CartaoDaConta({
  conta,
  date,
  registros,
  progresso,
  valoresIniciais,
  temDoDia,
  aberto,
  onAlternar,
  autor,
  onSalvo,
}: {
  conta: SocialAccount;
  date: string;
  registros: AtualizacaoManual[];
  progresso: { feitas: number; meta: number; janelasFeitas: Janela[]; proxima: Janela | null };
  valoresIniciais: ValoresManuais;
  temDoDia: boolean;
  aberto: boolean;
  onAlternar: () => void;
  autor: string;
  onSalvo: () => void;
}) {
  const [valores, setValores] = useState<ValoresManuais>(valoresIniciais);
  const [erro, setErro] = useState<string | null>(null);

  // Trocar o dia (ou salvar) traz números diferentes do servidor; o formulário
  // precisa acompanhar, senão o usuário edita em cima do dia errado.
  useEffect(() => {
    setValores(valoresIniciais);
  }, [valoresIniciais]);

  const salvar = useMutation({
    mutationFn: () => registrarAtualizacao({ data: { accountId: conta.id, date, autor, valores } }),
    onSuccess: (resultado) => {
      setErro(null);
      onSalvo();
      if (!resultado.gravacao.gravado) {
        toast.warning("Salvo na sessão, mas não foi possível guardar em definitivo.", {
          description:
            resultado.gravacao.erro ?? "Use o botão de baixar para não perder os números.",
        });
      } else {
        toast.success(`${conta.displayName}: leitura ${resultado.progresso.feitas} do dia salva.`);
      }
    },
    onError: () => setErro("Não foi possível salvar os números."),
  });

  const ultima = registros.at(-1);

  return (
    <div className="surface-card min-w-0 overflow-hidden">
      <button
        type="button"
        onClick={onAlternar}
        className="flex w-full min-w-0 flex-wrap items-center gap-3 p-4 text-left transition-colors hover:bg-secondary/40"
      >
        <AccountAvatar gradient={conta.avatarGradient} label={conta.displayName} size={38} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{conta.displayName}</span>
            <NetworkChip networkId={conta.networkId} />
          </div>
          <p className="truncate text-xs text-muted-foreground">{conta.handle}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {ORDEM_JANELAS.map((janela) => {
            const feita = progresso.janelasFeitas.includes(janela);
            return (
              <span
                key={janela}
                title={JANELAS[janela].label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                  feita
                    ? "bg-[color-mix(in_oklch,var(--color-primary)_22%,transparent)] text-foreground"
                    : "border border-dashed border-border text-muted-foreground",
                )}
              >
                {feita ? <Check className="size-3" /> : null}
                {JANELAS[janela].label}
              </span>
            );
          })}
          {/* Passar da meta não é erro — quem lê cinco vezes lê cinco vezes.
              "5 de 3" é que não faz sentido nenhum. */}
          <StatusPill tone={temDoDia ? "positivo" : "atencao"}>
            {progresso.feitas > progresso.meta
              ? `${progresso.feitas} leituras`
              : `${progresso.feitas} de ${progresso.meta}`}
          </StatusPill>
        </div>
      </button>

      {aberto ? (
        <div className="space-y-4 border-t border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CAMPOS_MANUAIS.map((campo) => (
              <div key={campo.chave} className="min-w-0">
                <label
                  htmlFor={`${conta.id}-${campo.chave}`}
                  className="text-xs font-medium text-foreground"
                >
                  {campo.label}
                </label>
                <input
                  id={`${conta.id}-${campo.chave}`}
                  type="number"
                  min={0}
                  step={campo.moeda ? "0.01" : "1"}
                  value={valores[campo.chave]}
                  onChange={(event) =>
                    setValores((atual) => ({
                      ...atual,
                      [campo.chave]: Number(event.target.value) || 0,
                    }))
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{campo.ajuda}</p>
              </div>
            ))}
          </div>

          {erro ? <InlineError>{erro}</InlineError> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {salvar.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Salvar leitura
            </button>
            {ultima ? (
              <p className="text-xs text-muted-foreground">
                Última leitura às{" "}
                {new Date(ultima.registradaEm).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                por {ultima.autor}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Primeira leitura deste dia.</p>
            )}
          </div>

          {registros.length > 1 ? <HistoricoDoDia registros={registros} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * O movimento entre as leituras do dia.
 *
 * Sem isto, a segunda leitura só sobrescreve a primeira e ninguém vê o que
 * aconteceu entre as duas — que é justamente o motivo de atualizar mais de uma
 * vez por dia.
 */
function HistoricoDoDia({ registros }: { registros: AtualizacaoManual[] }) {
  return (
    <section className="rounded-xl border border-border p-3">
      <h3 className="text-xs font-medium uppercase text-muted-foreground">Leituras deste dia</h3>
      <ul className="mt-2 space-y-2">
        {registros.map((registro, indice) => {
          const anterior = indice > 0 ? registros[indice - 1] : null;
          const diferencaSeguidores = anterior
            ? registro.valores.followers - anterior.valores.followers
            : 0;
          const diferencaAlcance = anterior
            ? registro.valores.organicReach +
              registro.valores.paidReach -
              (anterior.valores.organicReach + anterior.valores.paidReach)
            : 0;

          return (
            <li
              key={registro.id}
              className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-muted-foreground"
            >
              <span className="shrink-0 tabular-nums text-foreground">
                {new Date(registro.registradaEm).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="shrink-0">{JANELAS[janelaDe(registro.registradaEm)].label}</span>
              <span className="shrink-0">
                {formatNumber(registro.valores.followers)} seguidores
              </span>
              {anterior ? <Delta valor={diferencaSeguidores} /> : null}
              <span className="shrink-0">
                {formatNumber(registro.valores.organicReach + registro.valores.paidReach)} de
                alcance
              </span>
              {anterior ? <Delta valor={diferencaAlcance} /> : null}
              {registro.valores.adSpend > 0 ? (
                <span className="shrink-0">
                  {formatCurrency(registro.valores.adSpend)} investidos
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Delta({ valor }: { valor: number }) {
  if (valor === 0) return <span className="shrink-0 opacity-60">sem mudança</span>;
  const positivo = valor > 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 font-medium",
        positivo ? "text-success" : "text-destructive",
      )}
    >
      {positivo ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {formatNumber(Math.abs(valor))}
    </span>
  );
}
