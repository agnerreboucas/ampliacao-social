import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Costura o resultado de `vite.static.config.ts` em um único arquivo HTML
 * autocontido — sem CSS, JS ou fontes externas.
 *
 * O arquivo gerado abre em qualquer lugar: hospedagem estática, um link
 * compartilhado ou até direto do disco. Serve para demonstrar a plataforma sem
 * subir servidor; os dados continuam sendo os mesmos dados semeados da
 * aplicação real, e o que for criado durante a visita vive só naquela aba.
 *
 * Uso: bun run build:html   (roda o build estático antes)
 */

const dist = (name) => fileURLToPath(new URL(`../dist-static/${name}`, import.meta.url));

const [css, js] = await Promise.all([
  readFile(dist("app.css"), "utf-8"),
  readFile(dist("app.js"), "utf-8"),
]);

// Uma ocorrência literal de "</script>" dentro do bundle encerraria a tag antes
// da hora; escapar a barra mantém o JavaScript idêntico para o motor.
const inlineJs = js.replace(/<\/script>/gi, "<\\/script>");

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Social Hub — Ampliação Marketing Digital</title>
    <meta
      name="description"
      content="Plataforma de gestão e métricas de redes sociais: crescimento, publicação, impulsionamento e caixa de entrada unificada."
    />
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
${inlineJs}
    </script>
  </body>
</html>
`;

const output = dist("social-hub.html");
await writeFile(output, html, "utf-8");

const sizeMb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`HTML único gerado: dist-static/social-hub.html (${sizeMb} MB)`);
