import type { InboxItem, NetworkId, Post, PostFormat, SocialAccount } from "./types";

/**
 * O caminho de volta: do comentário até a peça que o provocou.
 *
 * Ler uma reclamação sem saber o que a causou leva a responder a reclamação. Ler
 * a mesma frase sabendo que veio de um vídeo publicado numa terça às 19h, que
 * teve dez vezes mais comentários que a média, leva a mudar o conteúdo — que é a
 * decisão que interessa.
 *
 * Duas decisões que este módulo toma:
 *
 * **A peça pode não existir.** Interação importada, publicação apagada na rede,
 * comentário em anúncio que não virou post: nesses casos `postId` aponta para o
 * vazio. A resposta é `null` e a tela diz que a origem não foi encontrada —
 * inventar um placeholder faria a pessoa procurar uma peça que não existe.
 *
 * **O resumo é fechado, não é o post inteiro.** Quem lê a conversa precisa de
 * formato, dia e tamanho da repercussão. Mandar o objeto inteiro para o
 * navegador traria rascunho, aprovador e motivo de falha para uma tela que não
 * tem o que fazer com isso.
 *
 * Módulo puro.
 */

/** O que a tela de relacionamento mostra sobre a peça de origem. */
export type PecaDeOrigem = {
  id: string;
  formato: PostFormat;
  /** Começo da legenda, para reconhecer a peça sem abri-la. */
  trecho: string;
  publicadoEm: string | null;
  redes: NetworkId[];
  coverGradient: string;
  /** Nulo enquanto a publicação não tiver números da rede. */
  metricas: { alcance: number; curtidas: number; comentarios: number } | null;
};

const LIMITE_DO_TRECHO = 90;

/**
 * Corta a legenda numa palavra inteira.
 *
 * Cortar no meio da palavra economiza dois caracteres e custa a leitura; o
 * limite existe para caber numa linha, não para ser exato.
 */
export function trechoDaLegenda(legenda: string, limite = LIMITE_DO_TRECHO): string {
  const limpa = legenda.replace(/\s+/g, " ").trim();
  if (limpa.length <= limite) return limpa;

  const cortada = limpa.slice(0, limite);
  const ultimoEspaco = cortada.lastIndexOf(" ");
  return `${(ultimoEspaco > limite * 0.6 ? cortada.slice(0, ultimoEspaco) : cortada).trimEnd()}…`;
}

/** Resume uma publicação no que a tela de conversa precisa saber dela. */
export function resumirPeca(post: Post, contas: SocialAccount[]): PecaDeOrigem {
  const porId = new Map(contas.map((conta) => [conta.id, conta]));
  const redes = [...new Set(post.accountIds.map((id) => porId.get(id)?.networkId))].filter(
    (rede): rede is NetworkId => rede !== undefined,
  );

  return {
    id: post.id,
    formato: post.format,
    trecho: trechoDaLegenda(post.caption),
    publicadoEm: post.publishedAt,
    redes,
    coverGradient: post.coverGradient,
    metricas: post.metrics
      ? {
          alcance: post.metrics.reach,
          curtidas: post.metrics.likes,
          comentarios: post.metrics.comments,
        }
      : null,
  };
}

/**
 * Liga cada conversa à peça que a originou.
 *
 * Devolve um índice por `postId` e não por interação: várias conversas nascem da
 * mesma publicação, e repetir o mesmo resumo em cada uma engorda a resposta sem
 * acrescentar nada.
 */
export function indexarOrigens(
  interacoes: InboxItem[],
  posts: Post[],
  contas: SocialAccount[],
): Record<string, PecaDeOrigem> {
  const procurados = new Set(
    interacoes.map((item) => item.postId).filter((id): id is string => id !== null),
  );

  const indice: Record<string, PecaDeOrigem> = {};
  for (const post of posts) {
    if (procurados.has(post.id)) indice[post.id] = resumirPeca(post, contas);
  }
  return indice;
}

/**
 * Quantas conversas cada publicação gerou.
 *
 * É o número que transforma o rastreio em decisão: uma peça com vinte
 * comentários e outra com um não pedem a mesma coisa de quem produz conteúdo.
 */
export function conversasPorPeca(interacoes: InboxItem[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const item of interacoes) {
    if (item.postId === null) continue;
    contagem[item.postId] = (contagem[item.postId] ?? 0) + 1;
  }
  return contagem;
}

const NOME_DO_FORMATO: Record<PostFormat, string> = {
  a_definir: "formato a definir",
  imagem: "imagem",
  carrossel: "carrossel",
  video: "vídeo",
  story: "story",
};

/** O formato escrito como a pessoa fala. */
export function nomeDoFormato(formato: PostFormat): string {
  return NOME_DO_FORMATO[formato];
}

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/**
 * "quinta-feira, 7 de agosto, 19h" — o dia como quem lembra dele.
 *
 * O dia da semana entra porque é o que a pessoa da campanha usa para lembrar
 * ("aquele vídeo de quinta"); a data sozinha exige uma conversão mental que
 * ninguém faz de graça.
 */
export function diaPorExtenso(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;

  const mes = data.toLocaleDateString("pt-BR", { month: "long" });
  const hora = data.getHours();
  const minuto = data.getMinutes();
  const relogio = minuto === 0 ? `${hora}h` : `${hora}h${String(minuto).padStart(2, "0")}`;

  return `${DIAS[data.getDay()]}, ${data.getDate()} de ${mes}, ${relogio}`;
}
