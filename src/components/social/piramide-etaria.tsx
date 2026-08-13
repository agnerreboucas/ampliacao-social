import type { DemografiaDoPublico } from "@/lib/social/publico";
import { NOME_DO_GENERO } from "@/lib/social/publico";
import { formatCompact, formatNumber, formatPercent } from "@/lib/social/format";

/**
 * A pirâmide etária do público: homens de um lado, mulheres do outro.
 *
 * É o desenho clássico de demografia porque ele responde de relance a pergunta
 * que uma tabela obriga a calcular: **onde está o peso da base, e para que lado
 * ele pende.** Barras espelhadas a partir de um eixo central deixam a assimetria
 * visível sem que ninguém precise comparar dois números.
 *
 * Duas escolhas que mudam o que se lê:
 *
 * **As duas metades usam a mesma escala.** Se cada lado fosse normalizado pelo
 * seu próprio máximo, um público 70% feminino desenharia dois lados do mesmo
 * tamanho — o gráfico mostraria simetria onde há desequilíbrio.
 *
 * **Quem não informou o gênero aparece.** Não é sobra nem erro de coleta: a
 * rede devolve essa fatia, e ela fica numa faixa própria, sem ser distribuída
 * entre os outros dois.
 */
export function PiramideEtaria({ demografia }: { demografia: DemografiaDoPublico }) {
  const maiorLado = Math.max(
    ...demografia.piramide.flatMap((linha) => [linha.feminino, linha.masculino]),
    1,
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_3.5rem_1fr] items-center gap-x-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="text-right">Homens</span>
        <span className="text-center">Idade</span>
        <span>Mulheres</span>
      </div>

      <ul className="space-y-1.5">
        {demografia.piramide.map((linha) => (
          <li
            key={linha.faixa}
            className="grid grid-cols-[1fr_3.5rem_1fr] items-center gap-x-2"
            title={`${linha.faixa}: ${formatNumber(linha.masculino)} homens, ${formatNumber(linha.feminino)} mulheres`}
          >
            <div className="flex items-center justify-end gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {linha.masculino > 0 ? formatCompact(linha.masculino) : ""}
              </span>
              <div className="h-5 flex-1">
                <div
                  className="ml-auto h-full rounded-l-sm bg-[oklch(0.58_0.15_250)]"
                  style={{ width: `${(linha.masculino / maiorLado) * 100}%` }}
                />
              </div>
            </div>

            <span className="text-center text-[11px] tabular-nums">{linha.faixa}</span>

            <div className="flex items-center gap-2">
              <div className="h-5 flex-1">
                <div
                  className="h-full rounded-r-sm bg-[oklch(0.62_0.19_10)]"
                  style={{ width: `${(linha.feminino / maiorLado) * 100}%` }}
                />
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {linha.feminino > 0 ? formatCompact(linha.feminino) : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-2 text-[11px] text-muted-foreground">
        {demografia.porGenero.map((linha) => (
          <span key={linha.genero} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: COR_DO_GENERO[linha.genero] }}
            />
            {NOME_DO_GENERO[linha.genero]}{" "}
            <strong className="tabular-nums text-foreground">
              {formatPercent(linha.fatia * 100, 1)}
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}

const COR_DO_GENERO: Record<string, string> = {
  feminino: "oklch(0.62 0.19 10)",
  masculino: "oklch(0.58 0.15 250)",
  nao_informado: "oklch(0.65 0.02 260)",
};
