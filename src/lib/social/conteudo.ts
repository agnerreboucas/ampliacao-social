import { FORMATOS_DE_FEED } from "./types.ts";
import { FUSO_DA_CAMPANHA, paredeNaZona } from "./fuso.ts";
import type { InboxItem, Post, PostFormat } from "./types";

/**
 * Análise do conteúdo publicado.
 *
 * Responde três perguntas que o painel de números não responde: **o que rendeu,
 * o que não rendeu, e o que os dois têm em comum.** Alcance total diz que a
 * semana foi boa; isto diz qual peça puxou, e se foi o formato, o assunto, o
 * dia ou a hora.
 *
 * A decisão que governa o módulo: **todo agrupamento declara o tamanho da
 * amostra.** "Vídeo rende 3× mais" sobre duas peças não é achado, é acaso — e
 * a diferença entre os dois só aparece se o número de peças estiver escrito ao
 * lado. Por isso nenhuma função aqui devolve uma média sozinha; devolve a média
 * com quantas peças a sustentam, e quem consome decide se olha.
 *
 * Sobre assuntos: eles saem das hashtags e de palavras-chave da legenda, que é
 * o que a plataforma tem. Nenhuma rede social diz "este post é sobre saúde" —
 * quem diz é quem escreveu a legenda. Assunto inferido de legenda vazia não
 * existe, e a peça entra em "sem assunto" em vez de num balde inventado.
 *
 * Módulo puro.
 */

export type DesempenhoDoGrupo = {
  chave: string;
  rotulo: string;
  /** Quantas publicações sustentam este grupo. */
  pecas: number;
  alcanceMedio: number;
  alcanceTotal: number;
  interacoesMedias: number;
  /** Interações sobre alcance, em porcentagem. */
  taxa: number;
  /** Quanto acima ou abaixo da média geral, em porcentagem. */
  contraMedia: number;
  /**
   * Por que este grupo não se compara direto com os outros.
   *
   * Existe para o caso do story, cuja taxa a rede calcula sobre outras
   * interações. Sem a ressalva ao lado do número, a tabela ordena story em
   * último e quem lê conclui o contrário do que o dado permite.
   */
  ressalva?: string;
};

/** Uma peça com os números que interessam para comparar. */
export type PecaAvaliada = {
  post: Post;
  alcance: number;
  interacoes: number;
  taxa: number;
  /** Interações que chegaram na caixa por causa desta peça. */
  comentarios: number;
  /** Quanto acima ou abaixo da média das peças do mesmo período. */
  contraMedia: number;
  assuntos: string[];
  /** Dia da semana em que foi publicada, 0 = domingo. */
  diaDaSemana: number | null;
  hora: number | null;
};

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export const NOME_DO_FORMATO: Record<PostFormat, string> = {
  a_definir: "A definir",
  imagem: "Imagem",
  carrossel: "Carrossel",
  video: "Vídeo",
  story: "Story",
};

/**
 * Palavras que viram assunto quando aparecem na legenda.
 *
 * Lista curta e explícita em vez de um classificador: quem lê o relatório
 * precisa poder discordar da classificação, e para discordar precisa saber a
 * regra. Uma lista de palavras é auditável; um modelo estatístico sobre
 * cinquenta legendas não é — e erraria mais.
 *
 * A lista é editável pelo próprio uso: hashtag é assunto direto, sem precisar
 * estar aqui.
 */
const PALAVRAS_POR_ASSUNTO: Record<string, string[]> = {
  Agenda: ["agenda", "evento", "encontro", "reunião", "reuniao", "visita", "caminhada"],
  Proposta: ["proposta", "projeto", "plano", "compromisso", "vamos fazer", "programa"],
  Bastidores: ["bastidor", "equipe", "time", "preparação", "preparacao", "making"],
  Depoimento: ["depoimento", "história", "historia", "relato", "conheça", "conheca"],
  Resultado: ["resultado", "entrega", "conquista", "aprovado", "inaugur"],
  Saúde: ["saúde", "saude", "posto", "hospital", "vacina", "médic", "medic"],
  Educação: ["educação", "educacao", "escola", "creche", "professor", "aluno"],
  Mobilidade: ["mobilidade", "ônibus", "onibus", "transporte", "trânsito", "transito", "asfalto"],
  Segurança: ["segurança", "seguranca", "polícia", "policia", "iluminação", "iluminacao"],
  Cultura: ["cultura", "festival", "show", "música", "musica", "arte", "teatro"],
};

export const ASSUNTOS_CONHECIDOS = Object.keys(PALAVRAS_POR_ASSUNTO);

export const SEM_ASSUNTO = "Sem assunto";

/**
 * Os assuntos de uma legenda.
 *
 * Hashtags entram como estão, com a primeira letra maiúscula; o resto vem das
 * palavras-chave. Uma peça pode ter mais de um assunto, porque uma legenda
 * sobre a inauguração de um posto de saúde é sobre as duas coisas.
 */
/** Chave de comparação sem acento nem caixa, para "#SAUDE" e "Saúde" serem um. */
function chaveDoAssunto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function assuntosDe(legenda: string): string[] {
  // Indexado pela chave sem acento: sem isso, a hashtag "#SAUDE" e a
  // palavra-chave "saúde" viravam dois assuntos diferentes na mesma peça, e o
  // relatório mostrava o mesmo tema duas vezes com números partidos ao meio.
  const encontrados = new Map<string, string>();

  const registrar = (rotulo: string, canonico: boolean) => {
    const chave = chaveDoAssunto(rotulo);
    // O nome conhecido vence o da hashtag: "Saúde" é como o relatório chama.
    if (canonico || !encontrados.has(chave)) encontrados.set(chave, rotulo);
  };

  for (const [, achado] of legenda.matchAll(/#([\p{L}\p{N}_]{2,})/gu)) {
    registrar(achado.charAt(0).toUpperCase() + achado.slice(1).toLowerCase(), false);
  }

  const texto = legenda.toLowerCase();
  for (const [assunto, palavras] of Object.entries(PALAVRAS_POR_ASSUNTO)) {
    if (palavras.some((palavra) => texto.includes(palavra))) registrar(assunto, true);
  }

  return [...encontrados.values()];
}

/** Interações da caixa que vieram de cada publicação. */
function comentariosPorPost(inbox: InboxItem[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const item of inbox) {
    if (!item.postId) continue;
    mapa.set(item.postId, (mapa.get(item.postId) ?? 0) + 1);
  }
  return mapa;
}

/**
 * Avalia cada peça publicada contra a média do conjunto.
 *
 * "Contra a média" é a forma que faz sentido para quem decide: saber que um
 * post alcançou 5.000 não diz nada sozinho; saber que alcançou 60% acima do que
 * a conta costuma alcançar diz o que fazer.
 */
export function avaliarPecas(
  posts: Post[],
  inbox: InboxItem[] = [],
  fuso: string = FUSO_DA_CAMPANHA,
): PecaAvaliada[] {
  const publicados = posts.filter((post) => post.status === "publicado" && post.metrics);
  if (publicados.length === 0) return [];

  const comentarios = comentariosPorPost(inbox);
  const alcanceMedio =
    publicados.reduce((soma, post) => soma + post.metrics!.reach, 0) / publicados.length;

  return publicados
    .map((post) => {
      const metricas = post.metrics!;
      const interacoes = metricas.likes + metricas.comments + metricas.shares + metricas.saves;
      const parede = post.publishedAt ? paredeNaZona(post.publishedAt, fuso) : null;

      return {
        post,
        alcance: metricas.reach,
        interacoes,
        taxa: metricas.reach > 0 ? (interacoes / metricas.reach) * 100 : 0,
        comentarios: comentarios.get(post.id) ?? 0,
        contraMedia: alcanceMedio > 0 ? (metricas.reach / alcanceMedio - 1) * 100 : 0,
        assuntos: assuntosDe(post.caption),
        // O dia e a hora saem do fuso da campanha, não do relógio da máquina.
        // `getHours()` devolveria a hora do servidor: a publicação de abertura,
        // que saiu às 02h31 em São Paulo, viraria 05h31 numa hospedagem em UTC —
        // e mudaria de bloco do dia, mudando a recomendação de horário.
        diaDaSemana: parede ? parede.diaDaSemana : null,
        hora: parede ? parede.hora : null,
      };
    })
    .sort((a, b) => b.alcance - a.alcance);
}

/** Agrupa as peças por uma chave qualquer e compara cada grupo com a média. */
function agrupar(
  pecas: PecaAvaliada[],
  chaveDe: (peca: PecaAvaliada) => string[],
  rotuloDe: (chave: string) => string,
): DesempenhoDoGrupo[] {
  const grupos = new Map<string, PecaAvaliada[]>();

  for (const peca of pecas) {
    for (const chave of chaveDe(peca)) {
      grupos.set(chave, [...(grupos.get(chave) ?? []), peca]);
    }
  }

  const alcanceMedioGeral =
    pecas.length > 0 ? pecas.reduce((soma, peca) => soma + peca.alcance, 0) / pecas.length : 0;

  return [...grupos.entries()]
    .map(([chave, doGrupo]) => {
      const alcanceTotal = doGrupo.reduce((soma, peca) => soma + peca.alcance, 0);
      const alcanceMedio = alcanceTotal / doGrupo.length;
      const interacoes = doGrupo.reduce((soma, peca) => soma + peca.interacoes, 0);

      return {
        chave,
        rotulo: rotuloDe(chave),
        pecas: doGrupo.length,
        alcanceMedio,
        alcanceTotal,
        interacoesMedias: interacoes / doGrupo.length,
        taxa: alcanceTotal > 0 ? (interacoes / alcanceTotal) * 100 : 0,
        contraMedia: alcanceMedioGeral > 0 ? (alcanceMedio / alcanceMedioGeral - 1) * 100 : 0,
      };
    })
    .sort((a, b) => b.alcanceMedio - a.alcanceMedio);
}

export function porFormato(pecas: PecaAvaliada[]): DesempenhoDoGrupo[] {
  return agrupar(
    pecas,
    (peca) => [peca.post.format],
    (chave) => NOME_DO_FORMATO[chave as PostFormat] ?? chave,
  ).map((grupo) =>
    FORMATOS_DE_FEED.includes(grupo.chave as PostFormat)
      ? grupo
      : {
          ...grupo,
          ressalva:
            "A rede não devolve curtidas nem salvamentos de story, e o alcance é limitado a quem abre stories. A taxa aqui não se compara com a do feed.",
        },
  );
}

export function porAssunto(pecas: PecaAvaliada[]): DesempenhoDoGrupo[] {
  return agrupar(
    pecas,
    (peca) => (peca.assuntos.length > 0 ? peca.assuntos : [SEM_ASSUNTO]),
    (chave) => chave,
  );
}

export function porDiaDaSemana(pecas: PecaAvaliada[]): DesempenhoDoGrupo[] {
  return agrupar(
    pecas.filter((peca) => peca.diaDaSemana !== null),
    (peca) => [String(peca.diaDaSemana)],
    (chave) => DIAS[Number(chave)] ?? chave,
  ).sort((a, b) => Number(a.chave) - Number(b.chave));
}

/**
 * Faixas de horário em vez de hora cheia.
 *
 * Vinte e quatro grupos sobre trinta publicações dariam um post por grupo e
 * nenhuma conclusão. Quatro faixas mantêm a amostra utilizável e correspondem
 * a como se decide de fato: "de manhã ou à noite?".
 */
const FAIXAS: { chave: string; rotulo: string; de: number; ate: number }[] = [
  { chave: "madrugada", rotulo: "Madrugada (0h–5h)", de: 0, ate: 5 },
  { chave: "manha", rotulo: "Manhã (6h–11h)", de: 6, ate: 11 },
  { chave: "tarde", rotulo: "Tarde (12h–17h)", de: 12, ate: 17 },
  { chave: "noite", rotulo: "Noite (18h–23h)", de: 18, ate: 23 },
];

export function porFaixaDeHorario(pecas: PecaAvaliada[]): DesempenhoDoGrupo[] {
  return agrupar(
    pecas.filter((peca) => peca.hora !== null),
    (peca) => {
      const faixa = FAIXAS.find((item) => peca.hora! >= item.de && peca.hora! <= item.ate);
      return faixa ? [faixa.chave] : [];
    },
    (chave) => FAIXAS.find((item) => item.chave === chave)?.rotulo ?? chave,
  );
}

/**
 * O que está funcionando e o que não está, em frases.
 *
 * `minimoDePecas` é o que separa achado de acaso. Três é o piso: com duas
 * peças, a média é a metade da soma de dois acasos.
 */
export function destaques(
  pecas: PecaAvaliada[],
  minimoDePecas = 3,
): { positivos: DesempenhoDoGrupo[]; negativos: DesempenhoDoGrupo[] } {
  const grupos = [...porFormato(pecas), ...porAssunto(pecas), ...porFaixaDeHorario(pecas)].filter(
    // Grupo com ressalva não entra em destaque. Um destaque é uma frase curta e
    // conclusiva — "Story: −64%" — e é justamente o formato de frase que não
    // cabe numa comparação que precisa de asterisco. O story continua na
    // tabela por formato, onde a ressalva é lida junto com o número.
    (grupo) =>
      grupo.pecas >= minimoDePecas && grupo.chave !== SEM_ASSUNTO && grupo.ressalva === undefined,
  );

  return {
    // 25% acima ou abaixo da média: abaixo disso é oscilação normal entre peças.
    positivos: grupos.filter((grupo) => grupo.contraMedia >= 25).slice(0, 4),
    negativos: grupos
      .filter((grupo) => grupo.contraMedia <= -25)
      .sort((a, b) => a.contraMedia - b.contraMedia)
      .slice(0, 4),
  };
}
