import { NOME_DO_FORMATO, type PecaAvaliada } from "./conteudo.ts";
import type { NetworkId, PostFormat } from "./types.ts";

/**
 * Quando publicar.
 *
 * A pergunta que este módulo responde é a mais repetida de qualquer equipe de
 * conteúdo — "que horas é melhor postar?" — e a resposta honesta quase nunca é
 * um horário só. É um mapa: dia da semana contra faixa do dia, com quantas
 * peças sustentam cada casa.
 *
 * Três decisões governam tudo aqui.
 *
 * **A conclusão sai de blocos de três horas; a inspeção pode ir à hora cheia.**
 * Sete dias por vinte e quatro horas são cento e sessenta e oito casas. Trinta
 * publicações espalhadas ali dão, no melhor caso, uma peça por casa — e uma peça
 * não é uma média, é um acaso com aparência de conclusão. Por isso tudo o que
 * vira recomendação (`melhoresHorarios`, `melhoresBlocos`, o mapa de calor)
 * trabalha em oito blocos por dia, que é também como a decisão é tomada de
 * verdade: "de manhã ou no fim da tarde?". O eixo de hora cheia existe só no
 * gráfico, para **olhar** — vinte e quatro barras finas mostram se o que rende
 * é o bloco todo ou uma ponta dele —, e ali cada faixa vem com o tamanho da
 * amostra do lado, porque uma barra alta feita de uma peça continua sendo uma
 * peça.
 *
 * **A ordenação é por alcance, não por taxa de engajamento.** Escolher horário
 * é escolher quando a rede vai distribuir a peça; alcance é a medida disso. A
 * taxa mede mais a qualidade do conteúdo do que o horário — um carrossel ótimo
 * publicado às três da manhã tem taxa alta sobre um alcance minúsculo, e
 * ordenar por taxa colocaria a madrugada em primeiro lugar. A taxa aparece ao
 * lado, porque ela responde a outra pergunta boa.
 *
 * **Amostra pequena não vira recomendação, mas também não some.** Uma casa com
 * uma peça é marcada como não confiável e continua visível. Esconder faria o
 * mapa mentir sobre o que existe, e a pessoa concluiria que nunca se publicou
 * naquele horário quando o caso é que se publicou pouco.
 *
 * Módulo puro.
 */

/** Um bloco de três horas do dia. */
export type Bloco = { indice: number; de: number; ate: number; rotulo: string };

export const BLOCOS: Bloco[] = [
  { indice: 0, de: 0, ate: 2, rotulo: "0h–3h" },
  { indice: 1, de: 3, ate: 5, rotulo: "3h–6h" },
  { indice: 2, de: 6, ate: 8, rotulo: "6h–9h" },
  { indice: 3, de: 9, ate: 11, rotulo: "9h–12h" },
  { indice: 4, de: 12, ate: 14, rotulo: "12h–15h" },
  { indice: 5, de: 15, ate: 17, rotulo: "15h–18h" },
  { indice: 6, de: 18, ate: 20, rotulo: "18h–21h" },
  { indice: 7, de: 21, ate: 23, rotulo: "21h–0h" },
];

export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function blocoDaHora(hora: number): Bloco {
  return BLOCOS[Math.min(Math.floor(hora / 3), BLOCOS.length - 1)];
}

/** Uma casa do mapa: um dia da semana cruzado com um bloco do dia. */
export type Casa = {
  dia: number;
  bloco: number;
  pecas: number;
  alcanceMedio: number;
  taxaMedia: number;
  /**
   * Quanto o alcance desta casa fica acima ou abaixo da média geral, em
   * porcentagem. É o número que responde "vale a pena publicar aqui?".
   */
  contraMedia: number;
  /** Falso quando há peças de menos para a média significar alguma coisa. */
  confiavel: boolean;
};

export type MapaDeHorarios = {
  casas: Casa[];
  /** Alcance médio de todas as peças consideradas — a régua de comparação. */
  alcanceMedio: number;
  /** Quantas peças sustentam o mapa inteiro. */
  pecas: number;
  /** O maior alcance médio entre as casas confiáveis, para a escala de cor. */
  maiorAlcance: number;
};

export type OpcoesDoMapa = {
  /** Abaixo disto, a casa existe mas não vira recomendação. Padrão: 2. */
  minimoDePecas?: number;
};

/**
 * O mapa inteiro: uma casa por dia da semana e bloco, mesmo as vazias.
 *
 * As casas vazias vêm no resultado de propósito. Um mapa de calor com buracos
 * não se lê — o olho precisa da grade completa para comparar linhas e colunas,
 * e "nunca publicamos nesse horário" é informação, não ausência dela.
 */
export function mapaDeHorarios(
  pecas: PecaAvaliada[],
  { minimoDePecas = 2 }: OpcoesDoMapa = {},
): MapaDeHorarios {
  const consideradas = pecas.filter((peca) => peca.diaDaSemana !== null && peca.hora !== null);

  const alcanceMedio =
    consideradas.length > 0
      ? consideradas.reduce((soma, peca) => soma + peca.alcance, 0) / consideradas.length
      : 0;

  const acumulado = new Map<string, PecaAvaliada[]>();
  for (const peca of consideradas) {
    const chave = `${peca.diaDaSemana}:${blocoDaHora(peca.hora!).indice}`;
    const lista = acumulado.get(chave) ?? [];
    lista.push(peca);
    acumulado.set(chave, lista);
  }

  const casas: Casa[] = [];
  for (let dia = 0; dia < 7; dia += 1) {
    for (const bloco of BLOCOS) {
      const doGrupo = acumulado.get(`${dia}:${bloco.indice}`) ?? [];
      casas.push(resumirCasa(dia, bloco.indice, doGrupo, alcanceMedio, minimoDePecas));
    }
  }

  const maiorAlcance = casas
    .filter((casa) => casa.confiavel)
    .reduce((maior, casa) => Math.max(maior, casa.alcanceMedio), 0);

  return { casas, alcanceMedio, pecas: consideradas.length, maiorAlcance };
}

function resumirCasa(
  dia: number,
  bloco: number,
  doGrupo: PecaAvaliada[],
  alcanceMedio: number,
  minimoDePecas: number,
): Casa {
  if (doGrupo.length === 0) {
    return {
      dia,
      bloco,
      pecas: 0,
      alcanceMedio: 0,
      taxaMedia: 0,
      contraMedia: 0,
      confiavel: false,
    };
  }

  const media = doGrupo.reduce((soma, peca) => soma + peca.alcance, 0) / doGrupo.length;
  const taxa = doGrupo.reduce((soma, peca) => soma + peca.taxa, 0) / doGrupo.length;

  return {
    dia,
    bloco,
    pecas: doGrupo.length,
    alcanceMedio: media,
    taxaMedia: taxa,
    contraMedia: alcanceMedio > 0 ? (media / alcanceMedio - 1) * 100 : 0,
    confiavel: doGrupo.length >= minimoDePecas,
  };
}

/** Uma recomendação de horário, pronta para virar frase na tela. */
export type Recomendacao = Casa & {
  /** "quinta-feira, 18h–21h" */
  quando: string;
};

export type OpcoesDaRecomendacao = OpcoesDoMapa & {
  /** Quantas devolver. Padrão: 3. */
  quantidade?: number;
};

/**
 * Os melhores horários, do melhor para o pior.
 *
 * Só casas confiáveis entram — recomendar a partir de uma publicação seria
 * transformar sorte em conselho. Se nenhuma casa alcançar o mínimo, a lista
 * volta vazia, e é isso que a tela precisa dizer: ainda não há histórico
 * suficiente.
 */
export function melhoresHorarios(
  pecas: PecaAvaliada[],
  { quantidade = 3, ...opcoes }: OpcoesDaRecomendacao = {},
): Recomendacao[] {
  return mapaDeHorarios(pecas, opcoes)
    .casas.filter((casa) => casa.confiavel && casa.pecas > 0)
    .sort((a, b) => b.alcanceMedio - a.alcanceMedio)
    .slice(0, quantidade)
    .map((casa) => ({ ...casa, quando: descreverQuando(casa) }));
}

export function descreverQuando(casa: Pick<Casa, "dia" | "bloco">): string {
  return `${DIAS_LONGOS[casa.dia]}, ${BLOCOS[casa.bloco].rotulo}`;
}

/**
 * O mesmo, mas só pelo horário — sem separar por dia da semana.
 *
 * Existe porque a amostra de uma campanha nova raramente sustenta o cruzamento
 * dia × bloco. Somando os sete dias, cada bloco recebe sete vezes mais peças, e
 * "no fim da tarde rende mais" vira uma conclusão defensável muito antes de
 * "na quinta-feira no fim da tarde".
 */
export function melhoresBlocos(
  pecas: PecaAvaliada[],
  { minimoDePecas = 3, quantidade = 3 }: OpcoesDaRecomendacao = {},
): Recomendacao[] {
  return blocosDoDia(pecas, { minimoDePecas })
    .filter((casa) => casa.confiavel && casa.pecas > 0)
    .sort((a, b) => b.alcanceMedio - a.alcanceMedio)
    .slice(0, quantidade);
}

/**
 * Os oito blocos do dia, na ordem do relógio e sem filtro.
 *
 * `melhoresBlocos` devolve só o pódio, que é o que vira recomendação. Para
 * **comparar** o dia inteiro — o alcance da campanha contra a atividade do
 * público, faixa por faixa — é preciso a régua completa: um gráfico que mostra
 * apenas os três melhores blocos faz as outras cinco faixas parecerem sem
 * alcance nenhum, quando o caso pode ser que tenham alcance médio.
 */
export function blocosDoDia(
  pecas: PecaAvaliada[],
  { minimoDePecas = 3 }: OpcoesDoMapa = {},
): Recomendacao[] {
  const consideradas = pecas.filter((peca) => peca.hora !== null);
  const alcanceMedio =
    consideradas.length > 0
      ? consideradas.reduce((soma, peca) => soma + peca.alcance, 0) / consideradas.length
      : 0;

  return BLOCOS.map((bloco) => {
    const doGrupo = consideradas.filter((peca) => blocoDaHora(peca.hora!).indice === bloco.indice);
    // `dia: -1` marca "todos os dias" — a casa não é de um dia da semana.
    const casa = resumirCasa(-1, bloco.indice, doGrupo, alcanceMedio, minimoDePecas);
    return { ...casa, quando: bloco.rotulo };
  });
}

export type HorariosDoFormato = {
  formato: PostFormat;
  rotulo: string;
  pecas: number;
  /** Vazio quando o formato não tem peças suficientes para concluir nada. */
  melhores: Recomendacao[];
  /** Por que ainda não dá para recomendar, quando é o caso. */
  ressalva?: string;
};

/**
 * O melhor horário de cada tipo de conteúdo.
 *
 * É a pergunta certa a fazer, porque a resposta muda de verdade entre formatos:
 * story é consumido no intervalo do dia e reels à noite, e um horário único
 * para tudo joga fora essa diferença. O preço é a amostra — dividir trinta
 * peças por quatro formatos deixa pouco em cada um —, e por isso o corte aqui é
 * por bloco do dia, sem cruzar com o dia da semana.
 *
 * Formato sem amostra suficiente volta com `ressalva` em vez de sumir: a
 * ausência de recomendação é ela própria a informação de que falta publicar
 * mais naquele formato para saber.
 */
export function horariosPorFormato(
  pecas: PecaAvaliada[],
  { minimoDePecas = 3, quantidade = 2 }: OpcoesDaRecomendacao = {},
): HorariosDoFormato[] {
  const formatos = [...new Set(pecas.map((peca) => peca.post.format))];

  return formatos
    .map((formato) => {
      const doFormato = pecas.filter((peca) => peca.post.format === formato);
      const melhores = melhoresBlocos(doFormato, { minimoDePecas, quantidade });

      return {
        formato,
        rotulo: NOME_DO_FORMATO[formato],
        pecas: doFormato.length,
        melhores,
        ...(melhores.length === 0
          ? {
              ressalva:
                doFormato.length < minimoDePecas
                  ? `Só ${doFormato.length} ${doFormato.length === 1 ? "peça publicada" : "peças publicadas"} neste formato — pouco para concluir.`
                  : "As publicações deste formato estão espalhadas demais pelos horários para apontar um melhor.",
            }
          : {}),
      };
    })
    .sort((a, b) => b.pecas - a.pecas);
}

// --- Quando o público está online -------------------------------------------

/**
 * A atividade do público por bloco do dia.
 *
 * É **outro** dado, e é o que fecha a pergunta. `mapaDeHorarios` diz quando as
 * peças da campanha renderam; isto diz quando as pessoas estão na rede, e vem
 * do perfil de público que a própria plataforma social devolve — não do que a
 * gente publicou.
 *
 * Cruzar os dois é o que produz a conclusão acionável: "o público está online no
 * fim da tarde e a campanha publica de manhã" é um problema que nenhum dos dois
 * números mostra sozinho.
 */
export type AtividadeDoBloco = {
  bloco: number;
  rotulo: string;
  /** Soma da atividade das horas do bloco, como a rede a informa. */
  atividade: number;
  /** Fatia deste bloco no total do dia, de 0 a 1. */
  fatia: number;
};

export function atividadePorBloco(
  porHora: { hour: number; activity: number }[],
): AtividadeDoBloco[] {
  const total = porHora.reduce((soma, ponto) => soma + ponto.activity, 0);

  return BLOCOS.map((bloco) => {
    const atividade = porHora
      .filter((ponto) => ponto.hour >= bloco.de && ponto.hour <= bloco.ate)
      .reduce((soma, ponto) => soma + ponto.activity, 0);

    return {
      bloco: bloco.indice,
      rotulo: bloco.rotulo,
      atividade,
      fatia: total > 0 ? atividade / total : 0,
    };
  });
}

/** O bloco em que o público está mais na rede. Nulo sem dado nenhum. */
export function picoDoPublico(
  porHora: { hour: number; activity: number }[],
): AtividadeDoBloco | null {
  const blocos = atividadePorBloco(porHora).filter((bloco) => bloco.atividade > 0);
  if (blocos.length === 0) return null;
  return blocos.reduce((maior, bloco) => (bloco.atividade > maior.atividade ? bloco : maior));
}

/**
 * A frase que compara o que a campanha faz com o que o público faz.
 *
 * Existe porque o par de números não fala por si: quem olha "18h–21h rende
 * +76%" e "público em pico às 21h–0h" ao lado não conclui nada até alguém
 * juntar. Devolve `null` quando falta um dos lados — inventar a frase com meio
 * dado seria pior do que não dizer nada.
 */
export function compararComOPublico(
  melhorDaCampanha: Recomendacao | undefined,
  pico: AtividadeDoBloco | null,
): string | null {
  if (!melhorDaCampanha || !pico) return null;

  if (melhorDaCampanha.bloco === pico.bloco) {
    return `O melhor horário da campanha é o mesmo em que o público está mais na rede (${pico.rotulo}). Manter.`;
  }

  return `A campanha rende mais em ${BLOCOS[melhorDaCampanha.bloco].rotulo}, mas o público está mais na rede em ${pico.rotulo} — vale testar publicar ali.`;
}

// --- O quadro de barras: dias, horários, mídia e redes ----------------------

/**
 * Uma peça publicada, reduzida ao que o gráfico precisa.
 *
 * O servidor manda esta forma leve — sem métricas completas, sem legenda inteira
 * — e o navegador monta as barras. É deliberado: trocar de eixo (horário ou dia)
 * ou de recorte (formato ou rede) é um clique que não deve custar uma ida ao
 * servidor, senão o gráfico parece pesado e ninguém experimenta os cortes.
 */
export type PecaNoTempo = {
  id: string;
  /** 0 = domingo. */
  dia: number;
  hora: number;
  formato: PostFormat;
  redes: NetworkId[];
  alcance: number;
  interacoes: number;
  legenda: string;
  publicadoEm: string;
  /**
   * O instante já escrito no fuso da campanha — "17/08 09:06".
   *
   * Vem pronto do servidor porque `publicadoEm` é um instante absoluto, e
   * formatá-lo no navegador o traduziria para o relógio de quem abriu a tela.
   * O gráfico agrupa por hora de São Paulo; a lista precisa dizer a mesma hora.
   */
  quando: string;
};

/**
 * `horario` são os oito blocos de três horas; `hora` são as vinte e quatro horas
 * cheias.
 *
 * Os dois existem porque respondem a perguntas diferentes. O bloco é a régua de
 * **decisão** — ninguém agenda "às 14h em ponto porque 14h rende mais", agenda
 * "no começo da tarde" —, e com poucas peças é a única régua com amostra. A hora
 * cheia é a régua de **inspeção**: quando alguém desconfia que o pico está numa
 * ponta do bloco, só a barra fina mostra. Deixar as duas disponíveis custa uma
 * linha aqui e evita a escolha errada nos dois casos.
 */
export type EixoDoQuadro = "horario" | "hora" | "dia";
export type RecorteDoQuadro = "formato" | "rede";
export type MetricaDoQuadro = "alcance" | "interacoes";

/** Quantas faixas cada eixo tem — a grade completa, inclusive as vazias. */
function faixasDoEixo(eixo: EixoDoQuadro): { chave: string; rotulo: string }[] {
  if (eixo === "horario") {
    return BLOCOS.map((bloco) => ({ chave: `h-${bloco.indice}`, rotulo: bloco.rotulo }));
  }
  if (eixo === "hora") {
    // As vinte e quatro horas, sempre todas. Uma grade completa é o que permite
    // ler o dia como uma curva; mostrar só as horas com publicação faria 9h e
    // 19h ficarem lado a lado e o gráfico contaria uma história falsa.
    return Array.from({ length: 24 }, (_, hora) => ({
      chave: `c-${hora}`,
      rotulo: `${hora}h`,
    }));
  }
  return DIAS_CURTOS.map((dia, indice) => ({ chave: `d-${indice}`, rotulo: dia }));
}

function naFaixa(peca: PecaNoTempo, eixo: EixoDoQuadro, indice: number): boolean {
  if (eixo === "horario") return blocoDaHora(peca.hora).indice === indice;
  if (eixo === "hora") return peca.hora === indice;
  return peca.dia === indice;
}

/**
 * Deixa passar só as peças de uma rede.
 *
 * `null` (ou "todas") significa a campanha inteira, que é o padrão: a soma de
 * todas as redes é a leitura mais útil na maior parte do tempo, e quem quer o
 * corte por canal pede.
 */
export function pecasDaRede(pecas: PecaNoTempo[], rede: NetworkId | null): PecaNoTempo[] {
  if (!rede) return pecas;
  return pecas.filter((peca) => peca.redes.includes(rede));
}

/** As redes que aparecem nas peças, para montar o seletor sem opções mortas. */
export function redesPresentes(pecas: PecaNoTempo[]): NetworkId[] {
  const vistas = new Set<NetworkId>();
  for (const peca of pecas) for (const rede of peca.redes) vistas.add(rede);
  return [...vistas];
}

export type FatiaDaBarra = { chave: string; valor: number };

export type BarraDoQuadro = {
  /** Identifica a barra para o clique: `h-6` ou `d-4`. */
  chave: string;
  rotulo: string;
  total: number;
  pecas: number;
  /** Uma fatia por formato ou por rede presente na barra. */
  fatias: FatiaDaBarra[];
};

/**
 * As barras do quadro, empilhadas por formato ou por rede.
 *
 * Duas notas sobre a soma, e as duas importam para o número não mentir:
 *
 * **Por formato, a divisão é exata.** Cada peça tem um formato só, então a barra
 * é a soma limpa das peças daquela faixa.
 *
 * **Por rede, o valor de cada peça é dividido igualmente entre as redes em que
 * ela saiu.** Uma peça publicada em Instagram e Facebook entra com metade em
 * cada. O total da barra continua exato; o que é aproximado é a repartição — e
 * ela precisa ser, porque a rede não devolve alcance por canal para uma peça só
 * que foi para três lugares. Somar o alcance inteiro em cada rede daria uma
 * barra maior que o alcance real, que é o erro pior.
 *
 * **Com uma rede escolhida, a barra é só a parte dela.** Filtrar por Instagram
 * mantém as peças que saíram no Instagram, mas cada uma entra apenas com a sua
 * parcela de Instagram — não com o alcance inteiro de uma peça que também foi
 * para o Facebook. Sem isso, escolher uma rede aumentaria o número em vez de
 * recortá-lo.
 */
export function barrasDoQuadro(
  pecas: PecaNoTempo[],
  {
    eixo,
    recorte,
    metrica = "alcance",
    rede = null,
  }: {
    eixo: EixoDoQuadro;
    recorte: RecorteDoQuadro;
    metrica?: MetricaDoQuadro;
    rede?: NetworkId | null;
  },
): BarraDoQuadro[] {
  const faixas = faixasDoEixo(eixo);
  const consideradas = pecasDaRede(pecas, rede);

  return faixas.map((faixa, indice) => {
    const doGrupo = consideradas.filter((peca) => naFaixa(peca, eixo, indice));
    const soma = new Map<string, number>();

    for (const peca of doGrupo) {
      const bruto = metrica === "alcance" ? peca.alcance : peca.interacoes;
      // Com rede escolhida, só a parcela dela conta — a peça multi-rede não
      // pode entrar inteira num recorte de um canal só.
      const valor = rede && peca.redes.length > 0 ? bruto / peca.redes.length : bruto;

      if (recorte === "formato") {
        soma.set(peca.formato, (soma.get(peca.formato) ?? 0) + valor);
        continue;
      }

      if (peca.redes.length === 0) {
        soma.set("sem_rede", (soma.get("sem_rede") ?? 0) + valor);
        continue;
      }

      if (rede) {
        soma.set(rede, (soma.get(rede) ?? 0) + valor);
        continue;
      }

      const parcela = valor / peca.redes.length;
      for (const outra of peca.redes) {
        soma.set(outra, (soma.get(outra) ?? 0) + parcela);
      }
    }

    return {
      chave: faixa.chave,
      rotulo: faixa.rotulo,
      total: [...soma.values()].reduce((total, valor) => total + valor, 0),
      pecas: doGrupo.length,
      fatias: [...soma.entries()]
        .map(([chave, valor]) => ({ chave, valor }))
        .sort((a, b) => b.valor - a.valor),
    };
  });
}

/** As categorias presentes nos dados, para a legenda e a ordem das pilhas. */
export function categoriasDoQuadro(
  pecas: PecaNoTempo[],
  recorte: RecorteDoQuadro,
  rede: NetworkId | null = null,
): string[] {
  const consideradas = pecasDaRede(pecas, rede);
  const vistas = new Set<string>();
  for (const peca of consideradas) {
    if (recorte === "formato") vistas.add(peca.formato);
    else if (rede) vistas.add(rede);
    else if (peca.redes.length === 0) vistas.add("sem_rede");
    else for (const outra of peca.redes) vistas.add(outra);
  }
  return [...vistas];
}

/**
 * As peças de uma barra, para o painel que abre no clique.
 *
 * Ordenadas por alcance: quem clica numa barra alta quer saber qual peça a
 * levantou, e essa é a primeira da lista.
 */
export function pecasDaBarra(
  pecas: PecaNoTempo[],
  chave: string,
  rede: NetworkId | null = null,
): PecaNoTempo[] {
  const eixo = eixoDaChave(chave);
  const indice = Number(chave.split("-")[1]);

  return pecasDaRede(pecas, rede)
    .filter((peca) => naFaixa(peca, eixo, indice))
    .sort((a, b) => b.alcance - a.alcance);
}

function eixoDaChave(chave: string): EixoDoQuadro {
  const tipo = chave.split("-")[0];
  if (tipo === "h") return "horario";
  if (tipo === "c") return "hora";
  return "dia";
}

/** O rótulo de uma barra, por extenso, para o cabeçalho do painel. */
export function rotuloDaBarra(chave: string): string {
  const indice = Number(chave.split("-")[1]);
  const eixo = eixoDaChave(chave);
  if (eixo === "horario") return BLOCOS[indice].rotulo;
  if (eixo === "hora")
    return `${String(indice).padStart(2, "0")}h às ${String(indice).padStart(2, "0")}h59`;
  return DIAS_LONGOS[indice];
}

/**
 * O que a plataforma sabe sobre uma faixa de tempo, para o painel do clique.
 *
 * Quem clica numa barra não quer só a lista de peças: quer saber se aquela hora
 * é boa. Isso é a comparação com a média — o mesmo `contraMedia` do mapa de
 * calor — mais os dias em que se publicou naquela hora, porque "rende às 19h"
 * costuma ser na verdade "rende às 19h de terça".
 *
 * `confiavel` é falso com menos de duas peças, e a tela precisa respeitar isso:
 * com uma peça, o painel descreve o que aconteceu e não conclui nada.
 */
export type DetalheDaFaixa = {
  chave: string;
  rotulo: string;
  pecas: PecaNoTempo[];
  alcance: number;
  interacoes: number;
  alcanceMedio: number;
  /** Quanto o alcance médio da faixa fica acima da média geral, em %. */
  contraMedia: number;
  confiavel: boolean;
  /** Dias da semana em que houve publicação nesta faixa, do mais rendoso. */
  dias: { dia: number; rotulo: string; pecas: number; alcance: number }[];
  /** Formatos presentes na faixa, do mais rendoso. */
  formatos: { formato: PostFormat; rotulo: string; pecas: number; alcance: number }[];
};

export function detalharFaixa(
  pecas: PecaNoTempo[],
  chave: string,
  { rede = null, minimoDePecas = 2 }: { rede?: NetworkId | null; minimoDePecas?: number } = {},
): DetalheDaFaixa {
  const universo = pecasDaRede(pecas, rede);
  const doGrupo = pecasDaBarra(pecas, chave, rede);

  const mediaGeral =
    universo.length > 0
      ? universo.reduce((soma, peca) => soma + peca.alcance, 0) / universo.length
      : 0;
  const alcance = doGrupo.reduce((soma, peca) => soma + peca.alcance, 0);
  const alcanceMedio = doGrupo.length > 0 ? alcance / doGrupo.length : 0;

  const porDia = new Map<number, PecaNoTempo[]>();
  const porFormato = new Map<PostFormat, PecaNoTempo[]>();
  for (const peca of doGrupo) {
    porDia.set(peca.dia, [...(porDia.get(peca.dia) ?? []), peca]);
    porFormato.set(peca.formato, [...(porFormato.get(peca.formato) ?? []), peca]);
  }

  const somaDe = (lista: PecaNoTempo[]) => lista.reduce((soma, peca) => soma + peca.alcance, 0);

  return {
    chave,
    rotulo: rotuloDaBarra(chave),
    pecas: doGrupo,
    alcance,
    interacoes: doGrupo.reduce((soma, peca) => soma + peca.interacoes, 0),
    alcanceMedio,
    contraMedia: mediaGeral > 0 && doGrupo.length > 0 ? (alcanceMedio / mediaGeral - 1) * 100 : 0,
    confiavel: doGrupo.length >= minimoDePecas,
    dias: [...porDia.entries()]
      .map(([dia, lista]) => ({
        dia,
        rotulo: DIAS_LONGOS[dia],
        pecas: lista.length,
        alcance: somaDe(lista),
      }))
      .sort((a, b) => b.alcance - a.alcance),
    formatos: [...porFormato.entries()]
      .map(([formato, lista]) => ({
        formato,
        rotulo: NOME_DO_FORMATO[formato],
        pecas: lista.length,
        alcance: somaDe(lista),
      }))
      .sort((a, b) => b.alcance - a.alcance),
  };
}
