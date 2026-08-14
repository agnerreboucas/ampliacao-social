import { Link } from "@tanstack/react-router";
import { Lightbulb, Radar, TriangleAlert } from "lucide-react";

import { AccountAvatar, SectionCard, StatusPill } from "@/components/social/primitives";
import { formatCompact, formatCurrency, formatNumber, formatPercent } from "@/lib/social/format";
import { NETWORKS } from "@/lib/social/networks";
import type { LinhaDoCanal, PesoRecomendacao, Recomendacao } from "@/lib/social/recomendacoes";
import { cn } from "@/lib/utils";

/**
 * As duas peças que vieram da tela "Visão geral", quando ela deixou de existir.
 *
 * Painel e Visão geral respondiam a mesma pergunta com os mesmos quatro
 * indicadores e a mesma curva — duas entradas no menu para o mesmo lugar, e
 * quem abria a segunda procurava o que já tinha visto. O que a Visão geral
 * tinha de próprio eram estas duas: a leitura em tabela, canal a canal, e as
 * observações com a evidência ao lado. As duas viveram para o Painel.
 */

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

export function Recomendacoes({ lista }: { lista: Recomendacao[] }) {
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

export function TabelaDeCanais({ canais }: { canais: LinhaDoCanal[] }) {
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
