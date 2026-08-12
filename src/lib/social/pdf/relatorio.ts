import {
  ALTURA_PAGINA,
  BRANCO,
  Documento,
  LARGURA_PAGINA,
  Pagina,
  corHex,
  type Cor,
} from "./documento.ts";
import { medir } from "./fontes.ts";
import type { LinhaDoCanal, Recomendacao } from "../recomendacoes.ts";
import type { DailyMetric, MetricSummary, OrganicPaidSplit } from "../types.ts";

/**
 * A diagramação do relatório em PDF.
 *
 * Este arquivo é sobre onde as coisas ficam na página, e as decisões que valem
 * a pena registrar são de leitura, não de código.
 *
 * A página tem **uma coluna e muita margem**. Relatório de agência costuma ser
 * lido em tela, com rolagem, e frequentemente reenviado por quem o recebeu para
 * mais alguém. Uma coluna larga com respiro sobrevive a isso; um mosaico dá
 * ótima captura de tela e péssima leitura.
 *
 * A **evidência acompanha a recomendação**, como na tela. Um PDF vai parar na
 * mão de quem não estava na conversa, e a frase "aumente a proporção de vídeo"
 * sem o número ao lado vira ordem sem motivo.
 *
 * O rodapé traz de onde vieram os números e quando o arquivo foi gerado.
 * Relatório sem data é relatório que alguém vai confundir com o do mês passado.
 */

const MARGEM = 48;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;

const TINTA = corHex("#1c1917");
const TINTA_FRACA = corHex("#78716c");
const LINHA = corHex("#e7e5e4");
const FUNDO_SUAVE = corHex("#fafaf9");
const MARCA = corHex("#c2410c");
const ACENTO = corHex("#0d9488");
const ALERTA = corHex("#b91c1c");

export type DadosDoRelatorio = {
  titulo: string;
  projeto: string;
  cliente: string;
  periodoInicio: string;
  periodoFim: string;
  geradoEm: Date;
  geradoPor: string;
  resumo: MetricSummary;
  split: OrganicPaidSplit;
  canais: LinhaDoCanal[];
  serie: DailyMetric[];
  recomendacoes: Recomendacao[];
  publicacoes: number;
  /** Como os números entraram: leitura manual, API da rede, ou os dois. */
  origemDosDados: string;
};

/**
 * Controla a posição vertical e vira a página quando o conteúdo acaba.
 *
 * Sem isto, cada bloco precisaria calcular à mão se ainda cabe — que é
 * exatamente o cálculo que alguém esquece e produz um título sozinho no pé da
 * página, com o conteúdo dele na seguinte.
 */
class Fluxo {
  private readonly documento: Documento;
  private readonly aoAbrirPagina: (pagina: Pagina) => void;

  pagina: Pagina;
  y: number;

  constructor(documento: Documento, aoAbrirPagina: (pagina: Pagina) => void) {
    this.documento = documento;
    this.aoAbrirPagina = aoAbrirPagina;
    this.pagina = documento.novaPagina();
    this.y = MARGEM + 24;
    this.aoAbrirPagina(this.pagina);
  }

  /** Garante espaço para um bloco de `altura`, virando a página se preciso. */
  reservar(altura: number): void {
    if (this.y + altura <= ALTURA_PAGINA - MARGEM - 24) return;
    this.pagina = this.documento.novaPagina();
    this.y = MARGEM + 24;
    this.aoAbrirPagina(this.pagina);
  }

  avancar(quanto: number): void {
    this.y += quanto;
  }
}

export function gerarRelatorioPdf(dados: DadosDoRelatorio): Uint8Array {
  const documento = new Documento();
  const paginas: Pagina[] = [];

  const fluxo = new Fluxo(documento, (pagina) => {
    paginas.push(pagina);
    // O cabeçalho fino repete em toda página: quem lê a página 4 solta precisa
    // saber de quem é o relatório.
    pagina.texto(dados.projeto, MARGEM, MARGEM - 14, {
      tamanho: 8,
      cor: TINTA_FRACA,
    });
    pagina.texto(dados.titulo, LARGURA_PAGINA - MARGEM, MARGEM - 14, {
      tamanho: 8,
      cor: TINTA_FRACA,
      alinhamento: "direita",
    });
    pagina.linha(MARGEM, MARGEM - 8, LARGURA_PAGINA - MARGEM, MARGEM - 8, LINHA, 0.5);
  });

  capa(fluxo, dados);
  indicadores(fluxo, dados);
  curvaDeCrescimento(fluxo, dados);
  organicoEPago(fluxo, dados);
  tabelaDeCanais(fluxo, dados);
  recomendacoes(fluxo, dados);

  rodapes(paginas, dados);

  return documento.finalizar({
    titulo: dados.titulo,
    autor: "Ampliação Marketing Digital",
    criadoEm: dados.geradoEm,
  });
}

// --- Blocos -----------------------------------------------------------------

function capa(fluxo: Fluxo, dados: DadosDoRelatorio): void {
  const { pagina } = fluxo;

  pagina.retangulo(MARGEM, fluxo.y, 44, 4, MARCA);
  fluxo.avancar(30);

  pagina.texto(dados.cliente.toUpperCase(), MARGEM, fluxo.y, {
    tamanho: 9,
    cor: MARCA,
    fonte: "negrito",
  });
  fluxo.avancar(26);

  const alturaTitulo = pagina.paragrafo(dados.titulo, MARGEM, fluxo.y, LARGURA_UTIL, {
    tamanho: 26,
    fonte: "negrito",
    cor: TINTA,
    entrelinha: 32,
  });
  fluxo.avancar(alturaTitulo + 6);

  pagina.texto(
    `${formatarDia(dados.periodoInicio)} a ${formatarDia(dados.periodoFim)} · ${dados.canais.length} canal(is)`,
    MARGEM,
    fluxo.y,
    { tamanho: 11, cor: TINTA_FRACA },
  );
  fluxo.avancar(30);
}

function indicadores(fluxo: Fluxo, dados: DadosDoRelatorio): void {
  fluxo.reservar(96);
  titulo(fluxo, "Resumo do período");

  const { pagina } = fluxo;
  const cartoes = [
    {
      rotulo: "Seguidores",
      valor: inteiro(dados.resumo.followers),
      nota: `${comSinal(dados.resumo.followersDelta)} no período`,
      positivo: dados.resumo.followersDelta >= 0,
    },
    {
      rotulo: "Alcance",
      valor: inteiro(dados.resumo.reach),
      nota: `${comSinalPercentual(dados.resumo.reachDelta)} vs. anterior`,
      positivo: dados.resumo.reachDelta >= 0,
    },
    {
      rotulo: "Engajamento",
      valor: inteiro(dados.resumo.engagement),
      nota: `taxa de ${percentual(dados.resumo.engagementRate)}`,
      positivo: dados.resumo.engagementDelta >= 0,
    },
    {
      rotulo: "Investido",
      valor: moeda(dados.resumo.adSpend),
      nota: `${dados.publicacoes} publicação(ões)`,
      positivo: true,
    },
  ];

  const espaco = 10;
  const largura = (LARGURA_UTIL - espaco * 3) / 4;
  const altura = 64;

  cartoes.forEach((cartao, indice) => {
    const x = MARGEM + indice * (largura + espaco);
    pagina.retangulo(x, fluxo.y, largura, altura, FUNDO_SUAVE);
    pagina.contorno(x, fluxo.y, largura, altura, LINHA);

    pagina.texto(cartao.rotulo.toUpperCase(), x + 10, fluxo.y + 16, {
      tamanho: 7,
      cor: TINTA_FRACA,
      fonte: "negrito",
    });
    // O valor é cortado à largura do cartão: um número de sete dígitos não
    // pode invadir o cartão vizinho.
    pagina.textoCortado(cartao.valor, x + 10, fluxo.y + 38, largura - 20, {
      tamanho: 17,
      fonte: "negrito",
      cor: TINTA,
    });
    pagina.textoCortado(cartao.nota, x + 10, fluxo.y + 53, largura - 20, {
      tamanho: 7.5,
      cor: cartao.positivo ? ACENTO : ALERTA,
    });
  });

  fluxo.avancar(altura + 26);
}

function curvaDeCrescimento(fluxo: Fluxo, dados: DadosDoRelatorio): void {
  if (dados.serie.length < 2) return;

  const alturaGrafico = 150;
  fluxo.reservar(alturaGrafico + 50);
  titulo(fluxo, "Curva de seguidores");

  const { pagina } = fluxo;
  const topo = fluxo.y;
  const base = topo + alturaGrafico;

  const valores = dados.serie.map((dia) => dia.followers);
  const maximo = Math.max(...valores);
  const minimo = Math.min(...valores);
  // Uma faixa artificial evita a divisão por zero quando a série é plana — e,
  // de quebra, desenha a linha reta no meio em vez de colada na borda.
  const faixa = maximo - minimo || Math.max(maximo * 0.1, 1);

  pagina.retangulo(MARGEM, topo, LARGURA_UTIL, alturaGrafico, FUNDO_SUAVE);

  // Três linhas de referência com o valor escrito: um gráfico sem escala é
  // desenho, não informação.
  for (let i = 0; i <= 2; i += 1) {
    const y = topo + (alturaGrafico / 2) * i;
    const valor = maximo - (faixa / 2) * i;
    pagina.linha(MARGEM, y, MARGEM + LARGURA_UTIL, y, LINHA, 0.5);
    pagina.texto(compacto(valor), MARGEM + LARGURA_UTIL + 4, y + 3, {
      tamanho: 7,
      cor: TINTA_FRACA,
    });
  }

  const pontos = dados.serie.map((dia, indice) => ({
    x: MARGEM + (indice / (dados.serie.length - 1)) * LARGURA_UTIL,
    y: base - ((dia.followers - minimo) / faixa) * (alturaGrafico - 16) - 8,
  }));

  pagina.area(
    [...pontos, { x: pontos[pontos.length - 1].x, y: base }, { x: pontos[0].x, y: base }],
    MARCA,
    0.12,
  );
  pagina.polilinha(pontos, MARCA, 1.4);

  pagina.texto(formatarDia(dados.serie[0].date), MARGEM, base + 12, {
    tamanho: 7,
    cor: TINTA_FRACA,
  });
  pagina.texto(
    formatarDia(dados.serie[dados.serie.length - 1].date),
    MARGEM + LARGURA_UTIL,
    base + 12,
    { tamanho: 7, cor: TINTA_FRACA, alinhamento: "direita" },
  );

  fluxo.avancar(alturaGrafico + 30);
}

function organicoEPago(fluxo: Fluxo, dados: DadosDoRelatorio): void {
  const total = dados.split.organic.reach + dados.split.paid.reach;
  if (total <= 0) return;

  fluxo.reservar(96);
  titulo(fluxo, "Orgânico e pago");

  const { pagina } = fluxo;
  const fatiaOrganica = dados.split.organic.reach / total;
  const alturaBarra = 22;

  // Uma barra única partida em duas, em vez de duas barras: a comparação que
  // interessa é a proporção entre elas, e proporção se lê melhor lado a lado.
  const larguraOrganica = LARGURA_UTIL * fatiaOrganica;
  pagina.retangulo(MARGEM, fluxo.y, larguraOrganica, alturaBarra, ACENTO);
  pagina.retangulo(
    MARGEM + larguraOrganica,
    fluxo.y,
    LARGURA_UTIL - larguraOrganica,
    alturaBarra,
    MARCA,
  );

  // O rótulo só entra dentro da faixa se couber; senão fica embaixo, para não
  // sair texto claro sobre fundo claro nem letra picotada.
  const rotuloOrganico = `Orgânico ${percentual(fatiaOrganica * 100)}`;
  if (medir(rotuloOrganico, 8, "negrito") + 16 < larguraOrganica) {
    pagina.texto(rotuloOrganico, MARGEM + 8, fluxo.y + 15, {
      tamanho: 8,
      cor: BRANCO,
      fonte: "negrito",
    });
  }
  const rotuloPago = `Pago ${percentual((1 - fatiaOrganica) * 100)}`;
  if (medir(rotuloPago, 8, "negrito") + 16 < LARGURA_UTIL - larguraOrganica) {
    pagina.texto(rotuloPago, MARGEM + larguraOrganica + 8, fluxo.y + 15, {
      tamanho: 8,
      cor: BRANCO,
      fonte: "negrito",
    });
  }

  fluxo.avancar(alturaBarra + 14);

  const linhas = [
    `Orgânico: ${inteiro(dados.split.organic.reach)} de alcance, ${inteiro(dados.split.organic.engagement)} interações`,
    `Pago: ${inteiro(dados.split.paid.reach)} de alcance, ${inteiro(dados.split.paid.engagement)} interações, ${moeda(dados.split.paid.spend)} investidos`,
  ];
  for (const linha of linhas) {
    pagina.texto(linha, MARGEM, fluxo.y, { tamanho: 9, cor: TINTA_FRACA });
    fluxo.avancar(14);
  }

  fluxo.avancar(16);
}

function tabelaDeCanais(fluxo: Fluxo, dados: DadosDoRelatorio): void {
  if (dados.canais.length === 0) return;

  fluxo.reservar(70);
  titulo(fluxo, "Canal a canal");

  const colunas = [
    { rotulo: "Canal", largura: 0.34, alinhamento: "esquerda" as const },
    { rotulo: "Seguidores", largura: 0.17, alinhamento: "direita" as const },
    { rotulo: "Alcance", largura: 0.17, alinhamento: "direita" as const },
    { rotulo: "Engajam.", largura: 0.16, alinhamento: "direita" as const },
    { rotulo: "Investido", largura: 0.16, alinhamento: "direita" as const },
  ];

  const desenharCabecalho = () => {
    const { pagina } = fluxo;
    let x = MARGEM;
    for (const coluna of colunas) {
      const largura = LARGURA_UTIL * coluna.largura;
      pagina.texto(
        coluna.rotulo.toUpperCase(),
        coluna.alinhamento === "direita" ? x + largura : x,
        fluxo.y,
        { tamanho: 7, cor: TINTA_FRACA, fonte: "negrito", alinhamento: coluna.alinhamento },
      );
      x += largura;
    }
    fluxo.avancar(6);
    fluxo.pagina.linha(MARGEM, fluxo.y, MARGEM + LARGURA_UTIL, fluxo.y, LINHA, 0.8);
    fluxo.avancar(14);
  };

  desenharCabecalho();

  for (const canal of dados.canais) {
    // Uma linha de tabela partida entre duas páginas é ilegível; o cabeçalho
    // recomeça junto para a nova página continuar se explicando.
    if (fluxo.y + 30 > ALTURA_PAGINA - MARGEM - 24) {
      fluxo.reservar(1000);
      titulo(fluxo, "Canal a canal (continuação)");
      desenharCabecalho();
    }

    const { pagina } = fluxo;
    const valores = [
      canal.nome,
      inteiro(canal.seguidores),
      compacto(canal.alcance),
      compacto(canal.engajamento),
      moeda(canal.investido),
    ];

    let x = MARGEM;
    valores.forEach((valor, indice) => {
      const coluna = colunas[indice];
      const largura = LARGURA_UTIL * coluna.largura;
      pagina.textoCortado(
        valor,
        coluna.alinhamento === "direita" ? x + largura : x,
        fluxo.y,
        largura - 8,
        {
          tamanho: 9,
          cor: TINTA,
          alinhamento: coluna.alinhamento,
          fonte: indice === 0 ? "negrito" : "normal",
        },
      );
      x += largura;
    });

    fluxo.avancar(12);
    pagina.texto(
      `${canal.handle} · ${percentual(canal.participacao * 100)} do alcance · taxa ${percentual(canal.taxaEngajamento)}`,
      MARGEM,
      fluxo.y,
      { tamanho: 7.5, cor: TINTA_FRACA },
    );
    fluxo.avancar(8);
    pagina.linha(MARGEM, fluxo.y, MARGEM + LARGURA_UTIL, fluxo.y, LINHA, 0.4);
    fluxo.avancar(14);
  }

  fluxo.avancar(12);
}

function recomendacoes(fluxo: Fluxo, dados: DadosDoRelatorio): void {
  fluxo.reservar(70);
  titulo(fluxo, "O que os números sugerem");

  if (dados.recomendacoes.length === 0) {
    fluxo.pagina.paragrafo(
      "Ainda não há base suficiente para uma observação com lastro. Com mais dias de histórico e mais publicações, as sugestões aparecem aqui — apontar caminho sobre dado ralo seria pior que ficar calado.",
      MARGEM,
      fluxo.y,
      LARGURA_UTIL,
      { tamanho: 9.5, cor: TINTA_FRACA },
    );
    fluxo.avancar(40);
    return;
  }

  for (const recomendacao of dados.recomendacoes) {
    const alturaEstimada = alturaDaRecomendacao(recomendacao);
    fluxo.reservar(alturaEstimada);

    const { pagina } = fluxo;
    const inicio = fluxo.y;
    const cor = corDoPeso(recomendacao.peso);

    // Barra vertical colorida à esquerda: identifica a gravidade sem precisar
    // de legenda, e sobrevive à impressão em preto e branco como um traço.
    pagina.retangulo(MARGEM, inicio, 2.5, alturaEstimada - 12, cor);

    const x = MARGEM + 14;
    const largura = LARGURA_UTIL - 14;

    pagina.texto(
      `${recomendacao.area.toUpperCase()} · ${rotuloDoPeso(recomendacao.peso)}`,
      x,
      fluxo.y + 8,
      {
        tamanho: 6.5,
        cor,
        fonte: "negrito",
      },
    );
    fluxo.avancar(20);

    const alturaTitulo = pagina.paragrafo(recomendacao.titulo, x, fluxo.y, largura, {
      tamanho: 11,
      fonte: "negrito",
      cor: TINTA,
      entrelinha: 15,
    });
    fluxo.avancar(alturaTitulo + 2);

    const alturaAcao = pagina.paragrafo(recomendacao.acao, x, fluxo.y, largura, {
      tamanho: 9,
      cor: TINTA,
      entrelinha: 13,
    });
    fluxo.avancar(alturaAcao + 4);

    const alturaEvidencia = pagina.paragrafo(recomendacao.evidencia, x, fluxo.y, largura, {
      tamanho: 8,
      cor: TINTA_FRACA,
      entrelinha: 11,
    });
    fluxo.avancar(alturaEvidencia + 18);
  }
}

/** Quanto uma recomendação vai ocupar, para decidir a quebra de página antes. */
function alturaDaRecomendacao(recomendacao: Recomendacao): number {
  const largura = LARGURA_UTIL - 14;
  const linhasTitulo = Math.ceil(medir(recomendacao.titulo, 11, "negrito") / largura);
  const linhasAcao = Math.ceil(medir(recomendacao.acao, 9) / largura);
  const linhasEvidencia = Math.ceil(medir(recomendacao.evidencia, 8) / largura);
  return 20 + linhasTitulo * 15 + linhasAcao * 13 + linhasEvidencia * 11 + 24;
}

function rodapes(paginas: Pagina[], dados: DadosDoRelatorio): void {
  const y = ALTURA_PAGINA - MARGEM + 12;

  paginas.forEach((pagina, indice) => {
    pagina.linha(MARGEM, y - 12, LARGURA_PAGINA - MARGEM, y - 12, LINHA, 0.5);

    pagina.texto(
      `Gerado em ${formatarDataHora(dados.geradoEm)} por ${dados.geradoPor} · ${dados.origemDosDados}`,
      MARGEM,
      y,
      { tamanho: 7, cor: TINTA_FRACA },
    );
    pagina.texto(`${indice + 1} de ${paginas.length}`, LARGURA_PAGINA - MARGEM, y, {
      tamanho: 7,
      cor: TINTA_FRACA,
      alinhamento: "direita",
    });
  });
}

// --- Auxiliares -------------------------------------------------------------

function titulo(fluxo: Fluxo, texto: string): void {
  fluxo.pagina.texto(texto.toUpperCase(), MARGEM, fluxo.y, {
    tamanho: 8,
    cor: TINTA_FRACA,
    fonte: "negrito",
  });
  fluxo.avancar(18);
}

function corDoPeso(peso: Recomendacao["peso"]): Cor {
  if (peso === "risco") return ALERTA;
  if (peso === "atencao") return MARCA;
  return ACENTO;
}

function rotuloDoPeso(peso: Recomendacao["peso"]): string {
  if (peso === "risco") return "RISCO";
  if (peso === "atencao") return "ATENÇÃO";
  return "OPORTUNIDADE";
}

function inteiro(valor: number): string {
  return Math.round(valor).toLocaleString("pt-BR");
}

function compacto(valor: number): string {
  const arredondado = Math.round(valor);
  if (Math.abs(arredondado) < 10_000) return arredondado.toLocaleString("pt-BR");
  if (Math.abs(arredondado) < 1_000_000) {
    return `${(arredondado / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `${(arredondado / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
}

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percentual(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function comSinal(valor: number): string {
  return `${valor >= 0 ? "+" : ""}${inteiro(valor)}`;
}

function comSinalPercentual(valor: number): string {
  return `${valor >= 0 ? "+" : ""}${percentual(valor)}`;
}

/** "2026-08-12" → "12/08/2026", sem passar por Date e sem sofrer com fuso. */
function formatarDia(dia: string): string {
  const [ano, mes, data] = dia.split("-");
  return `${data}/${mes}/${ano}`;
}

function formatarDataHora(data: Date): string {
  const dois = (valor: number) => String(valor).padStart(2, "0");
  return (
    `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()} ` +
    `às ${dois(data.getHours())}h${dois(data.getMinutes())}`
  );
}
