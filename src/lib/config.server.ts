import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    // Add server-only values here, e.g.:
    //   databaseUrl: process.env.DATABASE_URL,
    //   stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  };
}

/**
 * Configuração da integração com a Meta (Facebook e Instagram).
 *
 * Enquanto o app da Meta não existir, `habilitada` é falso e a plataforma segue
 * no modo demonstração — nada quebra, a tela apenas explica o que falta. Ao
 * preencher as três variáveis, o botão "Conectar" passa a abrir o OAuth real.
 *
 * Passo a passo de como obter cada valor: docs/integracao-meta.md
 */
export function getMetaConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_REDIRECT_URI;

  return {
    appId,
    appSecret,
    redirectUri,
    /** Ajuste quando a Meta descontinuar a versão em uso. */
    versaoGraph: process.env.META_GRAPH_VERSION,
    /** Chave para cifrar tokens em repouso — `openssl rand -base64 32`. */
    chaveCriptografia: process.env.SOCIAL_CRYPTO_KEY,
    habilitada: Boolean(appId && appSecret && redirectUri),
  };
}

/**
 * Integração com o Windsor.ai.
 *
 * O Windsor é um agregador: o cliente conecta as contas lá (Meta Ads, Google
 * Ads, GA4, Instagram orgânico e mais de 350 fontes) e a plataforma lê tudo com
 * uma única chave. É o caminho mais rápido para dados reais, porque **não
 * depende da revisão do aplicativo pela Meta**.
 *
 * Passo a passo: docs/integracao-windsor.md
 */
export function getWindsorConfig() {
  const apiKey = process.env.WINDSOR_API_KEY;
  return {
    apiKey,
    /** Útil para apontar a um proxy interno ou a um ambiente de testes. */
    baseUrl: process.env.WINDSOR_BASE_URL,
    habilitada: Boolean(apiKey),
  };
}
