import type { DailyMetric, NetworkId } from "../types";

/**
 * Lógica pura da integração com a Meta (Facebook e Instagram).
 *
 * Aqui não há chamada de rede: só montagem de URL, escopos e tradução das
 * respostas da Graph API para o nosso modelo. Isso mantém a parte mais fácil de
 * errar coberta por teste (`meta.test.ts`), separada do I/O em `meta.server.ts`.
 *
 * O fluxo é o OAuth oficial: a pessoa é levada para a página da Meta, entra com
 * a conta dela lá e autoriza o aplicativo. A senha nunca passa pela plataforma
 * — além de ser exigência da Meta, é o que permite revogar o acesso a qualquer
 * momento sem trocar senha.
 */

/** Versão da Graph API. Ajustável por ambiente conforme a Meta avança. */
export const VERSAO_GRAPH_PADRAO = "v21.0";

/**
 * Escopos agrupados por funcionalidade do produto. Pedimos só o necessário para
 * o que o cliente vai usar — quanto menos permissão, mais rápida a revisão da
 * Meta e menor o atrito na tela de autorização.
 *
 * Todos os grupos abaixo de `leitura` exigem App Review aprovado pela Meta.
 */
export const ESCOPOS_META = {
  /** Métricas e evolução das contas (PRD 3.2). */
  leitura: [
    "pages_show_list",
    "pages_read_engagement",
    "read_insights",
    "instagram_basic",
    "instagram_manage_insights",
  ],
  /** Publicar imagem, carrossel e vídeo (PRD 3.3). */
  publicacao: ["pages_manage_posts", "instagram_content_publish"],
  /** Caixa de entrada: comentários e mensagens (PRD 3.5). */
  atendimento: [
    "pages_manage_engagement",
    "pages_messaging",
    "instagram_manage_comments",
    "instagram_manage_messages",
  ],
  /** Impulsionamento de publicações (PRD 3.4). */
  anuncios: ["ads_management", "ads_read", "business_management"],
} as const;

export type GrupoEscopo = keyof typeof ESCOPOS_META;

export function montarEscopos(grupos: GrupoEscopo[]): string[] {
  const conjunto = new Set<string>();
  for (const grupo of grupos) {
    for (const escopo of ESCOPOS_META[grupo]) conjunto.add(escopo);
  }
  return [...conjunto];
}

export type ParametrosAutorizacao = {
  appId: string;
  redirectUri: string;
  /** Token anti-CSRF: volta no retorno e precisa bater com o que guardamos. */
  state: string;
  escopos: string[];
  versaoGraph?: string;
};

/** URL do diálogo de autorização — é para lá que o botão "Conectar" leva. */
export function montarUrlAutorizacao({
  appId,
  redirectUri,
  state,
  escopos,
  versaoGraph = VERSAO_GRAPH_PADRAO,
}: ParametrosAutorizacao): string {
  const url = new URL(`https://www.facebook.com/${versaoGraph}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", escopos.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/** Uma conta que a Meta devolveu e que o usuário pode escolher conectar. */
export type ContaDescoberta = {
  networkId: NetworkId;
  /** ID da Página no Facebook ou do perfil profissional no Instagram. */
  externalId: string;
  displayName: string;
  handle: string;
  /** Token da Página — é com ele que se publica e se lê insights. */
  accessToken: string;
  /** Presente quando a Página tem um perfil do Instagram vinculado. */
  instagramId?: string;
  avatarUrl?: string;
};

type PaginaGraph = {
  id: string;
  name: string;
  access_token: string;
  username?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; name?: string };
};

/**
 * Traduz `/me/accounts` em contas conectáveis.
 *
 * Cada Página do Facebook vira uma conta; quando ela tem um perfil profissional
 * do Instagram vinculado, esse perfil vira uma segunda conta — é assim que a
 * Meta expõe o Instagram, sempre através da Página.
 */
export function mapearContasDescobertas(resposta: { data?: PaginaGraph[] }): ContaDescoberta[] {
  const contas: ContaDescoberta[] = [];

  for (const pagina of resposta.data ?? []) {
    contas.push({
      networkId: "facebook",
      externalId: pagina.id,
      displayName: pagina.name,
      handle: pagina.username ? `/${pagina.username}` : `/${pagina.id}`,
      accessToken: pagina.access_token,
      avatarUrl: pagina.picture?.data?.url,
    });

    const instagram = pagina.instagram_business_account;
    if (instagram) {
      contas.push({
        networkId: "instagram",
        externalId: instagram.id,
        displayName: instagram.name ?? pagina.name,
        handle: instagram.username ? `@${instagram.username}` : `@${instagram.id}`,
        // O Instagram é operado com o token da Página à qual está vinculado.
        accessToken: pagina.access_token,
        instagramId: instagram.id,
        avatarUrl: pagina.picture?.data?.url,
      });
    }
  }

  return contas;
}

type ValorInsight = { end_time?: string; value?: number };
type SerieInsight = { name?: string; values?: ValorInsight[] };

/** "2026-08-08T07:00:00+0000" → "2026-08-08" */
export function diaDoEndTime(endTime: string): string {
  return endTime.slice(0, 10);
}

/**
 * Converte as séries de insights da Meta em pontos diários do nosso modelo.
 *
 * Nomes de métrica variam entre Página e Instagram, então aceitamos os dois
 * vocabulários. O que a rede não devolve fica em zero em vez de ser estimado —
 * a plataforma nunca inventa número que a API não deu.
 */
export function mapearInsightsParaMetricas(
  series: SerieInsight[],
  seguidoresAtuais = 0,
): DailyMetric[] {
  const porDia = new Map<string, DailyMetric>();

  const garantirDia = (dia: string): DailyMetric => {
    const existente = porDia.get(dia);
    if (existente) return existente;
    const novo: DailyMetric = {
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
    porDia.set(dia, novo);
    return novo;
  };

  for (const serie of series) {
    for (const ponto of serie.values ?? []) {
      if (!ponto.end_time) continue;
      const dia = garantirDia(diaDoEndTime(ponto.end_time));
      const valor = ponto.value ?? 0;

      switch (serie.name) {
        case "follower_count": // Instagram: novos seguidores no dia
          dia.followersGained = valor;
          break;
        case "page_fans": // Página: total de curtidas acumulado
          dia.followers = valor;
          break;
        case "page_fan_adds":
          dia.followersGained = valor;
          break;
        case "page_fan_removes":
          dia.followersLost = valor;
          break;
        case "reach": // Instagram
        case "page_impressions_unique":
        case "page_impressions_organic_unique":
          dia.organicReach = valor;
          break;
        case "page_impressions_paid_unique":
          dia.paidReach = valor;
          break;
        case "impressions":
        case "page_impressions_organic":
          dia.organicImpressions = valor;
          break;
        case "page_impressions_paid":
          dia.paidImpressions = valor;
          break;
        case "accounts_engaged":
        case "page_post_engagements":
          dia.organicEngagement = valor;
          break;
        default:
          break;
      }
    }
  }

  const dias = [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date));

  // O Instagram entrega ganho diário, não o total. Reconstruímos o acumulado de
  // trás para frente a partir do número de seguidores de hoje.
  if (seguidoresAtuais > 0 && dias.every((dia) => dia.followers === 0)) {
    let acumulado = seguidoresAtuais;
    for (let i = dias.length - 1; i >= 0; i -= 1) {
      dias[i].followers = acumulado;
      acumulado -= dias[i].followersGained - dias[i].followersLost;
    }
  }

  return dias;
}

type LinhaAdsInsights = {
  date_start?: string;
  spend?: string;
  reach?: string;
  impressions?: string;
  clicks?: string;
};

/** Soma o gasto e o alcance pago da API de anúncios nos dias já montados. */
export function aplicarInsightsDeAnuncios(
  dias: DailyMetric[],
  linhas: LinhaAdsInsights[],
): DailyMetric[] {
  const indice = new Map(dias.map((dia) => [dia.date, dia]));

  for (const linha of linhas) {
    if (!linha.date_start) continue;
    const dia = indice.get(linha.date_start);
    if (!dia) continue;
    dia.adSpend += Number(linha.spend ?? 0);
    dia.paidReach += Number(linha.reach ?? 0);
    dia.paidImpressions += Number(linha.impressions ?? 0);
  }

  return dias;
}

/** Métricas pedidas a cada tipo de conta na sincronização diária. */
export const METRICAS_SINCRONIZACAO: Record<"instagram" | "facebook", string[]> = {
  instagram: ["follower_count", "reach", "impressions", "accounts_engaged"],
  facebook: [
    "page_fans",
    "page_fan_adds",
    "page_fan_removes",
    "page_impressions_organic_unique",
    "page_impressions_paid_unique",
    "page_impressions_organic",
    "page_impressions_paid",
    "page_post_engagements",
  ],
};
