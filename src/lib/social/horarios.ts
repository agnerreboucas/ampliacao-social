import { NOME_DO_FORMATO, type PecaAvaliada } from "./conteudo.ts";
import type { PostFormat } from "./types.ts";

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
 * **Blocos de três horas, não horas cheias.** Sete dias por vinte e quatro
 * horas são cento e sessenta e oito casas. Trinta publicações espalhadas ali
 * dão, no melhor caso, uma peça por casa — e uma peça não é uma média, é um
 * acaso com aparência de conclusão. Oito blocos por dia mantêm a amostra
 * utilizável e correspondem a como a decisão é tomada de verdade: "de manhã ou
 * no fim da tarde?".
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
  })
    .filter((casa) => casa.confiavel && casa.pecas > 0)
    .sort((a, b) => b.alcanceMedio - a.alcanceMedio)
    .slice(0, quantidade);
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
