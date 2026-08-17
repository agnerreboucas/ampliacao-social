import { instanteNaZona } from "./fuso.ts";
import type { PostFormat } from "./types.ts";

/**
 * Leitura da exportação de conteúdo do Instagram.
 *
 * É o arquivo que sai de Insights → Conteúdo → Exportar dados: uma linha por
 * publicação, com alcance, visualizações e interações acumuladas.
 *
 * Duas armadilhas deste formato, e as duas foram confirmadas contra a exportação
 * real da campanha de agosto de 2026:
 *
 * **A data vem em MM/DD/AAAA.** `08/03/2026` é 3 de agosto, não 8 de março. Ler
 * como dia/mês não quebra nada — produz um arquivo que importa em silêncio com
 * metade das publicações no mês errado, e ninguém descobre até o relatório sair
 * com um buraco.
 *
 * **O horário não é o da campanha.** O relatório traz a hora no fuso da conta de
 * negócios, que a Meta emite em horário do Pacífico. Na exportação de agosto, a
 * publicação de abertura aparece como `08/15 22:31` e o próprio Instagram mostra
 * `16/08 02:31` — exatamente quatro horas de diferença, que é o que separa
 * `America/Los_Angeles` de `America/Sao_Paulo` em agosto. Quatro horas mudam o
 * dia da semana e o bloco do dia; ler o arquivo como hora local jogaria toda a
 * análise de horário para o lado errado.
 *
 * Por isso este módulo **nunca devolve só um horário**. Devolve os quatro:
 * o texto original, o fuso da fonte, o fuso da campanha e o instante
 * normalizado. Guardar os quatro é o que permite reconferir depois, quando
 * alguém desconfiar do número — e alguém vai desconfiar.
 *
 * Módulo puro.
 */

/** O fuso em que a Meta emite os relatórios de conta de negócios. */
export const FUSO_PADRAO_DO_RELATORIO = "America/Los_Angeles";

/** O fuso da campanha, quando ninguém informa outro. */
export const FUSO_PADRAO_DA_CAMPANHA = "America/Sao_Paulo";

/**
 * Como cada tipo do arquivo vira formato da plataforma.
 *
 * O nome no arquivo é do produto, não do domínio: "Reel do Instagram" é vídeo
 * vertical, e é isso que a análise por formato precisa saber. O mapa é explícito
 * — um tipo novo que a Meta invente cai em `null` e vira um problema relatado,
 * em vez de virar `imagem` por descuido do `??`.
 */
const FORMATO_DO_TIPO: Record<string, PostFormat> = {
  "reel do instagram": "video",
  "vídeo do instagram": "video",
  "video do instagram": "video",
  "imagem do instagram": "imagem",
  "foto do instagram": "imagem",
  "carrossel do instagram": "carrossel",
  "story do instagram": "story",
  "stories do instagram": "story",
};

/** Uma publicação lida do arquivo, com a procedência do horário preservada. */
export type PublicacaoImportada = {
  /** O id que o Instagram dá à publicação — é a chave para não duplicar. */
  idExterno: string;
  contaExterna: string;
  usuario: string;
  legenda: string;
  formato: PostFormat;
  /** O rótulo original do arquivo, guardado para conferência. */
  tipoNoArquivo: string;
  /** Duração em segundos; zero para o que não é vídeo. */
  duracaoSegundos: number;
  link: string;

  // --- O horário, nas quatro formas que a plataforma precisa guardar --------
  /** Exatamente como veio no arquivo: "08/15/2026 22:31". */
  horarioDeOrigem: string;
  /** O fuso em que aquele texto foi escrito. */
  fusoDaFonte: string;
  /** O fuso em que a campanha trabalha. */
  fusoDaCampanha: string;
  /** O instante, em ISO com deslocamento — a única forma comparável. */
  publicadoEm: string;
  /** O horário de parede na campanha: "16/08/2026 02:31". */
  publicadoEmLocal: string;
  /** Quantas horas somar ao horário do arquivo para chegar ao da campanha. */
  deslocamentoHoras: number;

  // --- Os números ------------------------------------------------------------
  visualizacoes: number;
  alcance: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  seguidoresGanhos: number;
};

export type ProblemaDaImportacao = {
  /** A linha do arquivo, contando o cabeçalho como 1. */
  linha: number;
  motivo: string;
};

export type LeituraDoInstagram = {
  publicacoes: PublicacaoImportada[];
  problemas: ProblemaDaImportacao[];
  /** As colunas que o arquivo trouxe, para a tela mostrar o que foi reconhecido. */
  colunas: string[];
  fusoDaFonte: string;
  fusoDaCampanha: string;
};

export type OpcoesDaLeitura = {
  /** Padrão: `America/Los_Angeles`, que é como a Meta emite. */
  fusoDaFonte?: string;
  /** Padrão: `America/Sao_Paulo`. */
  fusoDaCampanha?: string;
};

// --- CSV ---------------------------------------------------------------------

/**
 * Divide o CSV respeitando aspas e quebras de linha dentro de campo.
 *
 * A legenda de uma publicação tem vírgulas, aspas e parágrafos — separar por
 * `split(",")` embaralharia as colunas na primeira legenda de verdade. Este
 * arquivo é lido caractere a caractere porque é o único jeito de acertar.
 */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let atual: string[] = [];
  let entreAspas = false;

  // O BOM que o Excel e a Meta escrevem no início viraria parte do primeiro
  // nome de coluna, e o cabeçalho deixaria de casar.
  const limpo = texto.replace(/^﻿/, "");

  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];

    if (entreAspas) {
      if (c === '"') {
        // Aspas dobradas dentro do campo representam uma aspa literal.
        if (limpo[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      entreAspas = true;
    } else if (c === ",") {
      atual.push(campo);
      campo = "";
    } else if (c === "\n") {
      atual.push(campo);
      linhas.push(atual);
      atual = [];
      campo = "";
    } else if (c !== "\r") {
      campo += c;
    }
  }

  if (campo.length > 0 || atual.length > 0) {
    atual.push(campo);
    linhas.push(atual);
  }

  return linhas.filter((linha) => linha.some((valor) => valor.trim().length > 0));
}

// --- Reconhecimento de colunas ----------------------------------------------

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Os nomes que cada campo pode ter no arquivo.
 *
 * A Meta muda os rótulos entre idiomas e entre versões do painel. Uma lista
 * explícita de sinônimos é auditável e falha de forma clara; adivinhar por
 * posição da coluna quebra silenciosamente na primeira reordenação.
 */
const SINONIMOS: Record<string, string[]> = {
  idExterno: ["identificacao do post", "post id", "id da publicacao"],
  contaExterna: ["identificacao da conta", "account id"],
  usuario: ["nome de usuario da conta", "account username", "username"],
  legenda: ["descricao", "description", "legenda", "caption"],
  duracao: ["duracao (s)", "duration (s)", "duracao"],
  horario: ["horario de publicacao", "publish time", "data de publicacao"],
  link: ["link permanente", "permalink"],
  tipo: ["tipo de post", "post type"],
  visualizacoes: ["visualizacoes", "views", "impressoes"],
  alcance: ["alcance", "reach"],
  curtidas: ["curtidas", "likes"],
  compartilhamentos: ["compartilhamentos", "shares"],
  seguidores: ["seguimentos", "follows", "seguidores"],
  comentarios: ["comentarios", "comments"],
  salvamentos: ["salvamentos", "saves", "salvos"],
};

function mapearColunas(cabecalho: string[]): Record<string, number> {
  const indices: Record<string, number> = {};

  cabecalho.forEach((nome, indice) => {
    const limpo = normalizar(nome);
    for (const [campo, nomes] of Object.entries(SINONIMOS)) {
      if (indices[campo] === undefined && nomes.includes(limpo)) indices[campo] = indice;
    }
  });

  return indices;
}

function inteiro(bruto: string | undefined): number {
  if (!bruto) return 0;
  // Milhar com ponto e decimal com vírgula aparecem na exportação em português.
  const numero = Number(
    bruto
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, ""),
  );
  return Number.isFinite(numero) ? Math.round(numero) : 0;
}

// --- Horário -----------------------------------------------------------------

export type HorarioNormalizado = {
  publicadoEm: string;
  publicadoEmLocal: string;
  deslocamentoHoras: number;
};

/**
 * Interpreta o horário do arquivo e o traz para o fuso da campanha.
 *
 * O formato é `MM/DD/AAAA HH:MM`, na ordem americana. A checagem é explícita: um
 * primeiro número acima de doze só pode ser dia, e aí o arquivo não está no
 * formato esperado — dizer isso é melhor do que aceitar e errar o mês.
 */
export function normalizarHorario(
  bruto: string,
  fusoDaFonte: string,
  fusoDaCampanha: string,
): HorarioNormalizado | null {
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(
    bruto.trim(),
  );
  if (!partes) return null;

  const [, mes, dia, ano, hora, minuto, segundo] = partes.map(Number);
  if (mes > 12 || dia > 31 || hora > 23 || minuto > 59) return null;

  const instante = instanteNaZona(ano, mes, dia, hora, minuto, segundo || 0, fusoDaFonte);
  const naCampanha = instanteNaZona(ano, mes, dia, hora, minuto, segundo || 0, fusoDaCampanha);

  return {
    publicadoEm: new Date(instante).toISOString(),
    publicadoEmLocal: horarioDeParede(instante, fusoDaCampanha),
    // Quantas horas somar ao horário escrito no arquivo para chegar ao horário
    // da campanha. Positivo quando o relatório está atrasado — o caso do
    // relatório do Pacífico lido em São Paulo, que dá +4h em agosto.
    deslocamentoHoras: Math.round((instante - naCampanha) / 3_600_000),
  };
}

/** O horário de parede num fuso, no formato que uma pessoa daqui escreveria. */
export function horarioDeParede(instante: number, fuso: string): string {
  const formatador = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const partes = Object.fromEntries(
    formatador.formatToParts(new Date(instante)).map((parte) => [parte.type, parte.value]),
  );

  // Meia-noite volta como "24" em algumas versões do ICU.
  const hora = String(Number(partes.hour) % 24).padStart(2, "0");
  return `${partes.day}/${partes.month}/${partes.year} ${hora}:${partes.minute}`;
}

// --- Leitura ------------------------------------------------------------------

export function lerExportacaoDoInstagram(
  texto: string,
  {
    fusoDaFonte = FUSO_PADRAO_DO_RELATORIO,
    fusoDaCampanha = FUSO_PADRAO_DA_CAMPANHA,
  }: OpcoesDaLeitura = {},
): LeituraDoInstagram {
  const linhas = lerCsv(texto);
  const problemas: ProblemaDaImportacao[] = [];

  if (linhas.length < 2) {
    return {
      publicacoes: [],
      problemas: [{ linha: 1, motivo: "O arquivo não tem cabeçalho e nenhuma linha de dados." }],
      colunas: linhas[0] ?? [],
      fusoDaFonte,
      fusoDaCampanha,
    };
  }

  const cabecalho = linhas[0];
  const coluna = mapearColunas(cabecalho);

  for (const obrigatoria of ["horario", "tipo", "alcance"]) {
    if (coluna[obrigatoria] === undefined) {
      problemas.push({
        linha: 1,
        motivo: `Não achei a coluna de ${obrigatoria === "horario" ? "horário de publicação" : obrigatoria} — sem ela não dá para importar.`,
      });
    }
  }
  if (problemas.length > 0) {
    return { publicacoes: [], problemas, colunas: cabecalho, fusoDaFonte, fusoDaCampanha };
  }

  const publicacoes: PublicacaoImportada[] = [];
  const vistos = new Set<string>();

  linhas.slice(1).forEach((linha, indice) => {
    const numeroDaLinha = indice + 2;
    const em = (campo: string) =>
      coluna[campo] === undefined ? undefined : linha[coluna[campo]]?.trim();

    const tipoNoArquivo = em("tipo") ?? "";
    const formato = FORMATO_DO_TIPO[normalizar(tipoNoArquivo)];
    if (!formato) {
      problemas.push({
        linha: numeroDaLinha,
        motivo: `Tipo de post desconhecido: "${tipoNoArquivo}".`,
      });
      return;
    }

    const bruto = em("horario") ?? "";
    const horario = normalizarHorario(bruto, fusoDaFonte, fusoDaCampanha);
    if (!horario) {
      problemas.push({
        linha: numeroDaLinha,
        motivo: `Horário fora do formato MM/DD/AAAA HH:MM: "${bruto}".`,
      });
      return;
    }

    const idExterno = em("idExterno") ?? `${bruto}-${indice}`;
    if (vistos.has(idExterno)) {
      // Reexportar períodos que se sobrepõem é o normal; a linha repetida é
      // ignorada em silêncio porque não é erro de ninguém.
      return;
    }
    vistos.add(idExterno);

    publicacoes.push({
      idExterno,
      contaExterna: em("contaExterna") ?? "",
      usuario: em("usuario") ?? "",
      legenda: em("legenda") ?? "",
      formato,
      tipoNoArquivo,
      duracaoSegundos: inteiro(em("duracao")),
      link: em("link") ?? "",
      horarioDeOrigem: bruto,
      fusoDaFonte,
      fusoDaCampanha,
      publicadoEm: horario.publicadoEm,
      publicadoEmLocal: horario.publicadoEmLocal,
      deslocamentoHoras: horario.deslocamentoHoras,
      visualizacoes: inteiro(em("visualizacoes")),
      alcance: inteiro(em("alcance")),
      curtidas: inteiro(em("curtidas")),
      comentarios: inteiro(em("comentarios")),
      compartilhamentos: inteiro(em("compartilhamentos")),
      salvamentos: inteiro(em("salvamentos")),
      seguidoresGanhos: inteiro(em("seguidores")),
    });
  });

  return {
    publicacoes: publicacoes.sort((a, b) => a.publicadoEm.localeCompare(b.publicadoEm)),
    problemas,
    colunas: cabecalho,
    fusoDaFonte,
    fusoDaCampanha,
  };
}

// --- O que a leitura soma ----------------------------------------------------

export type TotaisDaImportacao = {
  publicacoes: number;
  visualizacoes: number;
  alcance: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  seguidoresGanhos: number;
  /** Curtidas + comentários + compartilhamentos + salvamentos. */
  interacoes: number;
  /** Interações sobre alcance, em porcentagem. */
  taxaDeInteracao: number;
  /** Visualizações por pessoa alcançada. */
  visualizacoesPorPessoa: number;
  primeiraPublicacao: string | null;
  ultimaPublicacao: string | null;
};

/**
 * Os totais do que foi importado.
 *
 * "Interação" aqui é a soma de curtidas, comentários, compartilhamentos e
 * salvamentos — a definição precisa estar escrita em um lugar só, porque é ela
 * que sustenta a taxa, e duas definições de taxa na mesma plataforma são duas
 * conversas diferentes sobre o mesmo número.
 */
export function totalizar(publicacoes: PublicacaoImportada[]): TotaisDaImportacao {
  const soma = (campo: keyof PublicacaoImportada) =>
    publicacoes.reduce((total, peca) => total + (peca[campo] as number), 0);

  const alcance = soma("alcance");
  const interacoes =
    soma("curtidas") + soma("comentarios") + soma("compartilhamentos") + soma("salvamentos");
  const ordenadas = [...publicacoes].sort((a, b) => a.publicadoEm.localeCompare(b.publicadoEm));

  return {
    publicacoes: publicacoes.length,
    visualizacoes: soma("visualizacoes"),
    alcance,
    curtidas: soma("curtidas"),
    comentarios: soma("comentarios"),
    compartilhamentos: soma("compartilhamentos"),
    salvamentos: soma("salvamentos"),
    seguidoresGanhos: soma("seguidoresGanhos"),
    interacoes,
    taxaDeInteracao: alcance > 0 ? (interacoes / alcance) * 100 : 0,
    visualizacoesPorPessoa: alcance > 0 ? soma("visualizacoes") / alcance : 0,
    primeiraPublicacao: ordenadas[0]?.publicadoEm ?? null,
    ultimaPublicacao: ordenadas[ordenadas.length - 1]?.publicadoEm ?? null,
  };
}
