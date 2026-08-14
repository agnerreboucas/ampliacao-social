import { Link } from "@tanstack/react-router";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { NETWORKS } from "@/lib/social/networks";
import {
  formatCompact,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "@/lib/social/format";
import type { MetricSummary, NetworkId, OrganicPaidSplit } from "@/lib/social/types";
import { cn } from "@/lib/utils";

/**
 * O cartão de uma rede social no painel.
 *
 * É a peça central da primeira tela: em vez de um número só, somando redes que
 * se comportam de formas diferentes, cada rede aparece com o próprio quadro.
 * Quem abre a plataforma de manhã quer saber *onde* mexer, e "onde" é a rede.
 *
 * Três decisões de leitura:
 *
 * A faísca não tem eixo nem valores. Ela responde "está subindo?" — a pergunta
 * de um segundo. Quem quiser ler número clica e vai para o detalhe.
 *
 * Uma conexão com problema aparece **acima** dos números. Um cartão que mostra
 * crescimento bonito escondendo que a conta está desconectada informa o
 * contrário do que deveria: aquele número parou de crescer e ninguém sabe.
 *
 * A cor é a da rede, e só aparece na borda superior e na faísca. Pintar o
 * cartão inteiro com a cor da marca faria cinco cartões brigarem entre si na
 * mesma tela.
 */
export function CartaoDeRede({
  networkId,
  contas,
  comProblema,
  resumo,
  split,
  faisca,
  publicacoes,
  pendentes,
}: {
  networkId: NetworkId;
  contas: number;
  comProblema: number;
  resumo: MetricSummary;
  split: OrganicPaidSplit;
  faisca: number[];
  publicacoes: number;
  pendentes: number;
}) {
  const rede = NETWORKS[networkId];
  const alcance = split.organic.reach + split.paid.reach;
  const fatiaPaga = alcance > 0 ? split.paid.reach / alcance : 0;

  return (
    <Link
      to="/social/rede/$networkId"
      params={{ networkId }}
      className="surface-card group flex min-w-0 flex-col overflow-hidden transition-colors hover:bg-card-elevated"
    >
      <span aria-hidden className="h-1 w-full shrink-0" style={{ background: rede.gradient }} />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{rede.label}</h3>
            <p className="text-[11px] text-muted-foreground">
              {contas === 1 ? "1 perfil" : `${contas} perfis`}
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>

        {comProblema > 0 ? (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {comProblema === 1
                ? "1 conexão precisa de atenção"
                : `${comProblema} conexões precisam de atenção`}
            </span>
          </p>
        ) : null}

        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums">
              {formatNumber(resumo.followers)}
            </span>
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                resumo.followersDelta >= 0 ? "text-emerald-600" : "text-destructive",
              )}
            >
              {resumo.followersDelta >= 0 ? "+" : ""}
              {formatNumber(resumo.followersDelta)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">seguidores no período</p>
        </div>

        <Faisca valores={faisca} cor={rede.color} />

        {/*
          Quatro linhas de métrica viraram três, e a de "alcance pago" saiu.
          Com seis redes o painel passou a exigir rolagem para mostrar a
          última — e um cartão que só se vê rolando não cumpre o papel de dar
          o panorama de relance. As três que ficaram respondem "quanto",
          "quão bem" e "para onde"; a fatia paga continua no detalhe da rede.
        */}
        <dl className="grid grid-cols-3 gap-x-3 text-[11px]">
          <Linha rotulo="Alcance" valor={formatCompact(alcance)} />
          <Linha
            rotulo="Engajamento"
            valor={resumo.engagementRate > 0 ? formatPercent(resumo.engagementRate) : "—"}
          />
          <Linha
            rotulo="Variação"
            valor={resumo.reachDelta !== 0 ? formatSignedPercent(resumo.reachDelta) : "—"}
            tom={resumo.reachDelta < 0 ? "queda" : undefined}
          />
        </dl>

        {publicacoes > 0 || pendentes > 0 ? (
          <p className="mt-auto border-t border-border pt-2 text-[11px] text-muted-foreground">
            {publicacoes} publicação(ões)
            {pendentes > 0 ? ` · ${pendentes} interação(ões) esperando` : ""}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "queda" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn(
          "mt-0.5 font-medium tabular-nums",
          tom === "queda" ? "text-destructive" : undefined,
        )}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * A linha de tendência do cartão.
 *
 * SVG desenhado à mão em vez de um componente de gráfico: são poucos pontos,
 * sem eixo, sem dica de contexto e sem interação — trazer a biblioteca inteira
 * para isso pesaria mais que o cartão todo.
 *
 * A escala é a da própria rede, não a do painel. Comparar a inclinação entre
 * dois cartões seria enganoso de qualquer forma, já que as bases são
 * diferentes; o que cada faísca diz é apenas o rumo daquela rede.
 */
function Faisca({ valores, cor }: { valores: number[]; cor: string }) {
  if (valores.length < 2) {
    return <div className="h-10 rounded-lg bg-secondary/40" aria-hidden />;
  }

  const largura = 100;
  const altura = 20;
  const maximo = Math.max(...valores);
  const minimo = Math.min(...valores);
  // Série plana dividiria por zero; a faixa mínima também evita desenhar a
  // linha colada na borda de baixo.
  const faixa = maximo - minimo || Math.max(maximo * 0.02, 1);

  const pontos = valores.map((valor, indice) => ({
    x: (indice / (valores.length - 1)) * largura,
    y: altura - ((valor - minimo) / faixa) * (altura - 4) - 2,
  }));

  const linha = pontos.map((ponto, i) => `${i === 0 ? "M" : "L"}${ponto.x} ${ponto.y}`).join(" ");
  const area = `${linha} L${largura} ${altura} L0 ${altura} Z`;
  const ultimo = pontos[pontos.length - 1];

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Tendência de seguidores: ${valores[0] <= valores[valores.length - 1] ? "em alta" : "em queda"}`}
    >
      <path d={area} fill={cor} opacity={0.1} />
      <path
        d={linha}
        fill="none"
        stroke={cor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* O ponto final marca onde a série está agora, que é o que se procura. */}
      <circle cx={ultimo.x} cy={ultimo.y} r={2} fill={cor} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
