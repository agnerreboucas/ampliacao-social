import type { DailyMetric } from "../types";

/**
 * Integração com o Windsor.ai — lógica pura.
 *
 * O Windsor.ai é um agregador: o cliente conecta as contas lá (Meta Ads, Google
 * Ads, GA4, Instagram orgânico e mais de 350 fontes) e nós lemos tudo por uma
 * única chave de API. Para a plataforma isso é um caminho alternativo ao OAuth
 * direto com a Meta, com uma vantagem prática grande: **não depende da revisão
 * do aplicativo pela Meta**, que leva semanas.
 *
 * Este arquivo só traduz as linhas que o Windsor devolve para o nosso modelo.
 * O I/O fica em `cliente.server.ts`.
 */

/** Uma linha de mídia paga como o Windsor entrega (Meta Ads, Google Ads…). */
export type LinhaAnuncio = {
  date?: string;
  account_id?: string;
  account_name?: string;
  campaign?: string;
  campaign_id?: string;
  spend?: number | string;
  reach?: number | string;
  impressions?: number | string;
  clicks?: number | string;
};

function numero(valor: number | string | undefined): number {
  if (valor === undefined || valor === null || valor === "") return 0;
  const convertido = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

/**
 * Agrupa as linhas por dia e devolve pontos diários de mídia paga.
 *
 * O Windsor entrega uma linha por campanha por dia; o nosso modelo guarda um
 * ponto por dia. Somamos as campanhas do mesmo dia e deixamos os campos
 * orgânicos zerados — quem preenche o orgânico é a sincronização da rede, e
 * misturar as duas origens quebraria justamente o comparativo do PRD 3.2.
 */
export function mapearMidiaPaga(linhas: LinhaAnuncio[]): DailyMetric[] {
  const porDia = new Map<string, DailyMetric>();

  for (const linha of linhas) {
    if (!linha.date) continue;
    const dia = linha.date.slice(0, 10);

    const existente = porDia.get(dia) ?? {
      date: dia,
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

    existente.paidReach += numero(linha.reach);
    existente.paidImpressions += numero(linha.impressions);
    existente.adSpend += numero(linha.spend);
    porDia.set(dia, existente);
  }

  // Centavos somados repetidas vezes acumulam ruído de ponto flutuante.
  for (const dia of porDia.values()) {
    dia.adSpend = Math.round(dia.adSpend * 100) / 100;
  }

  return [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type ResumoCampanha = {
  campanha: string;
  contaAnuncios: string;
  investido: number;
  alcance: number;
  impressoes: number;
  cliques: number;
  /** Custo por mil impressões — como a Meta calcula. */
  cpm: number;
  /** Custo por clique. */
  cpc: number;
  primeiroDia: string;
  ultimoDia: string;
  dias: number;
};

/**
 * Consolida as linhas por campanha, com os derivados que o gestor olha primeiro.
 * Ordena pelo que mais consumiu orçamento — é onde a decisão costuma estar.
 */
export function resumirCampanhas(linhas: LinhaAnuncio[]): ResumoCampanha[] {
  const porCampanha = new Map<string, ResumoCampanha & { diasVistos: Set<string> }>();

  for (const linha of linhas) {
    const campanha = linha.campaign?.trim();
    if (!campanha) continue;

    const chave = `${linha.account_name ?? ""}::${campanha}`;
    const atual = porCampanha.get(chave) ?? {
      campanha,
      contaAnuncios: linha.account_name ?? "—",
      investido: 0,
      alcance: 0,
      impressoes: 0,
      cliques: 0,
      cpm: 0,
      cpc: 0,
      primeiroDia: linha.date ?? "",
      ultimoDia: linha.date ?? "",
      dias: 0,
      diasVistos: new Set<string>(),
    };

    atual.investido += numero(linha.spend);
    atual.alcance += numero(linha.reach);
    atual.impressoes += numero(linha.impressions);
    atual.cliques += numero(linha.clicks);

    if (linha.date) {
      const dia = linha.date.slice(0, 10);
      atual.diasVistos.add(dia);
      if (!atual.primeiroDia || dia < atual.primeiroDia) atual.primeiroDia = dia;
      if (!atual.ultimoDia || dia > atual.ultimoDia) atual.ultimoDia = dia;
    }

    porCampanha.set(chave, atual);
  }

  return [...porCampanha.values()]
    .map(({ diasVistos, ...resumo }) => ({
      ...resumo,
      dias: diasVistos.size,
      investido: Math.round(resumo.investido * 100) / 100,
      cpm: resumo.impressoes > 0 ? (resumo.investido / resumo.impressoes) * 1000 : 0,
      cpc: resumo.cliques > 0 ? resumo.investido / resumo.cliques : 0,
    }))
    .sort((a, b) => b.investido - a.investido);
}

export type TotaisPagos = {
  investido: number;
  alcance: number;
  impressoes: number;
  cliques: number;
  cpm: number;
  cpc: number;
  campanhas: number;
};

export function totalizar(campanhas: ResumoCampanha[]): TotaisPagos {
  const totais = campanhas.reduce(
    (acumulado, campanha) => ({
      investido: acumulado.investido + campanha.investido,
      alcance: acumulado.alcance + campanha.alcance,
      impressoes: acumulado.impressoes + campanha.impressoes,
      cliques: acumulado.cliques + campanha.cliques,
    }),
    { investido: 0, alcance: 0, impressoes: 0, cliques: 0 },
  );

  return {
    investido: Math.round(totais.investido * 100) / 100,
    alcance: totais.alcance,
    impressoes: totais.impressoes,
    cliques: totais.cliques,
    cpm: totais.impressoes > 0 ? (totais.investido / totais.impressoes) * 1000 : 0,
    cpc: totais.cliques > 0 ? totais.investido / totais.cliques : 0,
    campanhas: campanhas.length,
  };
}

/** Campos pedidos ao Windsor na sincronização de mídia paga. */
export const CAMPOS_MIDIA_PAGA = [
  "date",
  "account_id",
  "account_name",
  "campaign",
  "spend",
  "reach",
  "impressions",
  "clicks",
] as const;

/**
 * Conectores do Windsor que interessam ao escopo social do produto.
 * Fora daqui é e-commerce, CRM e afins — explicitamente fora do PRD (seção 1.4).
 */
export const CONECTORES_SOCIAIS: Record<string, { rotulo: string; tipo: "pago" | "organico" }> = {
  facebook: { rotulo: "Meta Ads (Facebook e Instagram)", tipo: "pago" },
  tiktok: { rotulo: "TikTok Ads", tipo: "pago" },
  linkedin: { rotulo: "LinkedIn Ads", tipo: "pago" },
  instagram_public: { rotulo: "Instagram (orgânico)", tipo: "organico" },
  facebook_organic: { rotulo: "Facebook (orgânico)", tipo: "organico" },
};
