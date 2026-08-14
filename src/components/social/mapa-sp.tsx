import { useMemo, useState } from "react";

import { FAIXAS_IPS, PROPORCAO_DO_MAPA, faixaDoIps, type PontoNoMapa } from "@/lib/social/mapa";
import { CONTORNO_SP, MALHA_SP } from "@/lib/social/malha-sp";
import { formatCompact, formatCurrency, formatNumber } from "@/lib/social/format";
import { cn } from "@/lib/utils";

/**
 * O estado de São Paulo em territórios, um por município.
 *
 * A versão anterior desenhava uma bolinha por cidade. Bolinha responde
 * "quanto"; não responde "quanto do estado", que é a pergunta de uma campanha
 * estadual. Território pintado responde: a mancha da campanha cresce sobre o
 * mapa, e o vazio ao lado dela tem o mesmo peso visual que a área ocupada.
 *
 * As áreas são células de Voronoi das sedes municipais, calculadas uma vez em
 * `scripts/gerar-malha.ts`. **Não são os limites do IBGE** — e a tela diz isso,
 * porque um mapa que parece oficial e não é, engana em silêncio.
 *
 * Duas visões, duas perguntas:
 *
 * **Prioridade** colore pelo IPS: onde a campanha deveria estar.
 * **Alcance** colore pelo que foi entregue: onde ela está.
 *
 * O recorte da Grande São Paulo existe porque quarenta municípios de área
 * minúscula concentram metade do eleitorado do estado. No mapa inteiro eles são
 * um borrão de dois pixels; sem o recorte, a região que mais importa é a única
 * que não dá para ler.
 */

export type Visao = "prioridade" | "alcance";

const LARGURA = 1000;
const ALTURA = Math.round(LARGURA * PROPORCAO_DO_MAPA);

/** A janela do recorte metropolitano, na mesma caixa de 0 a 1 do mapa. */
const RECORTE_METROPOLITANO = { x: 0.678, y: 0.406, largura: 0.112, altura: 0.082 };

const CINZA_SEM_ENTREGA = "#e7e5e4";

/**
 * O caminho do contorno vem numa caixa de 0 a 1; o SVG desenha em pixels.
 *
 * Escalar aqui, e não guardar já escalado, mantém o dado independente do
 * tamanho do desenho — o recorte metropolitano usa a mesma string com outra
 * janela.
 */
function escalarCaminho(caminho: string, escala: number): string {
  return caminho.replace(/-?\d+(\.\d+)?/g, (numero) => (Number(numero) * escala).toFixed(1));
}
const COR_DA_CAPITAL = "#1c1917";

export function MapaDeSaoPaulo({
  pontos,
  visao,
  selecionado,
  onSelecionar,
}: {
  pontos: PontoNoMapa[];
  visao: Visao;
  selecionado: string | null;
  onSelecionar: (codigo: string | null) => void;
}) {
  const [sobre, setSobre] = useState<PontoNoMapa | null>(null);

  const maiorAlcance = useMemo(
    () => Math.max(...pontos.map((ponto) => ponto.alcance), 1),
    [pontos],
  );

  /**
   * O território de cada município, casado por índice.
   *
   * `MALHA_SP` sai na mesma ordem de `MUNICIPIOS_SP`, e os pontos também. Casar
   * por índice evita carregar o código do IBGE 645 vezes dentro do arquivo da
   * malha — que já é a maior parte do peso desta tela.
   */
  const territorios = useMemo(
    () => pontos.map((ponto, indice) => ({ ponto, contorno: MALHA_SP[indice] ?? [] })),
    [pontos],
  );

  const cor = (ponto: PontoNoMapa) => {
    if (visao === "prioridade") {
      // A capital não tem nota porque é a régua: o índice inteiro mede
      // distância até ela. Pintá-la de cinza de "sem dado" diria o contrário.
      if (ponto.ehCapital) return COR_DA_CAPITAL;
      return faixaDoIps(ponto.municipio.ips)?.cor ?? "#d6d3d1";
    }
    if (ponto.alcance === 0) return CINZA_SEM_ENTREGA;
    const intensidade = Math.sqrt(ponto.alcance / maiorAlcance);
    return `color-mix(in oklch, #0d9488 ${Math.round(30 + intensidade * 70)}%, #ccfbf1)`;
  };

  const emDestaque =
    sobre ?? pontos.find((ponto) => ponto.municipio.codigo === selecionado) ?? null;

  const desenhar = (escala: number, chave: string) =>
    territorios.map(({ ponto, contorno }) => {
      if (contorno.length < 3) return null;
      const estaSelecionado = ponto.municipio.codigo === selecionado;
      const sobDoMouse = sobre?.municipio.codigo === ponto.municipio.codigo;

      return (
        <path
          key={`${chave}-${ponto.municipio.codigo}`}
          d={`M${contorno.map(([x, y]) => `${(x * escala).toFixed(1)},${(y * escala).toFixed(1)}`).join("L")}Z`}
          fill={cor(ponto)}
          stroke={
            estaSelecionado || sobDoMouse ? "var(--color-foreground)" : "rgba(255,255,255,0.55)"
          }
          strokeWidth={estaSelecionado ? 2.4 : sobDoMouse ? 1.8 : 0.6}
          strokeLinejoin="round"
          className="cursor-pointer transition-[stroke-width]"
          onMouseEnter={() => setSobre(ponto)}
          onMouseLeave={() => setSobre(null)}
          onClick={() => onSelecionar(estaSelecionado ? null : ponto.municipio.codigo)}
        >
          <title>{ponto.municipio.nome}</title>
        </path>
      );
    });

  const capital = pontos.find((ponto) => ponto.ehCapital);

  return (
    <div className="relative">
      <div className="relative">
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          className="w-full"
          role="img"
          aria-label={`Mapa do estado de São Paulo com ${pontos.length} municípios em territórios, coloridos por ${visao === "prioridade" ? "prioridade" : "alcance da campanha"}.`}
        >
          {/* O recorte é o que dá ao mapa o formato do estado. Os territórios
              transbordam de propósito e o contorno apara — assim não sobra fio
              branco entre o último município e a borda. */}
          <defs>
            <clipPath id="contorno-do-estado" clipPathUnits="userSpaceOnUse">
              <path d={escalarCaminho(CONTORNO_SP, LARGURA)} />
            </clipPath>
          </defs>

          <g clipPath="url(#contorno-do-estado)">{desenhar(LARGURA, "estado")}</g>

          <path
            d={escalarCaminho(CONTORNO_SP, LARGURA)}
            fill="none"
            stroke="var(--color-foreground)"
            strokeWidth={1.6}
            strokeLinejoin="round"
            opacity={0.5}
            pointerEvents="none"
          />

          {/* A moldura do recorte, para quem olha saber de onde ele veio. */}
          <rect
            x={RECORTE_METROPOLITANO.x * LARGURA}
            y={RECORTE_METROPOLITANO.y * LARGURA}
            width={RECORTE_METROPOLITANO.largura * LARGURA}
            height={RECORTE_METROPOLITANO.altura * LARGURA}
            fill="none"
            stroke="var(--color-foreground)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            pointerEvents="none"
          />
        </svg>

        {emDestaque ? (
          <div className="pointer-events-none absolute left-3 top-3 max-w-[16rem] rounded-xl border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
            <p className="font-semibold">{emDestaque.municipio.nome}</p>
            {emDestaque.ehCapital ? (
              <p className="text-[10px] uppercase tracking-[0.1em] text-accent">
                referência do índice
              </p>
            ) : null}
            <dl className="mt-1.5 space-y-0.5 text-muted-foreground">
              {emDestaque.municipio.ips !== null ? (
                <Linha rotulo="IPS">
                  {emDestaque.municipio.ips} · {emDestaque.municipio.posicao}º
                </Linha>
              ) : null}
              {emDestaque.municipio.populacao ? (
                <Linha rotulo="População">{formatNumber(emDestaque.municipio.populacao)}</Linha>
              ) : null}
              {emDestaque.municipio.km !== null ? (
                <Linha rotulo="Da capital">{emDestaque.municipio.km} km</Linha>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-border pt-1">
                <dt>Alcançado</dt>
                <dd
                  className={cn(
                    "tabular-nums font-medium",
                    emDestaque.alcance > 0 ? "text-foreground" : "text-destructive",
                  )}
                >
                  {emDestaque.alcance > 0 ? formatCompact(emDestaque.alcance) : "ninguém"}
                </dd>
              </div>
              {emDestaque.investido > 0 ? (
                <Linha rotulo="Investido">{formatCurrency(emDestaque.investido)}</Linha>
              ) : null}
            </dl>
            <p className="mt-1.5 text-[10px] text-muted-foreground">clique para abrir o detalhe</p>
          </div>
        ) : null}

        {/* O recorte metropolitano, sobreposto no canto que fica vazio. */}
        <div className="absolute bottom-2 left-2 w-[38%] max-w-[19rem] rounded-xl border border-border bg-card/92 p-2 shadow-lg backdrop-blur sm:w-[32%]">
          <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Grande São Paulo
          </p>
          <svg
            viewBox={`${RECORTE_METROPOLITANO.x * LARGURA} ${RECORTE_METROPOLITANO.y * LARGURA} ${RECORTE_METROPOLITANO.largura * LARGURA} ${RECORTE_METROPOLITANO.altura * LARGURA}`}
            className="w-full"
            role="img"
            aria-label="Recorte ampliado da região metropolitana de São Paulo."
          >
            <g clipPath="url(#contorno-do-estado)">{desenhar(LARGURA, "metro")}</g>
            {capital ? (
              <circle
                cx={capital.x * LARGURA}
                cy={capital.y * LARGURA}
                r={2.4}
                fill="none"
                stroke="var(--color-background)"
                strokeWidth={1.4}
                pointerEvents="none"
              />
            ) : null}
          </svg>
        </div>
      </div>

      <Legenda visao={visao} />
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{rotulo}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function Legenda({ visao }: { visao: Visao }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
      {visao === "prioridade" ? (
        <>
          <span>Nota do IPS:</span>
          {[...FAIXAS_IPS].reverse().map((faixa) => (
            <Amostra key={faixa.rotulo} cor={faixa.cor}>
              {faixa.rotulo}
            </Amostra>
          ))}
          <Amostra cor={COR_DA_CAPITAL}>capital</Amostra>
        </>
      ) : (
        <>
          <span>Pessoas alcançadas:</span>
          <Amostra cor={CINZA_SEM_ENTREGA}>nenhuma</Amostra>
          <Amostra cor="color-mix(in oklch, #0d9488 55%, #ccfbf1)">algumas</Amostra>
          <Amostra cor="#0d9488">muitas</Amostra>
        </>
      )}
      <span className="ml-auto">Territórios aproximados pela sede — não são divisas oficiais.</span>
    </div>
  );
}

function Amostra({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: cor }} />
      {children}
    </span>
  );
}
