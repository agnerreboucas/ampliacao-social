// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Alvo de implantação.
 *
 * Sem `NITRO_PRESET`, nada muda: o build continua exatamente como era, e o
 * fluxo do Lovable segue intacto. Com a variável definida, o nitro gera o
 * pacote daquele alvo — é assim que sai a versão que roda em um servidor Node
 * próprio.
 *
 * Por que Node e não Cloudflare Workers, que é o padrão do pacote: esta
 * aplicação usa scrypt e cifra do `node:crypto`, fala com o Postgres pelo
 * driver `pg` (que abre conexão TCP) e lê o estado inteiro uma vez na subida.
 * Nada disso cabe num isolate por requisição sem reescrever a camada de dados.
 */
const preset = process.env.NITRO_PRESET;

export default defineConfig({
  nitro: preset ? { preset } : undefined,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
