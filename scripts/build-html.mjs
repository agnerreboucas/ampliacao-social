import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// O mesmo script que a versão com servidor injeta no <head>. Importado daqui em
// vez de copiado: tema resolvido de dois jeitos diferentes é tema que diverge.
import { SCRIPT_TEMA_INICIAL } from "../src/lib/social/tema.ts";

/**
 * Costura o resultado de `vite.static.config.ts` em um único arquivo HTML
 * autocontido — sem CSS, JS ou fontes externas.
 *
 * O arquivo gerado abre em qualquer lugar: hospedagem estática, um link
 * compartilhado ou até direto do disco. Serve para demonstrar a plataforma sem
 * subir servidor; os dados continuam sendo os mesmos dados semeados da
 * aplicação real, e o que for criado durante a visita vive só naquela aba.
 *
 * Se existir `dados/plataforma.json`, o conteúdo é embutido em uma tag
 * `<script type="application/json">` e a plataforma abre com esses números em
 * vez da semente de demonstração. É assim que a atualização manual chega ao
 * HTML publicado: digitar, commitar o JSON, e o build faz o resto.
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

const arquivoDeDados = fileURLToPath(new URL("../dados/plataforma.json", import.meta.url));
let tagDeDados = "";
if (existsSync(arquivoDeDados)) {
  const dados = await readFile(arquivoDeDados, "utf-8");
  // O mesmo cuidado da tag de script: dentro de JSON, "<" só aparece em texto,
  // então escapá-lo é seguro e impede que a tag feche antes da hora.
  const seguro = dados.replace(/</g, "\\u003c");
  tagDeDados = `\n    <script type="application/json" id="dados-plataforma">${seguro}</script>`;
  console.log(`Dados embutidos: dados/plataforma.json (${(Buffer.byteLength(dados) / 1024).toFixed(0)} KB)`);
} else {
  console.log("Sem dados/plataforma.json — o HTML sai com a semente de demonstração.");
}

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
    <script>
${SCRIPT_TEMA_INICIAL}
    </script>
  </head>
  <body>
    <div id="root"></div>${tagDeDados}
    <script type="module">
${inlineJs}
    </script>
  </body>
</html>
`;

// Dois nomes, mesmo conteúdo: `social-hub.html` é o arquivo que se baixa e se
// manda por WhatsApp; `index.html` é o que a hospedagem estática serve na raiz.
await writeFile(dist("social-hub.html"), html, "utf-8");
await writeFile(dist("index.html"), html, "utf-8");

const sizeMb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`HTML único gerado: dist-static/social-hub.html (${sizeMb} MB)`);
console.log("Cópia para hospedagem: dist-static/index.html");
