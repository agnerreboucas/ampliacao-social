import { randomBytes } from "node:crypto";

// A extensão .ts é explícita para que os testes rodem no Node sem
// empacotador (node --experimental-strip-types); o Vite resolve igual.
import {
  METRICAS_SINCRONIZACAO,
  VERSAO_GRAPH_PADRAO,
  aplicarInsightsDeAnuncios,
  mapearContasDescobertas,
  mapearInsightsParaMetricas,
  type ContaDescoberta,
} from "./meta.ts";
import type { DailyMetric } from "../types";

/**
 * Conversas com a Graph API da Meta.
 *
 * O `fetch` é injetável para que os testes exercitem o tratamento de erro sem
 * tocar na rede. A tradução das respostas fica em `meta.ts`, que é pura.
 */

export type Buscador = typeof fetch;

export type ConfigMeta = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  versaoGraph?: string;
};

/** Erro da Meta com a mensagem que a própria API devolveu, para não adivinhar causa. */
export class ErroDaMeta extends Error {
  readonly status: number;
  readonly tipo?: string;
  readonly codigo?: number;

  constructor(status: number, mensagem: string, tipo?: string, codigo?: number) {
    super(mensagem);
    this.name = "ErroDaMeta";
    this.status = status;
    this.tipo = tipo;
    this.codigo = codigo;
  }
}

export function gerarState(): string {
  return randomBytes(24).toString("base64url");
}

function base(config: ConfigMeta): string {
  return `https://graph.facebook.com/${config.versaoGraph ?? VERSAO_GRAPH_PADRAO}`;
}

async function pedir<T>(buscador: Buscador, url: string): Promise<T> {
  const resposta = await buscador(url, { headers: { accept: "application/json" } });
  const corpo = (await resposta.json().catch(() => null)) as
    | { error?: { message?: string; type?: string; code?: number } }
    | T
    | null;

  if (!resposta.ok || (corpo && typeof corpo === "object" && "error" in corpo && corpo.error)) {
    const erro = (corpo as { error?: { message?: string; type?: string; code?: number } })?.error;
    throw new ErroDaMeta(
      resposta.status,
      erro?.message ?? `A Meta respondeu ${resposta.status} sem detalhar o motivo.`,
      erro?.type,
      erro?.code,
    );
  }

  return corpo as T;
}

/** Troca o `code` do retorno por um token de usuário de curta duração. */
export async function trocarCodigoPorToken(
  config: ConfigMeta,
  code: string,
  buscador: Buscador = fetch,
): Promise<string> {
  const url = new URL(`${base(config)}/oauth/access_token`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);

  const dados = await pedir<{ access_token?: string }>(buscador, url.toString());
  if (!dados.access_token) {
    throw new ErroDaMeta(502, "A Meta não devolveu o token de acesso na troca do código.");
  }
  return dados.access_token;
}

/**
 * Converte o token curto (≈1 h) em um de longa duração (≈60 dias).
 * É este que guardamos; os tokens de Página derivados dele não expiram sozinhos.
 */
export async function obterTokenLongaDuracao(
  config: ConfigMeta,
  tokenCurto: string,
  buscador: Buscador = fetch,
): Promise<{ token: string; expiraEm: number | null }> {
  const url = new URL(`${base(config)}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("client_secret", config.appSecret);
  url.searchParams.set("fb_exchange_token", tokenCurto);

  const dados = await pedir<{ access_token?: string; expires_in?: number }>(
    buscador,
    url.toString(),
  );
  if (!dados.access_token) {
    throw new ErroDaMeta(502, "A Meta não devolveu o token de longa duração.");
  }
  return { token: dados.access_token, expiraEm: dados.expires_in ?? null };
}

/** Páginas que a pessoa administra, com o Instagram profissional vinculado. */
export async function descobrirContas(
  config: ConfigMeta,
  tokenUsuario: string,
  buscador: Buscador = fetch,
): Promise<ContaDescoberta[]> {
  const url = new URL(`${base(config)}/me/accounts`);
  url.searchParams.set("access_token", tokenUsuario);
  url.searchParams.set(
    "fields",
    "id,name,username,access_token,picture{url},instagram_business_account{id,username,name}",
  );
  url.searchParams.set("limit", "100");

  const dados = await pedir<Parameters<typeof mapearContasDescobertas>[0]>(
    buscador,
    url.toString(),
  );
  return mapearContasDescobertas(dados);
}

/** Número de seguidores hoje — base para reconstruir o acumulado do Instagram. */
export async function obterSeguidoresAtuais(
  config: ConfigMeta,
  conta: { externalId: string; instagramId?: string; accessToken: string },
  buscador: Buscador = fetch,
): Promise<number> {
  const id = conta.instagramId ?? conta.externalId;
  const url = new URL(`${base(config)}/${id}`);
  url.searchParams.set("access_token", conta.accessToken);
  url.searchParams.set("fields", conta.instagramId ? "followers_count" : "fan_count");

  const dados = await pedir<{ followers_count?: number; fan_count?: number }>(
    buscador,
    url.toString(),
  );
  return dados.followers_count ?? dados.fan_count ?? 0;
}

/**
 * Histórico diário da conta na janela pedida.
 *
 * A Meta limita a 30 dias por chamada de insights, então o chamador deve
 * fatiar janelas maiores. Sincronizar é acumulativo: os dias já guardados
 * continuam valendo, o que atende "histórico preservado" do PRD 3.2.
 */
export async function buscarInsights(
  config: ConfigMeta,
  conta: { externalId: string; instagramId?: string; accessToken: string },
  janela: { desde: string; ate: string },
  buscador: Buscador = fetch,
): Promise<DailyMetric[]> {
  const ehInstagram = Boolean(conta.instagramId);
  const id = conta.instagramId ?? conta.externalId;
  const metricas = METRICAS_SINCRONIZACAO[ehInstagram ? "instagram" : "facebook"];

  const url = new URL(`${base(config)}/${id}/insights`);
  url.searchParams.set("access_token", conta.accessToken);
  url.searchParams.set("metric", metricas.join(","));
  url.searchParams.set("period", "day");
  url.searchParams.set("since", janela.desde);
  url.searchParams.set("until", janela.ate);

  const dados = await pedir<{ data?: Parameters<typeof mapearInsightsParaMetricas>[0] }>(
    buscador,
    url.toString(),
  );

  const seguidores = ehInstagram ? await obterSeguidoresAtuais(config, conta, buscador) : 0;

  return mapearInsightsParaMetricas(dados.data ?? [], seguidores);
}

/** Gasto e resultado de mídia paga; exige a permissão de anúncios aprovada. */
export async function buscarInsightsDeAnuncios(
  config: ConfigMeta,
  contaDeAnuncios: { id: string; accessToken: string },
  janela: { desde: string; ate: string },
  dias: DailyMetric[],
  buscador: Buscador = fetch,
): Promise<DailyMetric[]> {
  const url = new URL(`${base(config)}/${contaDeAnuncios.id}/insights`);
  url.searchParams.set("access_token", contaDeAnuncios.accessToken);
  url.searchParams.set("fields", "spend,reach,impressions,clicks");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: janela.desde, until: janela.ate }));

  const dados = await pedir<{ data?: Parameters<typeof aplicarInsightsDeAnuncios>[1] }>(
    buscador,
    url.toString(),
  );
  return aplicarInsightsDeAnuncios(dias, dados.data ?? []);
}

/**
 * Traduz a falha da Meta em uma frase que o operador entende e sabe o que fazer.
 * Mantemos a mensagem original acessível no log, sem despejá-la na tela.
 */
export function explicarErro(erro: unknown): string {
  if (!(erro instanceof ErroDaMeta)) {
    return "Não foi possível falar com a Meta agora. Tente de novo em alguns minutos.";
  }
  if (erro.codigo === 190) {
    return "A autorização desta conta expirou ou foi revogada. Reconecte a conta.";
  }
  if (erro.codigo === 4 || erro.codigo === 17 || erro.status === 429) {
    return "A Meta está limitando as chamadas agora. A sincronização será repetida automaticamente.";
  }
  if (erro.codigo === 200 || erro.tipo === "OAuthException") {
    return "Faltam permissões para esta conta. Verifique o que foi autorizado ao conectar.";
  }
  return `A Meta recusou a chamada: ${erro.message}`;
}
