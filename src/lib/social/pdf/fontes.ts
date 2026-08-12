/**
 * Medidas das fontes do PDF.
 *
 * Um PDF não quebra linha sozinho: quem escreve precisa saber a largura de cada
 * caractere para decidir onde a linha termina, onde centralizar e onde cortar
 * com reticências. Sem isso, ou o texto vaza para fora da margem ou some sob o
 * elemento seguinte — que é a diferença entre um documento e uma folha suja.
 *
 * As larguras são as da Helvetica e da Helvetica-Bold, que fazem parte das
 * catorze fontes que todo leitor de PDF já tem. Não embutir arquivo de fonte
 * mantém o documento em dezenas de quilobytes em vez de centenas, e elimina a
 * classe de erro em que o PDF abre sem texto porque a fonte não veio junto.
 *
 * Os valores estão em milésimos do tamanho da fonte, que é a unidade do
 * formato: um "a" de 556 ocupa 5,56 pt quando a fonte está em 10 pt.
 */

export type Fonte = "normal" | "negrito";

/** Larguras da Helvetica para os caracteres ASCII imprimíveis (32 a 126). */
const NORMAL_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** O mesmo para a Helvetica-Bold. */
const NEGRITO_ASCII = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/**
 * Acentuados e pontuação do português, mapeados para a letra de mesma largura.
 *
 * Na Helvetica um "á" tem exatamente a largura de um "a" — o acento não alarga
 * o caractere. Guardar o equivalente em vez de repetir números evita a tabela
 * gigante e o erro de digitação silencioso que ela convidaria.
 */
const EQUIVALENTES: Record<string, string> = {
  á: "a",
  à: "a",
  â: "a",
  ã: "a",
  ä: "a",
  å: "a",
  é: "e",
  è: "e",
  ê: "e",
  ë: "e",
  í: "i",
  ì: "i",
  î: "i",
  ï: "i",
  ó: "o",
  ò: "o",
  ô: "o",
  õ: "o",
  ö: "o",
  ú: "u",
  ù: "u",
  û: "u",
  ü: "u",
  ç: "c",
  ñ: "n",
  ý: "y",
  ÿ: "y",
  Á: "A",
  À: "A",
  Â: "A",
  Ã: "A",
  Ä: "A",
  Å: "A",
  É: "E",
  È: "E",
  Ê: "E",
  Ë: "E",
  Í: "I",
  Ì: "I",
  Î: "I",
  Ï: "I",
  Ó: "O",
  Ò: "O",
  Ô: "O",
  Õ: "O",
  Ö: "O",
  Ú: "U",
  Ù: "U",
  Û: "U",
  Ü: "U",
  Ç: "C",
  Ñ: "N",
  Ý: "Y",
};

/** Larguras de sinais que não são letras nem têm equivalente ASCII. */
const ESPECIAIS: Record<string, [number, number]> = {
  "—": [1000, 1000],
  "–": [556, 556],
  "…": [1000, 1000],
  "·": [278, 278],
  "“": [333, 500],
  "”": [333, 500],
  "‘": [222, 238],
  "’": [222, 238],
  º: [365, 400],
  ª: [370, 400],
  "°": [400, 400],
  "§": [556, 556],
  "€": [556, 556],
  "£": [556, 556],
  "©": [737, 737],
  "«": [556, 556],
  "»": [556, 556],
  "±": [584, 584],
  µ: [556, 611],
  "¼": [834, 834],
  "½": [834, 834],
  " ": [278, 278],
};

/** Largura de um caractere desconhecido. Escolhida no meio da faixa comum. */
const LARGURA_PADRAO = 500;

function larguraDoCaractere(caractere: string, fonte: Fonte): number {
  const especial = ESPECIAIS[caractere];
  if (especial) return especial[fonte === "negrito" ? 1 : 0];

  const base = EQUIVALENTES[caractere] ?? caractere;
  const codigo = base.charCodeAt(0);
  if (codigo >= 32 && codigo <= 126) {
    const tabela = fonte === "negrito" ? NEGRITO_ASCII : NORMAL_ASCII;
    return tabela[codigo - 32];
  }
  return LARGURA_PADRAO;
}

/** Largura de um texto, em pontos, no tamanho informado. */
export function medir(texto: string, tamanho: number, fonte: Fonte = "normal"): number {
  let milesimos = 0;
  for (const caractere of texto) milesimos += larguraDoCaractere(caractere, fonte);
  return (milesimos * tamanho) / 1000;
}

/**
 * Quebra o texto em linhas que cabem em `largura`.
 *
 * Quebra entre palavras. Uma palavra sozinha maior que a largura disponível —
 * uma URL, um identificador — é cortada no meio, porque deixá-la vazar
 * estragaria a página inteira em vez de só a linha dela.
 */
export function quebrar(
  texto: string,
  largura: number,
  tamanho: number,
  fonte: Fonte = "normal",
): string[] {
  const linhas: string[] = [];

  for (const paragrafo of texto.split("\n")) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) {
      linhas.push("");
      continue;
    }

    let atual = "";
    for (const palavra of palavras) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (medir(tentativa, tamanho, fonte) <= largura) {
        atual = tentativa;
        continue;
      }

      if (atual) linhas.push(atual);

      if (medir(palavra, tamanho, fonte) <= largura) {
        atual = palavra;
        continue;
      }

      // Palavra maior que a linha: parte em pedaços que caibam.
      let pedaco = "";
      for (const caractere of palavra) {
        if (medir(pedaco + caractere, tamanho, fonte) > largura && pedaco) {
          linhas.push(pedaco);
          pedaco = caractere;
        } else {
          pedaco += caractere;
        }
      }
      atual = pedaco;
    }
    if (atual) linhas.push(atual);
  }

  return linhas;
}

/**
 * Corta o texto com reticências se ele não couber.
 *
 * Para células de tabela, onde a linha é uma só e vazar não é opção.
 */
export function cortar(
  texto: string,
  largura: number,
  tamanho: number,
  fonte: Fonte = "normal",
): string {
  if (medir(texto, tamanho, fonte) <= largura) return texto;

  const reticencias = "…";
  const disponivel = largura - medir(reticencias, tamanho, fonte);
  if (disponivel <= 0) return "";

  let resultado = "";
  for (const caractere of texto) {
    if (medir(resultado + caractere, tamanho, fonte) > disponivel) break;
    resultado += caractere;
  }
  return `${resultado.trimEnd()}${reticencias}`;
}
