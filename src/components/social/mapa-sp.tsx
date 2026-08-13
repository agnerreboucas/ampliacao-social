import { useMemo, useState } from "react";

import { FAIXAS_IPS, PROPORCAO_DO_MAPA, faixaDoIps, type PontoNoMapa } from "@/lib/social/mapa";
import { formatCompact, formatCurrency, formatNumber } from "@/lib/social/format";
import { cn } from "@/lib/utils";

/**
 * O estado de São Paulo desenhado a partir das coordenadas reais dos 645
 * municípios.
 *
 * Não é uma imagem nem uma biblioteca de mapas: é um SVG com um círculo por
 * município, posicionado pela latitude e longitude que vieram da matriz do IPS.
 * O formato do estado aparece sozinho, pela distribuição das cidades — e o
 * arquivo continua cabendo na demonstração que roda sem servidor.
 *
 * Duas visões, porque são duas perguntas diferentes:
 *
 * **Prioridade** colore pelo IPS e responde "onde eu deveria estar".
 * **Alcance** colore pelo que a campanha entregou e responde "onde eu estou".
 *
 * Olhar as duas em sequência é o que mostra o buraco: cidade escura no mapa de
 * prioridade e apagada no de alcance é orçamento que não foi para onde
 * deveria.
 */

export type Visao = "prioridade" | "alcance";

const LARGURA = 1000;
const ALTURA = Math.round(LARGURA * PROPORCAO_DO_MAPA);

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
  const maiorPopulacao = useMemo(
    () => Math.max(...pontos.map((ponto) => ponto.municipio.populacao ?? 0), 1),
    [pontos],
  );

  /**
   * O raio vem da população, em raiz quadrada.
   *
   * Área proporcional à população, e não o raio — proporcional no raio faria a
   * capital, com 11 milhões, cobrir metade do estado e esconder a região
   * metropolitana inteira embaixo dela.
   */
  const raio = (ponto: PontoNoMapa) => {
    const populacao = ponto.municipio.populacao ?? 0;
    if (ponto.ehCapital) return 16;
    return 3 + Math.sqrt(populacao / maiorPopulacao) * 13;
  };

  const cor = (ponto: PontoNoMapa) => {
    if (visao === "prioridade") {
      // A capital não tem nota porque é a régua: todo o índice mede distância
      // até ela. Pintá-la de cinza de "sem dado" seria dizer o contrário.
      if (ponto.ehCapital) return "#1c1917";
      return faixaDoIps(ponto.municipio.ips)?.cor ?? "#d6d3d1";
    }
    if (ponto.alcance === 0) return "#e7e5e4";
    // Uma escala só de intensidade: aqui a pergunta é "quanto", não "qual tipo".
    const intensidade = Math.sqrt(ponto.alcance / maiorAlcance);
    return `color-mix(in oklch, #0d9488 ${Math.round(35 + intensidade * 65)}%, #ccfbf1)`;
  };

  /**
   * Na visão de alcance, quem recebeu entrega ganha um halo.
   *
   * Sem ele a tela mente por omissão: seiscentos pontos cinzas afogam os nove
   * que têm cor, e a campanha parece não ter chegado a lugar nenhum. O halo
   * separa o que existe do fundo sem precisar aumentar o ponto — o tamanho já
   * está dizendo outra coisa, que é a população.
   */
  const entregou = (ponto: PontoNoMapa) => visao === "alcance" && ponto.alcance > 0;

  const emDestaque =
    sobre ?? pontos.find((ponto) => ponto.municipio.codigo === selecionado) ?? null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full"
        role="img"
        aria-label={`Mapa do estado de São Paulo com ${pontos.length} municípios, coloridos por ${visao === "prioridade" ? "prioridade" : "alcance da campanha"}.`}
      >
        {/* Os menores primeiro: assim uma cidade grande nunca esconde uma
            pequena que o usuário está tentando clicar. */}
        {[...pontos]
          .sort((a, b) => raio(b) - raio(a))
          .map((ponto) => {
            const estaSelecionado = ponto.municipio.codigo === selecionado;
            const comEntrega = entregou(ponto);
            return (
              <g key={ponto.municipio.codigo}>
                {comEntrega ? (
                  <circle
                    cx={ponto.x * LARGURA}
                    cy={ponto.y * LARGURA}
                    r={raio(ponto) + 5}
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth={1.4}
                    opacity={0.55}
                    pointerEvents="none"
                  />
                ) : null}
                <circle
                  cx={ponto.x * LARGURA}
                  cy={ponto.y * LARGURA}
                  r={raio(ponto)}
                  fill={cor(ponto)}
                  stroke={
                    estaSelecionado
                      ? "var(--color-foreground)"
                      : comEntrega
                        ? "#0f766e"
                        : "rgba(0,0,0,0.18)"
                  }
                  strokeWidth={estaSelecionado ? 3 : comEntrega ? 1.2 : 0.7}
                  opacity={visao === "alcance" && ponto.alcance === 0 ? 0.45 : 0.92}
                  className="cursor-pointer transition-[stroke-width]"
                  onMouseEnter={() => setSobre(ponto)}
                  onMouseLeave={() => setSobre(null)}
                  onClick={() => onSelecionar(estaSelecionado ? null : ponto.municipio.codigo)}
                >
                  <title>{ponto.municipio.nome}</title>
                </circle>
              </g>
            );
          })}

        {/* A capital ganha um anel: ela é a referência do índice, não um item
            dele, e sem marca some no meio da região metropolitana. */}
        {pontos
          .filter((ponto) => ponto.ehCapital)
          .map((ponto) => (
            <circle
              key="capital"
              cx={ponto.x * LARGURA}
              cy={ponto.y * LARGURA}
              r={26}
              fill="none"
              stroke="var(--color-foreground)"
              strokeWidth={2}
              strokeDasharray="4 4"
              pointerEvents="none"
            />
          ))}
      </svg>

      {emDestaque ? (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[15rem] rounded-xl border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
          <p className="font-semibold">{emDestaque.municipio.nome}</p>
          {emDestaque.ehCapital ? (
            <p className="text-[10px] uppercase tracking-[0.1em] text-accent">
              referência do índice
            </p>
          ) : null}
          <dl className="mt-1.5 space-y-0.5 text-muted-foreground">
            {emDestaque.municipio.ips !== null ? (
              <div className="flex justify-between gap-3">
                <dt>IPS</dt>
                <dd className="tabular-nums text-foreground">
                  {emDestaque.municipio.ips} · {emDestaque.municipio.posicao}º
                </dd>
              </div>
            ) : null}
            {emDestaque.municipio.populacao ? (
              <div className="flex justify-between gap-3">
                <dt>População</dt>
                <dd className="tabular-nums">{formatNumber(emDestaque.municipio.populacao)}</dd>
              </div>
            ) : null}
            {emDestaque.municipio.km !== null ? (
              <div className="flex justify-between gap-3">
                <dt>Da capital</dt>
                <dd className="tabular-nums">{emDestaque.municipio.km} km</dd>
              </div>
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
              <div className="flex justify-between gap-3">
                <dt>Investido</dt>
                <dd className="tabular-nums">{formatCurrency(emDestaque.investido)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      <Legenda visao={visao} />
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
            <span key={faixa.rotulo} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: faixa.cor }}
              />
              {faixa.rotulo}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-[#1c1917]" />
            capital
          </span>
        </>
      ) : (
        <>
          <span>Pessoas alcançadas:</span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-[#e7e5e4]" />
            nenhuma
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: "color-mix(in oklch, #0d9488 45%, #e7e5e4)" }}
            />
            algumas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-[#0d9488]" />
            muitas
          </span>
        </>
      )}
      <span className="ml-auto">O tamanho do círculo é a população.</span>
    </div>
  );
}
