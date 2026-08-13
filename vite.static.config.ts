import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Build de demonstração: gera a plataforma inteira como um site estático, sem
 * servidor. Usado por `bun run build:html`, que depois costura o resultado em um
 * único arquivo HTML autocontido.
 *
 * Três diferenças em relação ao build normal (`vite.config.ts`):
 *   1. Não usa o plugin do TanStack Start — aqui não há SSR nem rotas de API.
 *   2. `@tanstack/react-start` é apontado para um shim que executa os handlers
 *      no navegador, no lugar de chamá-los por HTTP.
 *   3. A rota raiz é trocada por uma versão sem o shell de `<html>`/`<body>`,
 *      que só faz sentido quando existe renderização no servidor.
 *   4. Os módulos `.server` da integração com a Meta viram um stub — nenhum
 *      segredo de aplicativo pode existir em um arquivo que se compartilha.
 */
const resolvePath = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@tanstack\/react-start$/, replacement: resolvePath("./src/static/start-shim.ts") },
      { find: /\.\/routes\/__root$/, replacement: resolvePath("./src/static/root.tsx") },
      // Módulos de servidor não existem no navegador: sem node:crypto, sem
      // variáveis de ambiente e — principalmente — sem segredo de aplicativo.
      // O stub faz a integração aparecer como não configurada.
      {
        find: /^@\/lib\/config\.server$/,
        replacement: resolvePath("./src/static/servidor-stub.ts"),
      },
      {
        find: /^@\/lib\/social\/credenciais\.server$/,
        replacement: resolvePath("./src/static/servidor-stub.ts"),
      },
      {
        find: /^@\/lib\/social\/oauth\/meta\.server$/,
        replacement: resolvePath("./src/static/servidor-stub.ts"),
      },
      {
        find: /^@\/lib\/social\/windsor\/cliente\.server$/,
        replacement: resolvePath("./src/static/servidor-stub.ts"),
      },
      // Os dados manuais não vêm do disco no navegador: vêm de uma tag
      // <script type="application/json"> que o build-html embute. O alias
      // precisa casar o especificador inteiro — o Vite troca só o trecho que a
      // expressão captura, e um casamento parcial produziria um caminho colado.
      {
        find: /^@\/lib\/social\/snapshot\.server$/,
        replacement: resolvePath("./src/static/dados-embutidos.ts"),
      },
      {
        find: /^\.\/snapshot\.server$/,
        replacement: resolvePath("./src/static/dados-embutidos.ts"),
      },
      // `scrypt` mora em node:crypto. Na demonstração não há senha para conferir.
      {
        find: /^@\/lib\/social\/senha\.server$/,
        replacement: resolvePath("./src/static/senha-stub.ts"),
      },
      {
        find: /^\.\/senha\.server$/,
        replacement: resolvePath("./src/static/senha-stub.ts"),
      },
      // A sessão real mora num cookie selado pelo servidor. Na demonstração ela
      // vive numa variável — mas a *regra* de autorização é copiada, não
      // afrouxada: um gestor continua sem ver projeto que não é dele.
      {
        find: /^@\/lib\/social\/sessao\.server$/,
        replacement: resolvePath("./src/static/sessao-stub.ts"),
      },
      {
        find: /^\.\/sessao\.server$/,
        replacement: resolvePath("./src/static/sessao-stub.ts"),
      },
      // O histórico grava no Postgres; aqui fica em memória, e a tela avisa
      // disso sozinha — é o mesmo estado de "sem banco configurado".
      {
        find: /^@\/lib\/social\/historico\.server$/,
        replacement: resolvePath("./src/static/historico-stub.ts"),
      },
      {
        find: /^\.\/historico\.server$/,
        replacement: resolvePath("./src/static/historico-stub.ts"),
      },
      {
        find: /^@\/lib\/social\/banco\/postgres\.server$/,
        replacement: resolvePath("./src/static/servidor-stub.ts"),
      },
      { find: /^@\//, replacement: `${resolvePath("./src")}/` },
    ],
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  build: {
    outDir: "dist-static",
    emptyOutDir: true,
    // Um único chunk de JS e um de CSS simplificam a costura do HTML final.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: resolvePath("./index.static.html"),
      output: {
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: "app[extname]",
      },
    },
  },
});
