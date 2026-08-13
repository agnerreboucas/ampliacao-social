import type { AudienceInsight, Boost, InboxItem, RelacaoPessoa } from "./types";

/**
 * Perfil do público: quem é, onde está, e como se comporta.
 *
 * **Este é o módulo onde mais importa dizer de onde cada número veio**, porque
 * é o que mais parece saber coisas que ninguém sabe. Um painel que exibe "42%
 * do seu público é de Recife" com a mesma tipografia de "alcance: 12.000"
 * sugere que os dois têm o mesmo lastro. Não têm.
 *
 * As três origens, e o que cada uma pode dizer:
 *
 * **Segmentação de anúncio.** Quando uma publicação é impulsionada para uma
 * cidade, o alcance pago daquela peça foi entregue naquela cidade — está no
 * contrato do anúncio. É o dado mais firme que existe aqui, e o único que
 * permite dizer "chegamos a tantas pessoas nesta cidade" sem hipótese no meio.
 *
 * **Perfil da rede.** Instagram e Facebook expõem a distribuição por cidade dos
 * seguidores, em agregado e só acima de cem seguidores. É estimativa deles,
 * sobre seguidores — não sobre quem foi alcançado —, e a Meta vem reduzindo o
 * que devolve.
 *
 * **Leitura manual.** Alguém abriu o painel da rede, leu e digitou. Vale o que
 * vale: é uma fotografia de um dia.
 *
 * O que **não** existe, e por isso não é oferecido: a cidade de quem comentou.
 * Nenhuma rede entrega a localização de uma pessoa que interagiu — nem
 * deveria. Cruzar assunto com cidade a partir de comentários seria inventar, e
 * inventar num painel eleitoral é como uma decisão errada nasce.
 *
 * Módulo puro.
 */

export type OrigemDoDado = "segmentacao" | "perfil_da_rede" | "leitura_manual";

export const EXPLICACAO_DA_ORIGEM: Record<OrigemDoDado, string> = {
  segmentacao:
    "Veio da segmentação dos anúncios: o alcance pago desta peça foi contratado para esta cidade.",
  perfil_da_rede:
    "Veio do perfil de público da rede, que é uma estimativa agregada sobre seguidores — não sobre quem foi alcançado.",
  leitura_manual: "Foi digitado à mão a partir do painel da rede.",
};

export type CidadeAlcancada = {
  cidade: string;
  /** Pessoas alcançadas com origem em segmentação de anúncio. */
  alcancePago: number;
  /** Fatia estimada dos seguidores, de 0 a 1. Vem do perfil da rede. */
  fatiaDeSeguidores: number;
  /** Seguidores estimados na cidade, quando há total de seguidores. */
  seguidoresEstimados: number;
  investido: number;
  /** As publicações que foram entregues nesta cidade, por impulsionamento. */
  publicacoes: { postId: string; boostId: string; alcance: number; investido: number }[];
  origens: OrigemDoDado[];
};

/** Tira "(+10 km)" e espaços de sobra para o mesmo lugar não virar duas linhas. */
export function normalizarCidade(bruto: string): string {
  return bruto
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Consolida as cidades a partir das duas fontes que existem.
 *
 * A ordenação é por alcance pago, e não pela fatia de seguidores, de propósito:
 * alcance pago é gente que a campanha realmente atingiu, e fatia de seguidores
 * é estimativa da rede. Ordenar pela estimativa colocaria o palpite na frente
 * do fato.
 */
export function cidadesAlcancadas(
  impulsionamentos: Boost[],
  perfis: AudienceInsight[],
  seguidoresTotais: number,
): CidadeAlcancada[] {
  const porCidade = new Map<string, CidadeAlcancada>();

  const obter = (cidade: string): CidadeAlcancada => {
    const existente = porCidade.get(cidade);
    if (existente) return existente;
    const nova: CidadeAlcancada = {
      cidade,
      alcancePago: 0,
      fatiaDeSeguidores: 0,
      seguidoresEstimados: 0,
      investido: 0,
      publicacoes: [],
      origens: [],
    };
    porCidade.set(cidade, nova);
    return nova;
  };

  for (const boost of impulsionamentos) {
    const cidades = boost.audience.locations.map(normalizarCidade).filter(Boolean);
    if (cidades.length === 0) continue;

    // O alcance é dividido igualmente entre as cidades segmentadas. A rede não
    // devolve a quebra por cidade dentro de uma campanha, e assumir divisão
    // igual é a única hipótese que não favorece nenhuma cidade — mas é
    // hipótese, e por isso a tela mostra "estimado" quando há mais de uma.
    const fatia = 1 / cidades.length;

    for (const cidade of cidades) {
      const registro = obter(cidade);
      registro.alcancePago += boost.results.reach * fatia;
      registro.investido += boost.results.spend * fatia;
      registro.publicacoes.push({
        postId: boost.postId,
        boostId: boost.id,
        alcance: Math.round(boost.results.reach * fatia),
        investido: boost.results.spend * fatia,
      });
      if (!registro.origens.includes("segmentacao")) registro.origens.push("segmentacao");
    }
  }

  // O perfil da rede vem por conta; a fatia de cada cidade é a média das contas
  // que reportam aquela cidade.
  const fatiasPorCidade = new Map<string, number[]>();
  for (const perfil of perfis) {
    if (!perfil.available) continue;
    for (const item of perfil.topCities) {
      const cidade = normalizarCidade(item.city);
      // `share` vem em porcentagem (38 significa 38%); aqui tudo trabalha em
      // fração de 0 a 1. A conversão acontece neste único ponto — foi
      // esquecê-la que fez a tela anunciar "3.800% dos seguidores".
      fatiasPorCidade.set(cidade, [...(fatiasPorCidade.get(cidade) ?? []), item.share / 100]);
    }
  }

  for (const [cidade, fatias] of fatiasPorCidade.entries()) {
    const registro = obter(cidade);
    registro.fatiaDeSeguidores = fatias.reduce((soma, item) => soma + item, 0) / fatias.length;
    registro.seguidoresEstimados = Math.round(registro.fatiaDeSeguidores * seguidoresTotais);
    if (!registro.origens.includes("perfil_da_rede")) registro.origens.push("perfil_da_rede");
  }

  return [...porCidade.values()]
    .map((cidade) => ({
      ...cidade,
      alcancePago: Math.round(cidade.alcancePago),
      investido: Math.round(cidade.investido * 100) / 100,
    }))
    .sort((a, b) => b.alcancePago - a.alcancePago || b.fatiaDeSeguidores - a.fatiaDeSeguidores);
}

export type PerfilDoPublico = {
  /** Quantas pessoas distintas já interagiram. */
  pessoas: number;
  porRelacao: { relacao: RelacaoPessoa; pessoas: number; interacoes: number }[];
  /** Quem mais interage, com o quanto. */
  maisAtivas: {
    handle: string;
    nome: string;
    interacoes: number;
    relacao: RelacaoPessoa;
    ultimaEm: string;
    avatarGradient: string;
  }[];
  /** Interações por hora do dia, somando todas as pessoas. */
  porHora: { hora: number; interacoes: number }[];
  /** A hora com mais interações, ou `null` sem base. */
  horaDePico: number | null;
  /** Média de interações por pessoa — separa base fiel de base larga. */
  interacoesPorPessoa: number;
};

export const ORDEM_DA_RELACAO: RelacaoPessoa[] = [
  "defensor",
  "apoiador",
  "seguidor",
  "nao_seguidor",
];

export const ROTULO_DA_RELACAO: Record<RelacaoPessoa, string> = {
  defensor: "Defensores",
  apoiador: "Apoiadores",
  seguidor: "Seguidores",
  nao_seguidor: "Não seguidores",
};

/**
 * O perfil de quem interage, montado da caixa de entrada.
 *
 * É o retrato mais honesto que a plataforma consegue do público: não é "quem
 * são seus seguidores", é "quem fala com você". Os dois se sobrepõem bastante,
 * mas não são a mesma coisa, e a tela diz isso.
 *
 * A hora vem de quando a interação chegou, que é quando a pessoa estava ali.
 */
export function perfilDoPublico(inbox: InboxItem[]): PerfilDoPublico {
  const porPessoa = new Map<string, InboxItem[]>();
  for (const item of inbox) {
    porPessoa.set(item.authorHandle, [...(porPessoa.get(item.authorHandle) ?? []), item]);
  }

  const porRelacao = ORDEM_DA_RELACAO.map((relacao) => {
    const pessoas = [...porPessoa.values()].filter(
      (itens) => itens[itens.length - 1].relacao === relacao,
    );
    return {
      relacao,
      pessoas: pessoas.length,
      interacoes: pessoas.reduce((soma, itens) => soma + itens.length, 0),
    };
  }).filter((linha) => linha.pessoas > 0);

  const maisAtivas = [...porPessoa.entries()]
    .map(([handle, itens]) => {
      const recente = itens.reduce((maisNova, item) =>
        item.receivedAt > maisNova.receivedAt ? item : maisNova,
      );
      return {
        handle,
        nome: recente.authorName,
        // `interacoes` do item é a contagem histórica da pessoa; sem ela, o
        // total do período serve.
        interacoes: Math.max(recente.interacoes, itens.length),
        relacao: recente.relacao,
        ultimaEm: recente.receivedAt,
        avatarGradient: recente.avatarGradient,
      };
    })
    .sort((a, b) => b.interacoes - a.interacoes)
    .slice(0, 12);

  const porHora = Array.from({ length: 24 }, (_, hora) => ({
    hora,
    interacoes: inbox.filter((item) => new Date(item.receivedAt).getHours() === hora).length,
  }));

  const pico = porHora.reduce((maior, atual) =>
    atual.interacoes > maior.interacoes ? atual : maior,
  );

  return {
    pessoas: porPessoa.size,
    porRelacao,
    maisAtivas,
    porHora,
    horaDePico: pico.interacoes > 0 ? pico.hora : null,
    interacoesPorPessoa: porPessoa.size > 0 ? inbox.length / porPessoa.size : 0,
  };
}
