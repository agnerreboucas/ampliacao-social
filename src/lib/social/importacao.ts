import type { DailyMetric, ValoresManuais } from "./types";

/**
 * Importação do histórico a partir de uma planilha.
 *
 * Digitar um ano de números dia a dia não é viável, e é exatamente isso que
 * separa uma plataforma vazia de uma plataforma útil no primeiro dia. Aqui entra
 * o arquivo que já existe — exportação do Meta Business Suite, planilha do
 * Google, CSV do agregador — e vira histórico.
 *
 * O módulo é inteiro sobre **desconfiar do arquivo**. Planilha de cliente vem
 * com cabeçalho em português ou em inglês, número com vírgula ou com ponto,
 * data em três formatos, coluna a mais, linha em branco no meio e o total na
 * última linha. Nada disso pode virar dado errado em silêncio: cada linha que
 * não dá para entender vira um problema com o número da linha, e a tela mostra
 * tudo antes de gravar qualquer coisa.
 *
 * As duas armadilhas que motivam metade do código:
 *
 * **"1.234" é mil duzentos e trinta e quatro ou é um vírgula dois?** Depende do
 * país de quem exportou. A regra adotada olha quantos dígitos vêm depois do
 * separador: três dígitos e nada mais é separador de milhar; qualquer outra
 * quantidade é decimal. Acerta "1.234" (mil) e "35.50" (trinta e cinco e meio)
 * sem precisar saber de que campo se trata.
 *
 * **"03/04/2026" é 3 de abril ou 4 de março?** Em vez de supor, o módulo lê o
 * arquivo inteiro primeiro: se em algum lugar o primeiro número passa de 12, a
 * ordem é dia/mês; se o segundo passa, é mês/dia. A ordem detectada é devolvida
 * para a tela mostrar — supor errado desloca o histórico inteiro em silêncio.
 *
 * Módulo puro: recebe texto, devolve um plano. Não grava nada.
 */

/** Os campos que a planilha pode preencher, além da data. */
export type CampoImportavel = keyof ValoresManuais;

/**
 * Nomes de coluna aceitos para cada campo.
 *
 * A lista é generosa de propósito. O custo de aceitar um sinônimo a mais é
 * quase zero; o custo de recusar o cabeçalho que o cliente tem é a pessoa
 * desistir da importação e digitar tudo à mão.
 */
const SINONIMOS: Record<CampoImportavel | "date", string[]> = {
  date: ["data", "dia", "date", "day", "periodo", "período", "data do dia", "reference date"],
  followers: [
    "seguidores",
    "followers",
    "total de seguidores",
    "seguidores totais",
    "follower count",
    "fas",
    "fãs",
    "curtidas da pagina",
    "curtidas da página",
    "inscritos",
    "subscribers",
  ],
  organicReach: [
    "alcance organico",
    "alcance orgânico",
    "organic reach",
    "alcance nao pago",
    "alcance não pago",
    "contas alcancadas organico",
    "contas alcançadas orgânico",
  ],
  paidReach: ["alcance pago", "paid reach", "alcance de anuncios", "alcance de anúncios"],
  organicImpressions: [
    "impressoes organicas",
    "impressões orgânicas",
    "organic impressions",
    "visualizacoes organicas",
    "visualizações orgânicas",
  ],
  paidImpressions: [
    "impressoes pagas",
    "impressões pagas",
    "paid impressions",
    "impressoes de anuncios",
    "impressões de anúncios",
  ],
  organicEngagement: [
    "engajamento organico",
    "engajamento orgânico",
    "organic engagement",
    "interacoes organicas",
    "interações orgânicas",
    "envolvimento organico",
    "envolvimento orgânico",
  ],
  paidEngagement: ["engajamento pago", "paid engagement", "interacoes pagas", "interações pagas"],
  adSpend: [
    "investimento",
    "investido",
    "valor gasto",
    "gasto",
    "ad spend",
    "amount spent",
    "spend",
    "custo",
    "verba",
  ],
};

export const CAMPOS_IMPORTAVEIS = Object.keys(SINONIMOS).filter(
  (chave) => chave !== "date",
) as CampoImportavel[];

/** Rótulo humano de cada campo, para a tela de conferência. */
export const ROTULOS: Record<CampoImportavel | "date", string> = {
  date: "Data",
  followers: "Seguidores",
  organicReach: "Alcance orgânico",
  paidReach: "Alcance pago",
  organicImpressions: "Impressões orgânicas",
  paidImpressions: "Impressões pagas",
  organicEngagement: "Engajamento orgânico",
  paidEngagement: "Engajamento pago",
  adSpend: "Investimento",
};

export type Problema = {
  /** Linha no arquivo, contando o cabeçalho como 1. */
  linha: number;
  mensagem: string;
};

export type LinhaImportada = {
  linha: number;
  date: string;
  valores: ValoresManuais;
};

export type OrdemDaData = "dia-mes" | "mes-dia" | "iso" | "indefinida";

export type Plano = {
  /** Cabeçalho do arquivo → campo reconhecido, ou `null` quando ignorado. */
  colunas: { cabecalho: string; campo: CampoImportavel | "date" | null }[];
  linhas: LinhaImportada[];
  /**
   * Os campos que o arquivo realmente traz.
   *
   * Guardado porque uma planilha só de seguidores não pode zerar o alcance já
   * medido daquele dia. Sem esta lista, importar um recorte apagaria em
   * silêncio tudo o que o recorte não menciona — e o estrago só apareceria
   * semanas depois, num gráfico com um buraco.
   */
  camposPresentes: CampoImportavel[];
  problemas: Problema[];
  /** Dias que já existem e serão reescritos. */
  conflitos: string[];
  ordemDaData: OrdemDaData;
  primeiroDia: string | null;
  ultimoDia: string | null;
  /** `false` quando falta o essencial e não dá para seguir. */
  utilizavel: boolean;
};

// --- Leitura do texto -------------------------------------------------------

/**
 * Descobre o separador contando ocorrências na primeira linha.
 *
 * Planilha brasileira salva em CSV costuma usar ponto e vírgula, porque a
 * vírgula já é o separador decimal. Supor vírgula quebraria o caso mais comum
 * do público deste produto.
 */
export function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/).find((linha) => linha.trim().length > 0) ?? "";
  const candidatos = [";", "\t", ","];
  let melhor = ";";
  let maior = -1;

  for (const candidato of candidatos) {
    const quantidade = primeira.split(candidato).length - 1;
    if (quantidade > maior) {
      maior = quantidade;
      melhor = candidato;
    }
  }
  return maior > 0 ? melhor : ";";
}

/**
 * Divide o texto em células, respeitando aspas.
 *
 * Sem tratar aspas, uma legenda com o separador dentro desloca a linha inteira
 * e todos os números vão para a coluna errada — o pior tipo de erro, porque não
 * parece erro.
 */
export function lerTabela(texto: string, separador = detectarSeparador(texto)): string[][] {
  const linhas: string[][] = [];
  let celula = "";
  let atual: string[] = [];
  let dentroDeAspas = false;

  const fecharCelula = () => {
    atual.push(celula.trim());
    celula = "";
  };
  const fecharLinha = () => {
    fecharCelula();
    if (atual.some((valor) => valor.length > 0)) linhas.push(atual);
    atual = [];
  };

  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];

    if (dentroDeAspas) {
      // Aspas duplicadas dentro do campo representam uma aspa literal.
      if (caractere === '"' && texto[i + 1] === '"') {
        celula += '"';
        i += 1;
      } else if (caractere === '"') {
        dentroDeAspas = false;
      } else {
        celula += caractere;
      }
      continue;
    }

    if (caractere === '"') dentroDeAspas = true;
    else if (caractere === separador) fecharCelula();
    else if (caractere === "\n") fecharLinha();
    else if (caractere !== "\r") celula += caractere;
  }
  fecharLinha();

  return linhas;
}

// --- Interpretação de cada célula -------------------------------------------

/** Tira acento, caixa e pontuação para comparar cabeçalhos. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function reconhecerColuna(cabecalho: string): CampoImportavel | "date" | null {
  const alvo = normalizar(cabecalho);
  if (!alvo) return null;

  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    if (nomes.some((nome) => normalizar(nome) === alvo)) {
      return campo as CampoImportavel | "date";
    }
  }
  return null;
}

/**
 * Converte um número escrito em qualquer uma das duas convenções.
 *
 * Ver a nota do topo sobre "1.234". Devolve `null` quando não é número — o que
 * é diferente de zero, e por isso vira problema em vez de virar dado.
 */
export function interpretarNumero(bruto: string): number | null {
  // O espaço não separável (\u00a0) merece menção: planilha exportada do Excel
  // em português usa ele como separador de milhar, e ele não casa com \s em
  // todos os motores. Sem tirá-lo, "12 345" viraria problema em vez de 12345.
  const limpo = bruto
    .replace(/R\$|%/gi, "")
    .replace(/[\s\u00a0]/g, "")
    .trim();
  if (!limpo) return null;
  if (!/^-?[\d.,]+$/.test(limpo)) return null;

  const negativo = limpo.startsWith("-");
  const corpo = negativo ? limpo.slice(1) : limpo;

  const temPonto = corpo.includes(".");
  const temVirgula = corpo.includes(",");

  let normalizado: string;
  if (temPonto && temVirgula) {
    // O separador que aparece por último é o decimal.
    normalizado =
      corpo.lastIndexOf(",") > corpo.lastIndexOf(".")
        ? corpo.replace(/\./g, "").replace(",", ".")
        : corpo.replace(/,/g, "");
  } else if (temVirgula) {
    // Vírgula sozinha é decimal em português; como separador de milhar sempre
    // vem em grupos de três, esse caso também é tratado.
    normalizado = /^\d{1,3}(,\d{3})+$/.test(corpo)
      ? corpo.replace(/,/g, "")
      : corpo.replace(",", ".");
  } else if (temPonto) {
    normalizado = /^\d{1,3}(\.\d{3})+$/.test(corpo) ? corpo.replace(/\./g, "") : corpo;
  } else {
    normalizado = corpo;
  }

  const valor = Number(normalizado);
  if (!Number.isFinite(valor)) return null;
  return negativo ? -valor : valor;
}

/** As três partes de uma data, ainda sem decidir qual é dia e qual é mês. */
function partesDaData(bruto: string): { a: number; b: number; ano: number; iso: boolean } | null {
  const limpo = bruto.trim();
  if (!limpo) return null;

  const isoCompleto = limpo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoCompleto) {
    return {
      a: Number(isoCompleto[3]),
      b: Number(isoCompleto[2]),
      ano: Number(isoCompleto[1]),
      iso: true,
    };
  }

  const separado = limpo.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (separado) {
    const ano = Number(separado[3]);
    return {
      a: Number(separado[1]),
      b: Number(separado[2]),
      // Ano de dois dígitos: 26 vira 2026. Planilha antiga com "99" viraria
      // 2099, mas histórico de rede social não vem do século passado.
      ano: ano < 100 ? 2000 + ano : ano,
      iso: false,
    };
  }
  return null;
}

/**
 * Decide se as datas do arquivo estão em dia/mês ou mês/dia.
 *
 * Olha o arquivo inteiro antes de converter qualquer linha: basta um dia acima
 * de 12 em qualquer lugar para a ordem ficar provada.
 */
export function detectarOrdemDaData(valores: string[]): OrdemDaData {
  let temIso = false;
  let primeiroPassaDe12 = false;
  let segundoPassaDe12 = false;

  for (const valor of valores) {
    const partes = partesDaData(valor);
    if (!partes) continue;
    if (partes.iso) {
      temIso = true;
      continue;
    }
    if (partes.a > 12) primeiroPassaDe12 = true;
    if (partes.b > 12) segundoPassaDe12 = true;
  }

  if (primeiroPassaDe12 && segundoPassaDe12) return "indefinida";
  if (primeiroPassaDe12) return "dia-mes";
  if (segundoPassaDe12) return "mes-dia";
  if (temIso) return "iso";
  // Nenhum número acima de 12 em nenhuma linha: não há como provar. O padrão
  // brasileiro é o palpite certo para o público deste produto, e a tela informa
  // que foi um palpite.
  return "dia-mes";
}

/** Converte para "AAAA-MM-DD" usando a ordem já decidida. */
export function interpretarData(bruto: string, ordem: OrdemDaData): string | null {
  const partes = partesDaData(bruto);
  if (!partes) return null;

  const dia = partes.iso || ordem !== "mes-dia" ? partes.a : partes.b;
  const mes = partes.iso || ordem !== "mes-dia" ? partes.b : partes.a;

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  // Rejeita 31 de fevereiro em vez de deixar o Date "corrigir" para 3 de março.
  const data = new Date(Date.UTC(partes.ano, mes - 1, dia));
  if (data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;

  return `${partes.ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// --- Montagem do plano ------------------------------------------------------

const VALORES_ZERADOS: ValoresManuais = {
  followers: 0,
  organicReach: 0,
  paidReach: 0,
  organicImpressions: 0,
  paidImpressions: 0,
  organicEngagement: 0,
  paidEngagement: 0,
  adSpend: 0,
};

/**
 * Lê o arquivo e monta o que seria gravado, sem gravar.
 *
 * `diasExistentes` são os dias que a conta já tem, para o plano poder avisar
 * quantos serão reescritos. Sobrescrever é o comportamento certo — a planilha é
 * a fonte mais recente —, mas precisa ser dito antes, não descoberto depois.
 */
export function montarPlano(texto: string, diasExistentes: string[] = []): Plano {
  const tabela = lerTabela(texto);

  if (tabela.length < 2) {
    return {
      colunas: [],
      linhas: [],
      camposPresentes: [],
      problemas: [{ linha: 1, mensagem: "O arquivo não tem cabeçalho e pelo menos uma linha." }],
      conflitos: [],
      ordemDaData: "indefinida",
      primeiroDia: null,
      ultimoDia: null,
      utilizavel: false,
    };
  }

  const [cabecalhos, ...corpo] = tabela;
  const colunas = cabecalhos.map((cabecalho) => ({
    cabecalho,
    campo: reconhecerColuna(cabecalho),
  }));

  const indiceDaData = colunas.findIndex((coluna) => coluna.campo === "date");
  const camposEncontrados = colunas
    .map((coluna) => coluna.campo)
    .filter((campo): campo is CampoImportavel => campo !== null && campo !== "date");

  const problemas: Problema[] = [];

  if (indiceDaData === -1) {
    problemas.push({
      linha: 1,
      mensagem: `Nenhuma coluna de data encontrada. Renomeie a coluna para "Data". Colunas lidas: ${cabecalhos.join(", ")}`,
    });
  }
  if (camposEncontrados.length === 0) {
    problemas.push({
      linha: 1,
      mensagem: `Nenhuma coluna de número reconhecida. Aceitos: ${CAMPOS_IMPORTAVEIS.map((campo) => ROTULOS[campo]).join(", ")}.`,
    });
  }

  if (indiceDaData === -1 || camposEncontrados.length === 0) {
    return {
      colunas,
      linhas: [],
      camposPresentes: [],
      problemas,
      conflitos: [],
      ordemDaData: "indefinida",
      primeiroDia: null,
      ultimoDia: null,
      utilizavel: false,
    };
  }

  const ordemDaData = detectarOrdemDaData(corpo.map((linha) => linha[indiceDaData] ?? ""));
  if (ordemDaData === "indefinida") {
    problemas.push({
      linha: 1,
      mensagem:
        "As datas do arquivo se contradizem: umas parecem dia/mês e outras mês/dia. Converta a coluna para AAAA-MM-DD antes de importar.",
    });
    return {
      colunas,
      linhas: [],
      camposPresentes: [],
      problemas,
      conflitos: [],
      ordemDaData,
      primeiroDia: null,
      ultimoDia: null,
      utilizavel: false,
    };
  }

  // Por data, para a última ocorrência vencer quando o arquivo repete o dia.
  const porData = new Map<string, LinhaImportada>();

  corpo.forEach((celulas, indice) => {
    const numeroDaLinha = indice + 2;
    const brutoData = celulas[indiceDaData] ?? "";

    // Linha de total no fim da planilha: sem data e com números. Ignorar em
    // silêncio é melhor que acusar erro, porque o arquivo está certo.
    if (!brutoData.trim()) return;

    const date = interpretarData(brutoData, ordemDaData);
    if (!date) {
      problemas.push({
        linha: numeroDaLinha,
        mensagem: `Data não reconhecida: "${brutoData}".`,
      });
      return;
    }

    const valores: ValoresManuais = { ...VALORES_ZERADOS };
    let algumValor = false;

    colunas.forEach((coluna, posicao) => {
      if (!coluna.campo || coluna.campo === "date") return;
      const bruto = celulas[posicao] ?? "";
      // Célula vazia vira zero sem reclamar: planilha de rede social tem buraco
      // em coluna que a rede não reporta, e recusar o arquivo por isso seria
      // recusar quase todos.
      if (!bruto.trim()) return;

      const numero = interpretarNumero(bruto);
      if (numero === null) {
        problemas.push({
          linha: numeroDaLinha,
          mensagem: `"${bruto}" não é um número, na coluna ${coluna.cabecalho}.`,
        });
        return;
      }
      if (numero < 0) {
        problemas.push({
          linha: numeroDaLinha,
          mensagem: `Valor negativo em ${coluna.cabecalho}: ${bruto}.`,
        });
        return;
      }

      valores[coluna.campo] = coluna.campo === "adSpend" ? numero : Math.round(numero);
      algumValor = true;
    });

    if (!algumValor) return;
    porData.set(date, { linha: numeroDaLinha, date, valores });
  });

  const linhas = [...porData.values()].sort((a, b) => a.date.localeCompare(b.date));
  const existentes = new Set(diasExistentes);

  return {
    colunas,
    linhas,
    camposPresentes: [...new Set(camposEncontrados)],
    problemas,
    conflitos: linhas.map((linha) => linha.date).filter((date) => existentes.has(date)),
    ordemDaData,
    primeiroDia: linhas[0]?.date ?? null,
    ultimoDia: linhas[linhas.length - 1]?.date ?? null,
    utilizavel: linhas.length > 0,
  };
}

/**
 * Aplica o plano a uma série existente.
 *
 * Ganho e perda de seguidores são recalculados **do começo ao fim** depois de
 * inserir tudo, e não linha a linha. Aplicar dia a dia daria números errados no
 * meio: o dia importado enxergaria como anterior um dia que a própria
 * importação está prestes a substituir.
 */
export function aplicarPlano(serie: DailyMetric[], plano: Plano): DailyMetric[] {
  const porData = new Map(serie.map((dia) => [dia.date, { ...dia }]));

  for (const linha of plano.linhas) {
    const base: DailyMetric = porData.get(linha.date) ?? {
      date: linha.date,
      followers: 0,
      followersGained: 0,
      followersLost: 0,
      organicReach: 0,
      paidReach: 0,
      organicImpressions: 0,
      paidImpressions: 0,
      organicEngagement: 0,
      paidEngagement: 0,
      adSpend: 0,
    };

    // Só os campos que vieram no arquivo são tocados. Ver a nota em
    // `camposPresentes`: escrever os oito sempre apagaria o que a planilha não
    // mencionou.
    for (const campo of plano.camposPresentes) {
      base[campo] = linha.valores[campo];
    }

    porData.set(linha.date, base);
  }

  const ordenada = [...porData.values()].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < ordenada.length; i += 1) {
    const anterior = ordenada[i - 1];
    const diferenca = anterior ? ordenada[i].followers - anterior.followers : 0;
    ordenada[i].followersGained = diferenca > 0 ? diferenca : 0;
    ordenada[i].followersLost = diferenca < 0 ? -diferenca : 0;
  }

  return ordenada;
}

/** Uma frase sobre o que vai acontecer, para a tela de conferência. */
export function resumirPlano(plano: Plano): string {
  if (!plano.utilizavel) return "Nada a importar.";

  const novos = plano.linhas.length - plano.conflitos.length;
  const partes = [`${plano.linhas.length} dia(s) no arquivo`];
  if (novos > 0) partes.push(`${novos} novo(s)`);
  if (plano.conflitos.length > 0)
    partes.push(`${plano.conflitos.length} que já existe(m) e será(ão) reescrito(s)`);

  return `${partes.join(", ")}. Período de ${plano.primeiroDia} a ${plano.ultimoDia}.`;
}
