import { cortar, medir, quebrar, type Fonte } from "./fontes.ts";

/**
 * Escritor de PDF.
 *
 * Por que escrever isto em vez de instalar uma biblioteca: o gerador precisa
 * rodar nos dois lados. No servidor, para o botão "baixar PDF" do relatório; e
 * no navegador, porque a plataforma também é distribuída como um HTML único que
 * roda sem servidor nenhum. Um módulo puro, sem dependência e sem API de Node,
 * atende os dois de uma vez. Além disso, a parte difícil de um relatório
 * bonito não é montar o arquivo — é a diagramação, e essa seria manual de
 * qualquer jeito.
 *
 * O formato em si é simples: uma lista de objetos numerados, um índice com o
 * deslocamento em bytes de cada um, e um rodapé apontando para o índice. O
 * cuidado que ele exige é com bytes, não com estrutura — daí o documento ser
 * montado como pedaços de `Uint8Array` com o deslocamento contado a cada passo,
 * em vez de uma string concatenada no fim.
 *
 * Coordenadas: o PDF conta a partir do canto inferior esquerdo, o que inverte
 * a intuição de quem diagrama. A API exposta aqui usa o canto **superior**
 * esquerdo, e a conversão acontece num lugar só.
 */

/** A4 em pontos — 210 × 297 mm a 72 dpi. */
export const LARGURA_PAGINA = 595.28;
export const ALTURA_PAGINA = 841.89;

export type Cor = { r: number; g: number; b: number };

export const PRETO: Cor = { r: 0, g: 0, b: 0 };
export const BRANCO: Cor = { r: 1, g: 1, b: 1 };

/** Cria uma cor a partir de "#rrggbb". */
export function corHex(hex: string): Cor {
  const limpo = hex.replace("#", "");
  return {
    r: parseInt(limpo.slice(0, 2), 16) / 255,
    g: parseInt(limpo.slice(2, 4), 16) / 255,
    b: parseInt(limpo.slice(4, 6), 16) / 255,
  };
}

/**
 * Unicode → byte na codificação WinAnsi, para os sinais que não são Latin-1.
 *
 * O travessão, as aspas curvas e as reticências caem entre 128 e 159, uma faixa
 * que o Latin-1 deixa vazia e que o WinAnsi preenche. Sem esta tradução, um
 * texto em português sai com caracteres trocados justamente na pontuação que o
 * torna legível.
 */
const WIN_ANSI_ESPECIAIS: Record<string, number> = {
  "€": 128,
  "‚": 130,
  ƒ: 131,
  "„": 132,
  "…": 133,
  "†": 134,
  "‡": 135,
  ˆ: 136,
  "‰": 137,
  Š: 138,
  "‹": 139,
  Œ: 140,
  Ž: 142,
  "‘": 145,
  "’": 146,
  "“": 147,
  "”": 148,
  "•": 149,
  "–": 150,
  "—": 151,
  "˜": 152,
  "™": 153,
  š: 154,
  "›": 155,
  œ: 156,
  ž: 158,
  Ÿ: 159,
};

/** Texto em bytes WinAnsi. O que não couber vira "?" em vez de corromper. */
function bytesDeTexto(texto: string): number[] {
  const bytes: number[] = [];
  for (const caractere of texto) {
    const especial = WIN_ANSI_ESPECIAIS[caractere];
    if (especial !== undefined) {
      bytes.push(especial);
      continue;
    }
    const codigo = caractere.codePointAt(0) ?? 63;
    bytes.push(codigo <= 255 ? codigo : 63);
  }
  return bytes;
}

/** Escapa e codifica um texto como literal de string do PDF. */
function literal(texto: string): number[] {
  const saida: number[] = [0x28]; // (
  for (const byte of bytesDeTexto(texto)) {
    // Parênteses e barra invertida têm significado dentro do literal.
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) saida.push(0x5c);
    saida.push(byte);
  }
  saida.push(0x29); // )
  return saida;
}

function bytesAscii(texto: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < texto.length; i += 1) bytes.push(texto.charCodeAt(i) & 0xff);
  return bytes;
}

/** Número com no máximo três casas, sem notação científica nem lixo de ponto. */
function num(valor: number): string {
  if (!Number.isFinite(valor)) return "0";
  const arredondado = Math.round(valor * 1000) / 1000;
  return Object.is(arredondado, -0) ? "0" : String(arredondado);
}

export type OpcoesTexto = {
  tamanho?: number;
  fonte?: Fonte;
  cor?: Cor;
  /** Onde `x` cai em relação ao texto. */
  alinhamento?: "esquerda" | "centro" | "direita";
};

/**
 * Uma página em construção.
 *
 * Acumula operadores de desenho; o documento os transforma em fluxo de conteúdo
 * quando o arquivo é fechado.
 */
export class Pagina {
  /** Operadores já emitidos, em ordem. */
  private readonly operacoes: string[] = [];

  readonly largura: number;
  readonly altura: number;

  // Campos declarados e atribuídos à mão, em vez de propriedades de parâmetro:
  // os testes rodam com o "type stripping" do Node, que apaga tipos sem
  // reescrever código, e a forma abreviada precisaria justamente disso.
  constructor(largura = LARGURA_PAGINA, altura = ALTURA_PAGINA) {
    this.largura = largura;
    this.altura = altura;
  }

  /** Converte a coordenada de cima para a de baixo, que é a do formato. */
  private y(deCima: number): number {
    return this.altura - deCima;
  }

  private empilhar(operacao: string): void {
    this.operacoes.push(operacao);
  }

  retangulo(x: number, y: number, largura: number, altura: number, cor: Cor): this {
    this.empilhar(
      `${num(cor.r)} ${num(cor.g)} ${num(cor.b)} rg ${num(x)} ${num(this.y(y + altura))} ${num(largura)} ${num(altura)} re f`,
    );
    return this;
  }

  contorno(x: number, y: number, largura: number, altura: number, cor: Cor, espessura = 0.5): this {
    this.empilhar(
      `${num(cor.r)} ${num(cor.g)} ${num(cor.b)} RG ${num(espessura)} w ${num(x)} ${num(this.y(y + altura))} ${num(largura)} ${num(altura)} re S`,
    );
    return this;
  }

  linha(x1: number, y1: number, x2: number, y2: number, cor: Cor, espessura = 0.5): this {
    this.empilhar(
      `${num(cor.r)} ${num(cor.g)} ${num(cor.b)} RG ${num(espessura)} w ${num(x1)} ${num(this.y(y1))} m ${num(x2)} ${num(this.y(y2))} l S`,
    );
    return this;
  }

  /** Uma sequência de pontos ligados — a curva dos gráficos. */
  polilinha(pontos: { x: number; y: number }[], cor: Cor, espessura = 1): this {
    if (pontos.length < 2) return this;
    const partes = pontos.map(
      (ponto, indice) => `${num(ponto.x)} ${num(this.y(ponto.y))} ${indice === 0 ? "m" : "l"}`,
    );
    this.empilhar(
      `${num(cor.r)} ${num(cor.g)} ${num(cor.b)} RG ${num(espessura)} w ${partes.join(" ")} S`,
    );
    return this;
  }

  /** A mesma sequência, fechada e preenchida — a área sob a curva. */
  area(pontos: { x: number; y: number }[], cor: Cor, opacidade = 1): this {
    if (pontos.length < 3) return this;
    const partes = pontos.map(
      (ponto, indice) => `${num(ponto.x)} ${num(this.y(ponto.y))} ${indice === 0 ? "m" : "l"}`,
    );
    // Sem estado de transparência declarado, a opacidade é simulada
    // clareando a cor contra o branco do papel. Basta para faixas de fundo e
    // evita um recurso a mais no dicionário da página.
    const clara: Cor = {
      r: cor.r + (1 - cor.r) * (1 - opacidade),
      g: cor.g + (1 - cor.g) * (1 - opacidade),
      b: cor.b + (1 - cor.b) * (1 - opacidade),
    };
    this.empilhar(`${num(clara.r)} ${num(clara.g)} ${num(clara.b)} rg ${partes.join(" ")} h f`);
    return this;
  }

  texto(texto: string, x: number, y: number, opcoes: OpcoesTexto = {}): this {
    const tamanho = opcoes.tamanho ?? 10;
    const fonte = opcoes.fonte ?? "normal";
    const cor = opcoes.cor ?? PRETO;

    let inicioX = x;
    if (opcoes.alinhamento === "centro") inicioX = x - medir(texto, tamanho, fonte) / 2;
    else if (opcoes.alinhamento === "direita") inicioX = x - medir(texto, tamanho, fonte);

    // `y` é a linha de base do texto, contada de cima.
    const corpo = literal(texto)
      .map((byte) => String.fromCharCode(byte))
      .join("");

    this.empilhar(
      `BT ${num(cor.r)} ${num(cor.g)} ${num(cor.b)} rg /${fonte === "negrito" ? "F2" : "F1"} ${num(tamanho)} Tf ${num(inicioX)} ${num(this.y(y))} Td ${corpo} Tj ET`,
    );
    return this;
  }

  /**
   * Texto que quebra em várias linhas dentro de uma largura.
   *
   * Devolve a altura ocupada, para quem chama saber onde continuar — é o que
   * mantém a diagramação em fluxo, sem posições fixas espalhadas pelo código.
   */
  paragrafo(
    texto: string,
    x: number,
    y: number,
    largura: number,
    opcoes: OpcoesTexto & { entrelinha?: number } = {},
  ): number {
    const tamanho = opcoes.tamanho ?? 10;
    const entrelinha = opcoes.entrelinha ?? tamanho * 1.45;
    const linhas = quebrar(texto, largura, tamanho, opcoes.fonte ?? "normal");

    linhas.forEach((linha, indice) => {
      this.texto(linha, x, y + indice * entrelinha, opcoes);
    });

    return linhas.length * entrelinha;
  }

  /** Texto de uma linha só, cortado com reticências se não couber. */
  textoCortado(
    texto: string,
    x: number,
    y: number,
    largura: number,
    opcoes: OpcoesTexto = {},
  ): this {
    const tamanho = opcoes.tamanho ?? 10;
    return this.texto(cortar(texto, largura, tamanho, opcoes.fonte ?? "normal"), x, y, opcoes);
  }

  /** O fluxo de conteúdo pronto, em bytes. */
  conteudo(): number[] {
    const texto = this.operacoes.join("\n");
    // O corpo dos literais já veio em bytes WinAnsi disfarçados de caracteres;
    // `charCodeAt` os devolve intactos.
    return bytesAscii(texto);
  }
}

/**
 * O documento inteiro.
 *
 * Junta as páginas, numera os objetos e monta o índice com os deslocamentos.
 */
export class Documento {
  private readonly paginas: Pagina[] = [];

  novaPagina(largura?: number, altura?: number): Pagina {
    const pagina = new Pagina(largura, altura);
    this.paginas.push(pagina);
    return pagina;
  }

  get totalDePaginas(): number {
    return this.paginas.length;
  }

  /** Fecha o documento e devolve os bytes do arquivo. */
  finalizar(metadados: { titulo?: string; autor?: string; criadoEm?: Date } = {}): Uint8Array {
    if (this.paginas.length === 0) this.novaPagina();

    const objetos: number[][] = [];
    /** Registra um objeto e devolve o número dele (1-based). */
    const adicionar = (corpo: number[]): number => {
      objetos.push(corpo);
      return objetos.length;
    };

    // A ordem importa só para a legibilidade do arquivo; as referências são por
    // número. Reservamos 1 para o catálogo e 2 para a árvore de páginas.
    const numeroCatalogo = adicionar([]);
    const numeroPaginas = adicionar([]);
    const numeroFonteNormal = adicionar(
      bytesAscii(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      ),
    );
    const numeroFonteNegrito = adicionar(
      bytesAscii(
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      ),
    );

    const numerosDasPaginas: number[] = [];
    for (const pagina of this.paginas) {
      const conteudo = pagina.conteudo();
      const numeroConteudo = adicionar([
        ...bytesAscii(`<< /Length ${conteudo.length} >>\nstream\n`),
        ...conteudo,
        ...bytesAscii("\nendstream"),
      ]);

      numerosDasPaginas.push(
        adicionar(
          bytesAscii(
            `<< /Type /Page /Parent ${numeroPaginas} 0 R ` +
              `/MediaBox [0 0 ${num(pagina.largura)} ${num(pagina.altura)}] ` +
              `/Resources << /Font << /F1 ${numeroFonteNormal} 0 R /F2 ${numeroFonteNegrito} 0 R >> >> ` +
              `/Contents ${numeroConteudo} 0 R >>`,
          ),
        ),
      );
    }

    objetos[numeroCatalogo - 1] = bytesAscii(`<< /Type /Catalog /Pages ${numeroPaginas} 0 R >>`);
    objetos[numeroPaginas - 1] = bytesAscii(
      `<< /Type /Pages /Kids [${numerosDasPaginas.map((n) => `${n} 0 R`).join(" ")}] /Count ${numerosDasPaginas.length} >>`,
    );

    const numeroInfo = adicionar([
      ...bytesAscii("<< /Producer "),
      ...literal("Ampliação Social Hub"),
      ...bytesAscii(" /Title "),
      ...literal(metadados.titulo ?? "Relatório"),
      ...bytesAscii(" /Author "),
      ...literal(metadados.autor ?? "Ampliação Marketing Digital"),
      ...bytesAscii(` /CreationDate ${dataPdf(metadados.criadoEm ?? new Date())} >>`),
    ]);

    // --- Montagem final, contando bytes -------------------------------------

    const saida: number[] = [];
    const escrever = (bytes: number[]) => saida.push(...bytes);

    escrever(bytesAscii("%PDF-1.4\n"));
    // Comentário com bytes altos: sinaliza aos leitores que o arquivo é
    // binário e não deve sofrer conversão de fim de linha em trânsito.
    escrever([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]);

    const deslocamentos: number[] = [];
    objetos.forEach((corpo, indice) => {
      deslocamentos[indice] = saida.length;
      escrever(bytesAscii(`${indice + 1} 0 obj\n`));
      escrever(corpo);
      escrever(bytesAscii("\nendobj\n"));
    });

    const inicioDoIndice = saida.length;
    escrever(bytesAscii(`xref\n0 ${objetos.length + 1}\n`));
    // A entrada zero é obrigatória e sempre livre.
    escrever(bytesAscii("0000000000 65535 f \n"));
    for (const deslocamento of deslocamentos) {
      escrever(bytesAscii(`${String(deslocamento).padStart(10, "0")} 00000 n \n`));
    }

    escrever(
      bytesAscii(
        `trailer\n<< /Size ${objetos.length + 1} /Root ${numeroCatalogo} 0 R /Info ${numeroInfo} 0 R >>\nstartxref\n${inicioDoIndice}\n%%EOF\n`,
      ),
    );

    return Uint8Array.from(saida);
  }
}

/** A data no formato que o PDF espera: D:AAAAMMDDHHMMSS. */
function dataPdf(data: Date): string {
  const dois = (valor: number) => String(valor).padStart(2, "0");
  return (
    `(D:${data.getUTCFullYear()}${dois(data.getUTCMonth() + 1)}${dois(data.getUTCDate())}` +
    `${dois(data.getUTCHours())}${dois(data.getUTCMinutes())}${dois(data.getUTCSeconds())}Z)`
  );
}

/** Os bytes em base64, para trafegar numa resposta JSON. */
export function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  // Em pedaços: `String.fromCharCode(...bytes)` com centenas de milhares de
  // argumentos estoura a pilha de chamadas.
  const passo = 8192;
  for (let inicio = 0; inicio < bytes.length; inicio += passo) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + passo));
  }

  if (typeof btoa === "function") return btoa(binario);
  // No servidor, onde `btoa` pode não existir.
  return Buffer.from(bytes).toString("base64");
}
