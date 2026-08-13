// A extensão é explícita porque os testes rodam com o "type stripping" do Node,
// que resolve módulos como ESM e não adivinha o ".ts" — ao contrário do bundler.
import { PERIOD_DAYS, slicePeriod, summarize } from "./analytics.ts";
import { FORMATOS_DE_FEED } from "./types.ts";
import type { DailyMetric, NetworkId, PeriodKey, Post, SocialAccount } from "./types";

/**
 * Recomendações a partir dos números.
 *
 * A regra que governa este módulo inteiro: **nada é sugerido sem a conta que o
 * sustenta.** Cada recomendação carrega a evidência — os dois números que a
 * geraram — e a tela mostra essa evidência junto. Um painel que diz "poste mais
 * às terças" sem dizer por quê está pedindo confiança cega, e em campanha
 * política, decisão tomada por palpite embrulhado em interface custa caro.
 *
 * Daí vem a segunda regra: **quando a base é pequena, o silêncio é a resposta
 * certa.** Cada análise declara quantos dias ou quantas publicações precisa
 * antes de falar. Três posts não dizem qual formato rende mais; dizem que ainda
 * não dá para saber. Recomendação inventada sobre dado ralo é pior que
 * recomendação nenhuma, porque parece igual à boa.
 *
 * Módulo puro: recebe métricas e publicações, devolve texto. Sem relógio
 * próprio (o "hoje" entra como parâmetro), sem acesso a banco, testável.
 */

export type PesoRecomendacao = "oportunidade" | "atencao" | "risco";

export type Recomendacao = {
  /** Estável, para a tela não remontar a lista a cada consulta. */
  id: string;
  titulo: string;
  /** O que fazer, em uma frase. */
  acao: string;
  /** Os números que sustentam a sugestão. Sempre presentes. */
  evidencia: string;
  peso: PesoRecomendacao;
  /** Área da plataforma a que a recomendação se refere. */
  area: "Conteúdo" | "Investimento" | "Audiência" | "Relacionamento" | "Operação";
  /** Conta a que se refere, quando é específica de um canal. */
  accountId?: string;
};

/** O que cada análise precisa antes de abrir a boca. */
export const MINIMOS = {
  /** Dias de histórico para comparar um período com o anterior. */
  diasParaTendencia: 14,
  /** Publicações do mesmo formato para comparar formatos. */
  postsPorFormato: 3,
  /** Publicações no total para falar de conteúdo. */
  postsParaConteudo: 6,
  /** Dias com investimento para avaliar eficiência de mídia paga. */
  diasComInvestimento: 7,
} as const;

export type EntradaRecomendacoes = {
  contas: SocialAccount[];
  /** Histórico diário por conta, já recortado ao período de interesse. */
  metricasPorConta: Map<string, DailyMetric[]>;
  posts: Post[];
  period: PeriodKey;
  /** Interações pendentes de resposta no projeto. */
  interacoesPendentes: number;
  /** A mais antiga sem resposta, em ISO. Sem pendências, `null`. */
  pendenteMaisAntigaEm: string | null;
  /** "Agora" entra de fora para o módulo continuar puro e testável. */
  agoraMs: number;
};

/**
 * Todas as observações que os números sustentam, da mais urgente para a menos.
 *
 * Devolve lista vazia sem constrangimento: é o resultado honesto de uma conta
 * nova ou de um período curto.
 */
export function recomendar(entrada: EntradaRecomendacoes): Recomendacao[] {
  const encontradas = [
    ...tendenciaDeAlcance(entrada),
    ...formatoQueRende(entrada),
    ...eficienciaDoInvestimento(entrada),
    ...canalParado(entrada),
    ...perdaDeSeguidores(entrada),
    ...interacoesEsperando(entrada),
    ...frequenciaDePublicacao(entrada),
  ];

  const ordem: Record<PesoRecomendacao, number> = { risco: 0, atencao: 1, oportunidade: 2 };
  return encontradas.sort((a, b) => ordem[a.peso] - ordem[b.peso]);
}

// --- Análises ---------------------------------------------------------------

/** O alcance está subindo ou caindo contra o período anterior de mesmo tamanho? */
function tendenciaDeAlcance(entrada: EntradaRecomendacoes): Recomendacao[] {
  const todos = todasAsMetricas(entrada);
  if (todos.length < MINIMOS.diasParaTendencia) return [];

  const resumo = summarize(todos, entrada.period);
  // Abaixo de 10% para qualquer lado é ruído de calendário — fim de semana,
  // feriado, um post que pegou. Chamar isso de tendência gera alarme falso.
  if (Math.abs(resumo.reachDelta) < 10) return [];

  const caiu = resumo.reachDelta < 0;
  return [
    {
      id: "alcance-tendencia",
      area: "Conteúdo",
      peso: caiu ? "atencao" : "oportunidade",
      titulo: caiu ? "O alcance caiu neste período" : "O alcance está crescendo",
      acao: caiu
        ? "Compare o que foi publicado agora com o período anterior: formato, horário e frequência. A queda costuma vir de menos publicações, não de alcance menor por publicação."
        : "Vale repetir o que foi feito: olhe as publicações de maior alcance do período e identifique o que elas têm em comum.",
      evidencia: `Alcance ${caiu ? "caiu" : "subiu"} ${Math.abs(resumo.reachDelta).toFixed(1)}% contra o período anterior (${formatarInteiro(resumo.reach)} pessoas alcançadas).`,
    },
  ];
}

/** Algum formato rende sistematicamente mais que os outros? */
function formatoQueRende(entrada: EntradaRecomendacoes): Recomendacao[] {
  const publicados = entrada.posts.filter((post) => post.status === "publicado" && post.metrics);
  if (publicados.length < MINIMOS.postsParaConteudo) return [];

  const porFormato = new Map<string, { total: number; alcance: number }>();
  for (const post of publicados) {
    // Story fica de fora desta comparação de propósito. O alcance dele é
    // limitado a quem abre stories, e o de um post de feed não é: dizer
    // "publique menos story porque alcança menos" seria comparar coisas que a
    // rede nem entrega para o mesmo conjunto de pessoas. O story aparece na
    // tela de Conteúdo, com a ressalva — só não vira ordem de pauta.
    if (!FORMATOS_DE_FEED.includes(post.format)) continue;

    const atual = porFormato.get(post.format) ?? { total: 0, alcance: 0 };
    atual.total += 1;
    atual.alcance += post.metrics!.reach;
    porFormato.set(post.format, atual);
  }

  // Só formatos com amostra suficiente entram na comparação. Um vídeo que
  // viralizou não prova que vídeo é melhor.
  const comparaveis = [...porFormato.entries()]
    .filter(([, dados]) => dados.total >= MINIMOS.postsPorFormato)
    .map(([formato, dados]) => ({
      formato,
      media: dados.alcance / dados.total,
      total: dados.total,
    }))
    .sort((a, b) => b.media - a.media);

  if (comparaveis.length < 2) return [];

  const melhor = comparaveis[0];
  const pior = comparaveis[comparaveis.length - 1];
  if (pior.media <= 0) return [];

  const vantagem = (melhor.media / pior.media - 1) * 100;
  // Menos de 30% de diferença não justifica mudar a pauta.
  if (vantagem < 30) return [];

  return [
    {
      id: "formato-vencedor",
      area: "Conteúdo",
      peso: "oportunidade",
      titulo: `${nomeDoFormato(melhor.formato)} está rendendo mais`,
      acao: `Aumente a proporção de ${nomeDoFormato(melhor.formato).toLowerCase()} na pauta e observe se a vantagem se mantém no próximo período.`,
      evidencia: `${nomeDoFormato(melhor.formato)} alcança em média ${formatarInteiro(melhor.media)} por publicação (${melhor.total} peças), contra ${formatarInteiro(pior.media)} de ${nomeDoFormato(pior.formato).toLowerCase()} (${pior.total} peças) — ${vantagem.toFixed(0)}% a mais.`,
    },
  ];
}

/** O dinheiro investido está comprando alcance a um custo razoável? */
function eficienciaDoInvestimento(entrada: EntradaRecomendacoes): Recomendacao[] {
  const todos = todasAsMetricas(entrada);
  const comGasto = todos.filter((dia) => dia.adSpend > 0);
  if (comGasto.length < MINIMOS.diasComInvestimento) return [];

  const investido = comGasto.reduce((soma, dia) => soma + dia.adSpend, 0);
  const alcancePago = comGasto.reduce((soma, dia) => soma + dia.paidReach, 0);
  if (investido <= 0 || alcancePago <= 0) return [];

  // Custo por mil pessoas alcançadas — a medida que o mercado usa e que o
  // cliente reconhece na fatura.
  const custoPorMil = (investido / alcancePago) * 1000;

  const alcanceOrganico = todos.reduce((soma, dia) => soma + dia.organicReach, 0);
  const recomendacoes: Recomendacao[] = [];

  // A comparação que importa não é com uma tabela de mercado — que varia por
  // nicho, região e época — e sim com o que a própria conta consegue de graça.
  if (alcanceOrganico > 0 && alcancePago > alcanceOrganico * 2) {
    recomendacoes.push({
      id: "dependencia-de-midia",
      area: "Investimento",
      peso: "atencao",
      titulo: "O alcance depende muito de mídia paga",
      acao: "Vale investir em conteúdo que circule sozinho: quando o orçamento acabar, o alcance cai junto.",
      evidencia: `${formatarInteiro(alcancePago)} de alcance pago contra ${formatarInteiro(alcanceOrganico)} de orgânico no período.`,
    });
  }

  recomendacoes.push({
    id: "custo-por-mil",
    area: "Investimento",
    peso: custoPorMil > 30 ? "atencao" : "oportunidade",
    titulo:
      custoPorMil > 30 ? "O custo do alcance pago está alto" : "O alcance pago está saindo barato",
    acao:
      custoPorMil > 30
        ? "Revise segmentação e criativo: público muito amplo ou anúncio pouco atraente encarecem o alcance."
        : "Se o resultado se mantiver, há espaço para ampliar o orçamento sem perder eficiência.",
    evidencia: `${formatarMoeda(custoPorMil)} por mil pessoas alcançadas — ${formatarMoeda(investido)} investidos em ${comGasto.length} dias.`,
  });

  return recomendacoes;
}

/** Alguma conta parou de receber números? */
function canalParado(entrada: EntradaRecomendacoes): Recomendacao[] {
  const recomendacoes: Recomendacao[] = [];
  const diasDoPeriodo = PERIOD_DAYS[entrada.period] ?? 90;

  for (const conta of entrada.contas) {
    const dias = entrada.metricasPorConta.get(conta.id) ?? [];
    if (dias.length === 0) {
      // Conta recém-conectada não é conta parada.
      recomendacoes.push({
        id: `sem-dados-${conta.id}`,
        accountId: conta.id,
        area: "Operação",
        peso: "atencao",
        titulo: `${conta.displayName} está sem números`,
        acao: "Registre uma leitura ou sincronize a conta para ela entrar nas comparações.",
        evidencia: `Nenhum dia com dados no período de ${diasDoPeriodo} dias.`,
      });
      continue;
    }

    const ultimo = dias[dias.length - 1];
    const diasParados = Math.floor(
      (entrada.agoraMs - Date.parse(`${ultimo.date}T12:00:00Z`)) / 86400000,
    );

    // Uma semana sem leitura é o ponto em que o painel começa a mentir.
    if (diasParados >= 7) {
      recomendacoes.push({
        id: `parado-${conta.id}`,
        accountId: conta.id,
        area: "Operação",
        peso: diasParados >= 21 ? "risco" : "atencao",
        titulo: `${conta.displayName} está ${diasParados} dias sem atualizar`,
        acao: "Atualize os números desta conta: enquanto ela estiver parada, os totais do projeto estão subestimados.",
        evidencia: `Última leitura em ${ultimo.date}.`,
      });
    }
  }

  return recomendacoes;
}

/** Alguma conta está perdendo mais seguidores do que ganhando? */
function perdaDeSeguidores(entrada: EntradaRecomendacoes): Recomendacao[] {
  const recomendacoes: Recomendacao[] = [];

  for (const conta of entrada.contas) {
    const dias = entrada.metricasPorConta.get(conta.id) ?? [];
    if (dias.length < MINIMOS.diasParaTendencia) continue;

    const ganhos = dias.reduce((soma, dia) => soma + dia.followersGained, 0);
    const perdidos = dias.reduce((soma, dia) => soma + dia.followersLost, 0);
    if (perdidos <= ganhos) continue;

    recomendacoes.push({
      id: `perda-${conta.id}`,
      accountId: conta.id,
      area: "Audiência",
      peso: "risco",
      titulo: `${conta.displayName} está perdendo seguidores`,
      acao: "Olhe os dias de maior perda e o que foi publicado neles. Queda concentrada em um dia costuma ter uma causa única e identificável.",
      evidencia: `${formatarInteiro(perdidos)} saíram contra ${formatarInteiro(ganhos)} que entraram, em ${dias.length} dias.`,
    });
  }

  return recomendacoes;
}

/** Tem gente esperando resposta há tempo demais? */
function interacoesEsperando(entrada: EntradaRecomendacoes): Recomendacao[] {
  if (entrada.interacoesPendentes === 0 || !entrada.pendenteMaisAntigaEm) return [];

  const horas = Math.floor(
    (entrada.agoraMs - Date.parse(entrada.pendenteMaisAntigaEm)) / (60 * 60 * 1000),
  );
  if (horas < 24) return [];

  // As redes fecham a janela de mensagem direta em 24h. Passado esse prazo, a
  // resposta deixa de ser possível — não é só atraso, é oportunidade perdida.
  return [
    {
      id: "inbox-parada",
      area: "Relacionamento",
      peso: horas >= 48 ? "risco" : "atencao",
      titulo: `${entrada.interacoesPendentes} interação(ões) esperando resposta`,
      acao: "Responda as mais antigas primeiro. Depois de 24 horas, a janela de mensagem direta das redes se fecha e a resposta não chega mais.",
      evidencia: `A mais antiga espera há ${horas} horas.`,
    },
  ];
}

/** A conta está publicando com alguma regularidade? */
function frequenciaDePublicacao(entrada: EntradaRecomendacoes): Recomendacao[] {
  const todos = todasAsMetricas(entrada);
  if (todos.length < MINIMOS.diasParaTendencia) return [];

  const publicados = entrada.posts.filter((post) => post.status === "publicado");
  const dias = todos.length;
  const porSemana = (publicados.length / dias) * 7;

  if (porSemana >= 2) return [];

  return [
    {
      id: "frequencia-baixa",
      area: "Conteúdo",
      peso: publicados.length === 0 ? "risco" : "atencao",
      titulo:
        publicados.length === 0
          ? "Nenhuma publicação no período"
          : "A frequência de publicação está baixa",
      acao: "Duas publicações por semana é o piso para o alcance não depender só de mídia paga.",
      evidencia:
        publicados.length === 0
          ? `Nenhuma publicação em ${dias} dias de histórico.`
          : `${publicados.length} publicação(ões) em ${dias} dias — ${porSemana.toFixed(1)} por semana.`,
    },
  ];
}

// --- Auxiliares -------------------------------------------------------------

/** Todos os dias de todas as contas, somados por data e recortados ao período. */
function todasAsMetricas(entrada: EntradaRecomendacoes): DailyMetric[] {
  const porData = new Map<string, DailyMetric>();

  for (const conta of entrada.contas) {
    for (const dia of entrada.metricasPorConta.get(conta.id) ?? []) {
      const atual = porData.get(dia.date);
      if (!atual) {
        porData.set(dia.date, { ...dia });
        continue;
      }
      atual.followers += dia.followers;
      atual.followersGained += dia.followersGained;
      atual.followersLost += dia.followersLost;
      atual.organicReach += dia.organicReach;
      atual.paidReach += dia.paidReach;
      atual.organicImpressions += dia.organicImpressions;
      atual.paidImpressions += dia.paidImpressions;
      atual.organicEngagement += dia.organicEngagement;
      atual.paidEngagement += dia.paidEngagement;
      atual.adSpend += dia.adSpend;
    }
  }

  const ordenados = [...porData.values()].sort((a, b) => a.date.localeCompare(b.date));
  return slicePeriod(ordenados, entrada.period);
}

const NOMES_DE_FORMATO: Record<string, string> = {
  imagem: "Imagem",
  carrossel: "Carrossel",
  video: "Vídeo",
  story: "Story",
};

function nomeDoFormato(formato: string): string {
  return NOMES_DE_FORMATO[formato] ?? formato;
}

function formatarInteiro(valor: number): string {
  return Math.round(valor).toLocaleString("pt-BR");
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Resumo por canal, para a visão que compara as contas entre si.
 *
 * Separado de `recomendar` de propósito: uma coisa é o quadro, outra é o
 * conselho. Somar todos os canais responde "como vamos?"; esta função responde
 * "qual canal está puxando, e qual está pesando?", que é a pergunta que leva a
 * uma decisão de onde colocar esforço.
 */
export type LinhaDoCanal = {
  accountId: string;
  nome: string;
  handle: string;
  networkId: NetworkId;
  avatarGradient: string;
  seguidores: number;
  variacaoSeguidores: number;
  alcance: number;
  engajamento: number;
  taxaEngajamento: number;
  investido: number;
  /** Fatia do alcance total do projeto, de 0 a 1. */
  participacao: number;
  diasComDados: number;
};

export function resumirCanais(
  contas: SocialAccount[],
  metricasPorConta: Map<string, DailyMetric[]>,
  period: PeriodKey,
): LinhaDoCanal[] {
  const linhas = contas.map((conta) => {
    const dias = slicePeriod(metricasPorConta.get(conta.id) ?? [], period);
    const resumo = summarize(metricasPorConta.get(conta.id) ?? [], period);
    const alcance = dias.reduce((soma, dia) => soma + dia.organicReach + dia.paidReach, 0);
    const engajamento = dias.reduce(
      (soma, dia) => soma + dia.organicEngagement + dia.paidEngagement,
      0,
    );

    return {
      accountId: conta.id,
      nome: conta.displayName,
      handle: conta.handle,
      networkId: conta.networkId,
      avatarGradient: conta.avatarGradient,
      seguidores: resumo.followers,
      variacaoSeguidores: resumo.followersDelta,
      alcance,
      engajamento,
      taxaEngajamento: alcance > 0 ? (engajamento / alcance) * 100 : 0,
      investido: dias.reduce((soma, dia) => soma + dia.adSpend, 0),
      participacao: 0,
      diasComDados: dias.length,
    };
  });

  const alcanceTotal = linhas.reduce((soma, linha) => soma + linha.alcance, 0);
  for (const linha of linhas) {
    linha.participacao = alcanceTotal > 0 ? linha.alcance / alcanceTotal : 0;
  }

  return linhas.sort((a, b) => b.alcance - a.alcance);
}
