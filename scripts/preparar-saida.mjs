#!/usr/bin/env node
/**
 * Deixa o build no lugar onde uma hospedagem procura por ele.
 *
 * O problema, na prática: esta pilha (vite + nitro 3 + o preset do Lovable)
 * escreve o build em `dist/` — `dist/client` para o navegador e `dist/server`
 * para o Node. Só que `.output` é a convenção do nitro, e é lá que a Hostinger
 * (e qualquer painel que reconheça nitro) vai olhar. A implantação falhava
 * dizendo, com toda a razão, que não achou a pasta configurada.
 *
 * Este script move o build inteiro de `dist` para `.output`, preservando os
 * nomes das subpastas. Preservar importa: o bundle do servidor referencia os
 * arquivos do navegador por caminho relativo (`../client/assets/...`), então
 * renomear `client` para `public` — que seria o nome mais "padrão" — quebraria
 * o carregamento de todos os assets.
 *
 * Move em vez de copiar porque o build é regenerado do zero a cada vez, e
 * duplicar centenas de megabytes na pasta de implantação é desperdício que
 * aparece na conta.
 *
 * Não faz nada quando não há build de servidor: é o caso do sandbox do Lovable,
 * onde o nitro roda com outro alvo e o fluxo de lá não deve ser mexido.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Dentro do sandbox do Lovable o build é publicado de `dist`, por um fluxo que
 * não é este. Mover a pasta ali quebraria a publicação de lá — então o script
 * sai antes de tocar em qualquer coisa. As duas variáveis são as mesmas que o
 * pacote de configuração do Lovable consulta.
 */
if (process.env.LOVABLE_SANDBOX === "1" || process.env.DEV_SERVER__PROJECT_PATH) {
  console.log("Sandbox do Lovable — o build fica em dist, como o fluxo de lá espera.");
  process.exit(0);
}

const raiz = process.cwd();
const origem = path.join(raiz, "dist");
const destino = path.join(raiz, ".output");

const entrada = path.join(origem, "server", "index.mjs");
if (!existsSync(entrada)) {
  console.log("Sem build de servidor em dist/server — nada a preparar.");
  process.exit(0);
}

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

for (const item of await readdir(origem)) {
  await rename(path.join(origem, item), path.join(destino, item));
}

await rm(origem, { recursive: true, force: true });

/**
 * O `nitro.json` que o nitro gerou aponta para onde os arquivos estavam antes.
 * Reescrever é o que faz um painel que lê esse arquivo encontrar o servidor.
 */
const manifesto = path.join(destino, "nitro.json");
const anterior = existsSync(manifesto)
  ? JSON.parse(await readFile(manifesto, "utf8"))
  : { framework: { name: "nitro" } };

await writeFile(
  manifesto,
  `${JSON.stringify(
    {
      ...anterior,
      serverEntry: "./server/index.mjs",
      publicDir: "./client",
      commands: { preview: "node ./server/index.mjs" },
    },
    null,
    2,
  )}\n`,
);

console.log("Build pronto em .output — servidor em .output/server/index.mjs.");
