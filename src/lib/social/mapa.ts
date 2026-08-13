import {
  CODIGO_DA_CAPITAL,
  MUNICIPIOS_SP,
  acharMunicipio,
  type Municipio,
} from "./municipios-sp.ts";
import type { Boost } from "./types";

/**
 * O mapa do estado de São Paulo, e o que a campanha alcançou nele.
 *
 * Responde a pergunta que uma lista de cidades responde mal: **onde a campanha
 * está chegando, e onde não está.** Um ranking mostra as cidades que foram
 * atingidas; um mapa mostra também os vazios — e o vazio é a informação que
 * leva a mudar a segmentação.
 *
 * Duas decisões:
 *
 * **A projeção é a mais simples possível**, com correção de longitude pelo
 * cosseno da latitude. São Paulo cabe em cerca de 6° de latitude; nessa escala
 * a diferença para uma projeção cartográfica de verdade é de poucos pixels, e
 * uma biblioteca de mapas custaria centenas de quilobytes para corrigir o que
 * ninguém enxerga.
 *
 * **Alcance é comparado com prioridade, não sozinho.** Alcançar 100 mil pessoas
 * não diz nada até se saber se foram nas cidades que importam para a campanha.
 * Por isso a cobertura é medida sobre os municípios de maior IPS, e não sobre
 * os 645 — chegar em todos seria caro e não é o objetivo.
 *
 * Módulo puro.
 */

export type PontoNoMapa = {
  municipio: Municipio;
  /** Coordenada dentro da caixa de desenho, de 0 a 1. */
  x: number;
  y: number;
  /** Pessoas alcançadas por anúncio segmentado para este município. */
  alcance: number;
  investido: number;
  /** Publicações entregues aqui. */
  publicacoes: string[];
  ehCapital: boolean;
};

/** Os limites do estado, calculados uma vez a partir dos próprios municípios. */
function limites() {
  const lats = MUNICIPIOS_SP.map((m) => m.lat);
  const lons = MUNICIPIOS_SP.map((m) => m.lon);
  return {
    latMin: Math.min(...lats),
    latMax: Math.max(...lats),
    lonMin: Math.min(...lons),
    lonMax: Math.max(...lons),
  };
}

const LIMITES = limites();

const ESCALA_LON = Math.cos(((LIMITES.latMin + LIMITES.latMax) / 2) * (Math.PI / 180));
const LARGURA_GRAUS = (LIMITES.lonMax - LIMITES.lonMin) * ESCALA_LON;
const ALTURA_GRAUS = LIMITES.latMax - LIMITES.latMin;

/**
 * Quanto o estado é mais alto que largo.
 *
 * São Paulo é deitado — cerca de dois terços de altura para uma largura. Quem
 * desenha usa isto para dimensionar a caixa: forçar um quadrado deixaria uma
 * faixa morta em cima e outra embaixo, e faixa morta em tela de análise é
 * espaço que o mapa perde para nada.
 */
export const PROPORCAO_DO_MAPA = ALTURA_GRAUS / LARGURA_GRAUS;

/**
 * Projeta latitude e longitude numa caixa de largura 1 e altura
 * `PROPORCAO_DO_MAPA`.
 *
 * A correção pelo cosseno da latitude central existe porque um grau de
 * longitude é mais curto que um de latitude fora do equador — sem ela, o estado
 * sai esticado na horizontal e ninguém reconhece o formato.
 */
export function projetar(lat: number, lon: number): { x: number; y: number } {
  return {
    x: ((lon - LIMITES.lonMin) * ESCALA_LON) / LARGURA_GRAUS,
    // A latitude cresce para o norte e o eixo Y da tela cresce para baixo.
    y: (LIMITES.latMax - lat) / LARGURA_GRAUS,
  };
}

/**
 * Monta os pontos do mapa, cruzando os municípios com o que a campanha entregou.
 *
 * O alcance vem da segmentação dos impulsionamentos — é o dado firme, porque
 * está no contrato do anúncio. Município não segmentado aparece com alcance
 * zero, e é assim que o vazio fica visível.
 */
export function montarMapa(impulsionamentos: Boost[]): PontoNoMapa[] {
  const alcancePorCodigo = new Map<
    string,
    { alcance: number; investido: number; posts: Set<string> }
  >();

  for (const boost of impulsionamentos) {
    const encontrados = boost.audience.locations
      .map((local) => acharMunicipio(local))
      .filter((municipio): municipio is Municipio => municipio !== null);

    if (encontrados.length === 0) continue;
    const fatia = 1 / encontrados.length;

    for (const municipio of encontrados) {
      const atual = alcancePorCodigo.get(municipio.codigo) ?? {
        alcance: 0,
        investido: 0,
        posts: new Set<string>(),
      };
      atual.alcance += boost.results.reach * fatia;
      atual.investido += boost.results.spend * fatia;
      atual.posts.add(boost.postId);
      alcancePorCodigo.set(municipio.codigo, atual);
    }
  }

  return MUNICIPIOS_SP.map((municipio) => {
    const entregue = alcancePorCodigo.get(municipio.codigo);
    return {
      municipio,
      ...projetar(municipio.lat, municipio.lon),
      alcance: Math.round(entregue?.alcance ?? 0),
      investido: Math.round((entregue?.investido ?? 0) * 100) / 100,
      publicacoes: [...(entregue?.posts ?? [])],
      ehCapital: municipio.codigo === CODIGO_DA_CAPITAL,
    };
  });
}

export type Cobertura = {
  /** Quantos dos municípios prioritários receberam alguma entrega. */
  alcancados: number;
  total: number;
  /** Fatia de 0 a 1. */
  fatia: number;
  /** População somada dos prioritários que a campanha alcançou. */
  populacaoAlcancada: number;
  populacaoTotal: number;
  /** Os prioritários ainda sem entrega, do mais importante para o menos. */
  faltando: Municipio[];
};

/**
 * Quanto da prioridade a campanha cobriu.
 *
 * `quantos` recorta o topo do ranking do IPS. O padrão é 50 porque é uma lista
 * que uma pessoa consegue olhar inteira — e porque cobrir os 600 não é meta de
 * campanha nenhuma.
 */
export function medirCobertura(pontos: PontoNoMapa[], quantos = 50): Cobertura {
  const prioritarios = pontos
    .filter((ponto) => ponto.municipio.posicao !== null)
    .sort((a, b) => (a.municipio.posicao ?? 0) - (b.municipio.posicao ?? 0))
    .slice(0, quantos);

  const alcancados = prioritarios.filter((ponto) => ponto.alcance > 0);

  return {
    alcancados: alcancados.length,
    total: prioritarios.length,
    fatia: prioritarios.length > 0 ? alcancados.length / prioritarios.length : 0,
    populacaoAlcancada: alcancados.reduce(
      (soma, ponto) => soma + (ponto.municipio.populacao ?? 0),
      0,
    ),
    populacaoTotal: prioritarios.reduce(
      (soma, ponto) => soma + (ponto.municipio.populacao ?? 0),
      0,
    ),
    faltando: prioritarios.filter((ponto) => ponto.alcance === 0).map((ponto) => ponto.municipio),
  };
}

/** Faixas do IPS, para colorir o mapa em degraus legíveis. */
export const FAIXAS_IPS = [
  { ate: 100, rotulo: "70 a 80", cor: "#7f1d1d" },
  { ate: 70, rotulo: "60 a 70", cor: "#b91c1c" },
  { ate: 60, rotulo: "50 a 60", cor: "#ea580c" },
  { ate: 50, rotulo: "40 a 50", cor: "#f59e0b" },
  { ate: 40, rotulo: "abaixo de 40", cor: "#fcd34d" },
] as const;

export function faixaDoIps(ips: number | null): (typeof FAIXAS_IPS)[number] | null {
  if (ips === null) return null;
  // Da faixa mais alta para a mais baixa; a primeira que couber vence.
  return [...FAIXAS_IPS].reverse().find((faixa) => ips < faixa.ate) ?? FAIXAS_IPS[0];
}
