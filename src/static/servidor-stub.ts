import type { DailyMetric } from "../lib/social/types";
import type { ContaDescoberta } from "../lib/social/oauth/meta";

/**
 * Substituto dos módulos de servidor no build estático (`bun run build:html`).
 *
 * A demonstração em HTML roda inteira no navegador, onde não existe `node:crypto`
 * nem variável de ambiente — e onde um segredo de aplicativo jamais poderia
 * estar. Por isso o build estático aponta `config.server`, `credenciais.server` e
 * `oauth/meta.server` para este arquivo.
 *
 * O efeito é honesto: a integração aparece como não configurada e a plataforma
 * se comporta exatamente como no modo demonstração.
 */

const INDISPONIVEL = "A conexão com as redes não existe na demonstração em HTML.";

// --- config.server ---------------------------------------------------------

export function getServerConfig() {
  return { nodeEnv: "demonstracao" };
}

export function getMetaConfig() {
  return {
    appId: undefined,
    appSecret: undefined,
    redirectUri: undefined,
    versaoGraph: undefined,
    chaveCriptografia: undefined,
    habilitada: false,
  };
}

export function getWindsorConfig() {
  return { apiKey: undefined, baseUrl: undefined, habilitada: false };
}

// --- credenciais.server ----------------------------------------------------

export function registrarState(): void {}
export function consumirState(): null {
  return null;
}
export function guardarDescoberta(): void {}
export function lerDescoberta(): null {
  return null;
}
export function descartarDescoberta(): void {}
export function salvarCredencial(): void {}
export function temCredencial(): boolean {
  return false;
}
export function lerCredencial(): null {
  return null;
}
export function revelarToken(): null {
  return null;
}
export function removerCredencial(): void {}

// --- oauth/meta.server -----------------------------------------------------

export function gerarState(): string {
  return "demonstracao";
}

export async function trocarCodigoPorToken(): Promise<string> {
  throw new Error(INDISPONIVEL);
}

export async function obterTokenLongaDuracao(): Promise<{
  token: string;
  expiraEm: number | null;
}> {
  throw new Error(INDISPONIVEL);
}

export async function descobrirContas(): Promise<ContaDescoberta[]> {
  throw new Error(INDISPONIVEL);
}

export async function buscarInsights(): Promise<DailyMetric[]> {
  throw new Error(INDISPONIVEL);
}

export function explicarErro(): string {
  return INDISPONIVEL;
}

// --- windsor/cliente.server ------------------------------------------------

export async function buscarMidiaPaga(): Promise<never> {
  throw new Error(INDISPONIVEL);
}

export function explicarErroWindsor(): string {
  return INDISPONIVEL;
}
