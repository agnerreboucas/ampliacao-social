import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Filter,
  History,
  Search,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { listarHistorico, resumoDeUso } from "@/lib/api/social.functions";
import { Restrito } from "@/components/social/restrito";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import { ACOES, AREAS, areaDe, detalhesEmTexto, frase, pesoDe } from "@/lib/social/historico";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/social/format";
import type { EventoHistorico } from "@/lib/social/historico";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/historico")({
  component: () => (
    <Restrito ability="admin" titulo="O histórico é restrito a administradores">
      <HistoricoPage />
    </Restrito>
  ),
});

/** Hoje e há N dias, no formato AAAA-MM-DD do filtro. */
function diaRelativo(dias: number): string {
  const data = new Date();
  data.setDate(data.getDate() - dias);
  return `${data.getFullYear()}-${`${data.getMonth() + 1}`.padStart(2, "0")}-${`${data.getDate()}`.padStart(2, "0")}`;
}

const JANELAS = [
  { rotulo: "7 dias", dias: 7 },
  { rotulo: "30 dias", dias: 30 },
  { rotulo: "90 dias", dias: 90 },
  { rotulo: "Tudo", dias: null },
] as const;

const POR_PAGINA = 100;

function HistoricoPage() {
  const [janela, setJanela] = useState<number | null>(30);
  const [usuarioId, setUsuarioId] = useState("");
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [pagina, setPagina] = useState(0);

  const de = janela === null ? undefined : diaRelativo(janela);

  // Objeto estável para a chave da consulta e para o servidor.
  const filtro = useMemo(
    () => ({
      de,
      usuarioId: usuarioId || undefined,
      area: area || undefined,
      busca: buscaAplicada || undefined,
    }),
    [de, usuarioId, area, buscaAplicada],
  );

  const historico = useQuery({
    queryKey: ["social", "historico", filtro, pagina],
    queryFn: () =>
      listarHistorico({
        data: { ...filtro, limite: POR_PAGINA, deslocamento: pagina * POR_PAGINA },
      }),
  });

  const resumo = useQuery({
    queryKey: ["social", "historico", "resumo", de],
    queryFn: () => resumoDeUso({ data: { de } }),
  });

  const dados = historico.data;
  const eventos = dados?.eventos ?? [];
  const total = dados?.total ?? 0;
  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1);

  const trocarFiltro = (aplicar: () => void) => {
    aplicar();
    // Uma página 4 que deixa de existir com o filtro novo mostraria vazio; o
    // resultado seria lido como "não há nada", que é diferente de "acabou".
    setPagina(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico de uso"
        description="Quem fez o quê, quando e de onde. Esta tela é restrita a administradores."
        actions={
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-card/60 p-1">
            {JANELAS.map((opcao) => (
              <button
                key={opcao.rotulo}
                type="button"
                onClick={() => trocarFiltro(() => setJanela(opcao.dias))}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  janela === opcao.dias
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        }
      />

      {dados?.volatil ? (
        <p className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            Este histórico está apenas na memória do servidor e some quando ele reinicia. Configure
            o banco de dados para guardá-lo de verdade.
          </span>
        </p>
      ) : null}

      <SectionCard
        title="Quem está usando"
        description="Ações por pessoa no período escolhido, da mais ativa para a menos."
        icon={Users}
      >
        {resumo.isPending ? (
          <LoadingBlock rows={2} />
        ) : (resumo.data?.pessoas.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada no período.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {resumo.data!.pessoas.map((pessoa) => (
              <li
                key={pessoa.usuarioId ?? pessoa.usuarioNome}
                className="min-w-0 rounded-xl border border-border p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium">{pessoa.usuarioNome}</span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">
                    {formatNumber(pessoa.acoes)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  última {formatRelative(pessoa.ultimaEm)}
                  {pessoa.usuarioId === null ? " · sem sessão" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {pessoa.porArea.slice(0, 3).map((linha) => (
                    <span
                      key={linha.area}
                      className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {linha.area} {linha.acoes}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Linha do tempo"
        description={
          total > 0
            ? `${formatNumber(total)} ação(ões) no período e nos filtros escolhidos.`
            : "Nenhuma ação com estes filtros."
        }
        icon={History}
        actions={
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Filter className="size-3.5" />
            filtros abaixo
          </span>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Pessoa</span>
              <select
                value={usuarioId}
                onChange={(evento) => trocarFiltro(() => setUsuarioId(evento.target.value))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                {(dados?.pessoas ?? []).map((pessoa) => (
                  <option key={pessoa.id} value={pessoa.id}>
                    {pessoa.nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Área</span>
              <select
                value={area}
                onChange={(evento) => trocarFiltro(() => setArea(evento.target.value))}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
              >
                <option value="">Todas</option>
                {AREAS.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>

            <form
              className="space-y-1.5"
              onSubmit={(evento) => {
                evento.preventDefault();
                trocarFiltro(() => setBuscaAplicada(busca.trim()));
              }}
            >
              <span className="text-xs font-medium text-muted-foreground">Buscar</span>
              <div className="flex gap-2">
                <input
                  value={busca}
                  onChange={(evento) => setBusca(evento.target.value)}
                  placeholder="Nome de quem agiu ou do alvo"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  <Search className="size-3.5" />
                </button>
              </div>
            </form>
          </div>

          {(usuarioId || area || buscaAplicada) && (
            <button
              type="button"
              onClick={() =>
                trocarFiltro(() => {
                  setUsuarioId("");
                  setArea("");
                  setBusca("");
                  setBuscaAplicada("");
                })
              }
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              <X className="size-3.5" />
              Limpar filtros
            </button>
          )}

          {historico.isPending ? (
            <LoadingBlock rows={4} />
          ) : eventos.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nada registrado ainda"
              description="As ações da equipe aparecem aqui assim que acontecerem."
            />
          ) : (
            <>
              <ul className="divide-y divide-border">
                {eventos.map((evento) => (
                  <LinhaDoHistorico key={evento.id} evento={evento} />
                ))}
              </ul>

              {ultimaPagina > 0 ? (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    disabled={pagina === 0}
                    onClick={() => setPagina((atual) => Math.max(0, atual - 1))}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-xs text-muted-foreground">
                    página {pagina + 1} de {ultimaPagina + 1}
                  </span>
                  <button
                    type="button"
                    disabled={pagina >= ultimaPagina}
                    onClick={() => setPagina((atual) => Math.min(ultimaPagina, atual + 1))}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function LinhaDoHistorico({ evento }: { evento: EventoHistorico }) {
  const [aberto, setAberto] = useState(false);
  const atencao = pesoDe(evento.acao) === "atencao";
  const detalhes = detalhesEmTexto(evento);
  // O endereço só aparece quando alguém pede: numa lista longa é ruído, e numa
  // investigação é a primeira coisa procurada.
  const temExtra = Boolean(detalhes || evento.ip || evento.projetoNome);

  return (
    <li>
      <button
        type="button"
        onClick={() => temExtra && setAberto((atual) => !atual)}
        className={cn(
          "-mx-2 flex w-[calc(100%+1rem)] min-w-0 items-start gap-3 rounded-lg px-2 py-3 text-left",
          temExtra && "transition-colors hover:bg-secondary/50",
        )}
      >
        <span
          className={cn(
            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
            atencao ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground",
          )}
        >
          {atencao ? <AlertTriangle className="size-3.5" /> : <Clock className="size-3.5" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm">{frase(evento)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDateTime(evento.em)}</span>
            <span aria-hidden>·</span>
            <span>{areaDe(evento.acao)}</span>
            {evento.projetoNome ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{evento.projetoNome}</span>
              </>
            ) : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusPill tone={atencao ? "destaque" : "neutro"}>
            {ACOES[evento.acao]?.area ?? "Outros"}
          </StatusPill>
          {temExtra ? (
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                aberto && "rotate-180",
              )}
            />
          ) : null}
        </div>
      </button>

      {aberto && temExtra ? (
        <dl className="mb-3 ml-10 grid gap-x-6 gap-y-1 rounded-lg bg-secondary/30 p-3 text-xs sm:grid-cols-2">
          {detalhes ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Detalhes</dt>
              <dd className="mt-0.5 break-words">{detalhes}</dd>
            </div>
          ) : null}
          {evento.ip ? (
            <div>
              <dt className="text-muted-foreground">Endereço de origem</dt>
              <dd className="mt-0.5 font-mono">{evento.ip}</dd>
            </div>
          ) : null}
          {evento.alvoId ? (
            <div>
              <dt className="text-muted-foreground">Identificador do alvo</dt>
              <dd className="mt-0.5 font-mono">{evento.alvoId}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </li>
  );
}
