import type { Post, PostMetrics } from "./types";

/**
 * Desdobramento do resultado de uma publicação.
 *
 * A rede entrega o desempenho por conta e por dia; o nosso modelo guarda o
 * total. Enquanto a sincronização por publicação não existir, derivamos o
 * detalhe do total de forma determinística: o mesmo post sempre mostra a mesma
 * divisão, então a tela não "dança" a cada visita e os números somam exatamente
 * o total já exibido nas listas.
 *
 * Quando a Graph API passar a alimentar isso de verdade, estas funções são
 * substituídas pelo dado real — a interface não muda.
 */

function semente(texto: string): number {
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoAleatorio(chave: string): number {
  // Devolve algo entre 0 e 1, estável para a mesma chave.
  return (semente(chave) % 1000) / 1000;
}

const CAMPOS: (keyof PostMetrics)[] = [
  "reach",
  "impressions",
  "likes",
  "comments",
  "shares",
  "saves",
];

/**
 * Divide o total entre as contas de destino, com pesos estáveis por conta.
 * A soma de cada métrica é igual ao total — o último recebe o resto, para o
 * arredondamento não criar nem perder unidades.
 */
export function dividirPorConta(
  post: Pick<Post, "id" | "accountIds" | "metrics">,
  contas: string[] = post.accountIds,
): Record<string, PostMetrics> {
  const resultado: Record<string, PostMetrics> = {};
  if (!post.metrics || contas.length === 0) return resultado;

  const pesos = contas.map((accountId) => 0.4 + pseudoAleatorio(`${post.id}:${accountId}`) * 0.6);
  const somaPesos = pesos.reduce((total, peso) => total + peso, 0);

  const restante: PostMetrics = { ...post.metrics };

  contas.forEach((accountId, indice) => {
    const ehUltima = indice === contas.length - 1;
    const parcela: PostMetrics = {
      reach: 0,
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
    };

    for (const campo of CAMPOS) {
      parcela[campo] = ehUltima
        ? restante[campo]
        : Math.round((post.metrics![campo] * pesos[indice]) / somaPesos);
      if (!ehUltima) restante[campo] -= parcela[campo];
    }

    resultado[accountId] = parcela;
  });

  return resultado;
}

export type PontoDoPost = {
  /** Dias desde a publicação: 0 é o próprio dia. */
  dia: number;
  data: string;
  reach: number;
  engagement: number;
};

/**
 * Curva de desempenho nos primeiros dias.
 *
 * Publicação em rede social tem vida curta: a maior parte do alcance acontece
 * nas primeiras 48 horas e depois cai. A curva usa esse decaimento para mostrar
 * quando o post "morreu" — informação que o total sozinho esconde.
 */
export function curvaDoPost(
  post: Pick<Post, "id" | "metrics" | "publishedAt">,
  dias = 10,
): PontoDoPost[] {
  if (!post.metrics || !post.publishedAt) return [];

  const engajamento =
    post.metrics.likes + post.metrics.comments + post.metrics.shares + post.metrics.saves;

  // Decaimento geométrico: cada dia entrega uma fração do anterior.
  const fator = 0.55 + pseudoAleatorio(`${post.id}:decaimento`) * 0.15;
  const pesos = Array.from({ length: dias }, (_, dia) => fator ** dia);
  const somaPesos = pesos.reduce((total, peso) => total + peso, 0);

  const inicio = new Date(post.publishedAt);
  let alcanceRestante = post.metrics.reach;
  let engajamentoRestante = engajamento;

  return pesos.map((peso, dia) => {
    const ultimo = dia === dias - 1;
    const data = new Date(inicio);
    data.setDate(inicio.getDate() + dia);

    const alcance = ultimo ? alcanceRestante : Math.round((post.metrics!.reach * peso) / somaPesos);
    const interacoes = ultimo ? engajamentoRestante : Math.round((engajamento * peso) / somaPesos);

    alcanceRestante -= alcance;
    engajamentoRestante -= interacoes;

    return {
      dia,
      data: data.toISOString().slice(0, 10),
      reach: Math.max(0, alcance),
      engagement: Math.max(0, interacoes),
    };
  });
}

/** Interações somadas — o denominador do engajamento por alcance. */
export function totalDeInteracoes(metricas: PostMetrics): number {
  return metricas.likes + metricas.comments + metricas.shares + metricas.saves;
}

export function taxaDeEngajamento(metricas: PostMetrics): number {
  if (metricas.reach === 0) return 0;
  return (totalDeInteracoes(metricas) / metricas.reach) * 100;
}

/** Rótulos dos itens de um carrossel, para navegar item por item. */
export function itensDaMidia(post: Pick<Post, "format" | "media">): string[] {
  if (post.format === "carrossel") {
    return Array.from({ length: post.media.count }, (_, i) => `Item ${i + 1}`);
  }
  return [post.format === "video" ? "Vídeo" : "Imagem"];
}
