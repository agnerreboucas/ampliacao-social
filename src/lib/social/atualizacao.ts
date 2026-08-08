import type { AtualizacaoManual, DailyMetric, ValoresManuais } from "./types";

/**
 * Atualização manual dos números.
 *
 * Existe porque a leitura automática depende da App Review da Meta, que não tem
 * data. Enquanto isso, alguém abre o painel de cada rede, lê os números e digita
 * aqui — sem pagar agregador e sem esperar aprovação de ninguém.
 *
 * A decisão que sustenta o resto do módulo: **atualizar três vezes por dia não
 * cria três pontos no histórico.** As redes reportam números acumulados do dia,
 * então a segunda leitura não é um dado novo — é a mesma linha, mais certa. O
 * histórico continua diário; o que as três leituras dão é precisão e um registro
 * de como o dia evoluiu.
 *
 * Módulo puro: nenhuma dependência de servidor, de disco ou de rede.
 */

/** Faixas do dia, só para orientar quem preenche. */
export type Janela = "manha" | "tarde" | "noite";

export const JANELAS: Record<Janela, { label: string; inicio: number; fim: number }> = {
  manha: { label: "Manhã", inicio: 0, fim: 11 },
  tarde: { label: "Tarde", inicio: 12, fim: 17 },
  noite: { label: "Noite", inicio: 18, fim: 23 },
};

export const ORDEM_JANELAS: Janela[] = ["manha", "tarde", "noite"];

export function janelaDe(iso: string): Janela {
  const hora = new Date(iso).getHours();
  if (hora <= JANELAS.manha.fim) return "manha";
  if (hora <= JANELAS.tarde.fim) return "tarde";
  return "noite";
}

/** Campos que a pessoa digita, na ordem em que aparecem na tela. */
export const CAMPOS_MANUAIS: {
  chave: keyof ValoresManuais;
  label: string;
  ajuda: string;
  moeda?: boolean;
}[] = [
  {
    chave: "followers",
    label: "Seguidores",
    ajuda: "Total de seguidores agora, não o quanto cresceu.",
  },
  {
    chave: "organicReach",
    label: "Alcance orgânico",
    ajuda: "Contas alcançadas sem impulsionamento, no acumulado do dia.",
  },
  {
    chave: "paidReach",
    label: "Alcance pago",
    ajuda: "Contas alcançadas por anúncio ou impulsionamento.",
  },
  { chave: "organicImpressions", label: "Impressões orgânicas", ajuda: "Exibições sem pagar." },
  { chave: "paidImpressions", label: "Impressões pagas", ajuda: "Exibições vindas de anúncio." },
  {
    chave: "organicEngagement",
    label: "Engajamento orgânico",
    ajuda: "Curtidas, comentários, salvamentos e compartilhamentos do não pago.",
  },
  {
    chave: "paidEngagement",
    label: "Engajamento pago",
    ajuda: "As mesmas interações, vindas do que foi impulsionado.",
  },
  {
    chave: "adSpend",
    label: "Investimento do dia",
    ajuda: "Quanto saiu do bolso hoje, em reais.",
    moeda: true,
  },
];

export const VALORES_ZERADOS: ValoresManuais = {
  followers: 0,
  organicReach: 0,
  paidReach: 0,
  organicImpressions: 0,
  paidImpressions: 0,
  organicEngagement: 0,
  paidEngagement: 0,
  adSpend: 0,
};

/** Extrai de um dia já registrado os campos que a pessoa digitaria. */
export function valoresDe(dia: DailyMetric): ValoresManuais {
  return {
    followers: dia.followers,
    organicReach: dia.organicReach,
    paidReach: dia.paidReach,
    organicImpressions: dia.organicImpressions,
    paidImpressions: dia.paidImpressions,
    organicEngagement: dia.organicEngagement,
    paidEngagement: dia.paidEngagement,
    adSpend: dia.adSpend,
  };
}

/**
 * Aplica valores digitados ao histórico de uma conta.
 *
 * Substitui a linha do dia — não soma nem acrescenta um ponto. Se `date` já
 * existe, é reescrito; se não, entra na ordem certa. Ganho e perda de
 * seguidores saem da diferença para o dia anterior, porque é o que dá para
 * saber lendo um total.
 */
export function aplicarValores(
  serie: DailyMetric[],
  date: string,
  valores: ValoresManuais,
): DailyMetric[] {
  const anteriores = serie.filter((dia) => dia.date < date);
  const diaAnterior = anteriores[anteriores.length - 1];
  const diferenca = diaAnterior ? valores.followers - diaAnterior.followers : 0;

  const linha: DailyMetric = {
    date,
    followers: valores.followers,
    followersGained: diferenca > 0 ? diferenca : 0,
    followersLost: diferenca < 0 ? -diferenca : 0,
    organicReach: valores.organicReach,
    paidReach: valores.paidReach,
    organicImpressions: valores.organicImpressions,
    paidImpressions: valores.paidImpressions,
    organicEngagement: valores.organicEngagement,
    paidEngagement: valores.paidEngagement,
    adSpend: valores.adSpend,
  };

  const semODia = serie.filter((dia) => dia.date !== date);
  return [...semODia, linha].sort((a, b) => a.date.localeCompare(b.date));
}

/** Registros de um dia, do mais antigo para o mais recente. */
export function atualizacoesDoDia(
  log: AtualizacaoManual[],
  accountId: string,
  date: string,
): AtualizacaoManual[] {
  return log
    .filter((item) => item.accountId === accountId && item.date === date)
    .sort((a, b) => a.registradaEm.localeCompare(b.registradaEm));
}

export type Variacao = {
  chave: keyof ValoresManuais;
  de: number;
  para: number;
  diferenca: number;
};

/**
 * O que mudou entre dois registros do mesmo dia.
 *
 * É isto que dá sentido a atualizar mais de uma vez: sem a comparação, a
 * segunda leitura do dia só sobrescreve a primeira e ninguém vê o movimento.
 */
export function variacaoEntre(anterior: ValoresManuais, atual: ValoresManuais): Variacao[] {
  const variacoes: Variacao[] = [];
  for (const campo of CAMPOS_MANUAIS) {
    const de = anterior[campo.chave];
    const para = atual[campo.chave];
    if (de !== para) variacoes.push({ chave: campo.chave, de, para, diferenca: para - de });
  }
  return variacoes;
}

/**
 * Quantas leituras faltam no dia e qual janela vem agora.
 *
 * A meta é configurável porque três por dia é a escolha de quem opera, não uma
 * regra da plataforma.
 */
export function progressoDoDia(
  registros: AtualizacaoManual[],
  meta = ORDEM_JANELAS.length,
): { feitas: number; meta: number; janelasFeitas: Janela[]; proxima: Janela | null } {
  const janelasFeitas = [...new Set(registros.map((item) => janelaDe(item.registradaEm)))];
  const proxima = ORDEM_JANELAS.find((janela) => !janelasFeitas.includes(janela)) ?? null;
  return { feitas: registros.length, meta, janelasFeitas, proxima };
}
