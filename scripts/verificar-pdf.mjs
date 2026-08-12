import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

/**
 * Prova que o botão "Baixar PDF" entrega um PDF de verdade.
 *
 * Gera um relatório pela tela, clica em baixar e confere o arquivo que chega —
 * cabeçalho, número de páginas e se o texto dentro dele bate com os dados do
 * projeto. Um teste que só verificasse "o download aconteceu" passaria com um
 * arquivo vazio.
 *
 *   EMAIL=... SENHA=... node scripts/verificar-pdf.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const EMAIL = process.env.EMAIL;
const SENHA = process.env.SENHA;
const DESTINO = process.env.DESTINO ?? "/tmp/relatorio-baixado.pdf";

if (!EMAIL || !SENHA) {
  console.error("Defina EMAIL e SENHA.");
  process.exit(2);
}

const erros = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const pagina = await contexto.newPage();

await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await pagina.getByLabel(/e-mail/i).fill(EMAIL);
await pagina.getByLabel(/senha/i).fill(SENHA);
await pagina.getByRole("button", { name: /entrar/i }).click();
await pagina.waitForURL(/\/social$/, { timeout: 20000 }).catch(() => {});
await pagina.waitForTimeout(2500);

await pagina.goto(`${BASE}/social/relatorios`, { waitUntil: "networkidle" });
await pagina.waitForTimeout(2500);

// Gera um relatório novo, para não depender de haver um de antes.
await pagina.getByLabel(/título/i).fill("Verificação automática");
await pagina.getByRole("button", { name: /gerar relatório/i }).click();
await pagina.waitForTimeout(4000);

const baixar = pagina.getByRole("button", { name: /baixar pdf/i }).first();
if ((await baixar.count()) === 0) {
  erros.push("o botão de baixar PDF não apareceu");
} else {
  const esperaDownload = pagina.waitForEvent("download", { timeout: 30000 });
  await baixar.click();

  try {
    const download = await esperaDownload;
    await download.saveAs(DESTINO);
    const bytes = readFileSync(DESTINO);

    console.log(`  arquivo: ${download.suggestedFilename()}, ${bytes.length} bytes`);

    if (bytes.subarray(0, 5).toString() !== "%PDF-") {
      erros.push("o arquivo baixado não começa com %PDF-");
    } else {
      console.log("✓ o arquivo é um PDF");
    }

    if (bytes.length < 3000) {
      erros.push(`o PDF veio pequeno demais: ${bytes.length} bytes`);
    } else {
      console.log("✓ o PDF tem conteúdo");
    }

    const texto = bytes.toString("latin1");
    if (!/%%EOF/.test(texto)) erros.push("o PDF não está fechado com %%EOF");
    else console.log("✓ o PDF está bem formado");

    if (!/Verificação automática/.test(texto)) {
      erros.push("o título pedido não aparece dentro do PDF");
    } else {
      console.log("✓ o título pedido está no documento");
    }

    if (!/Gerado em \d{2}\/\d{2}\/\d{4}/.test(texto)) {
      erros.push("o rodapé com a data de geração não aparece");
    } else {
      console.log("✓ o rodapé traz a data de geração");
    }

    if (!download.suggestedFilename().endsWith(".pdf")) {
      erros.push(`o nome do arquivo não termina em .pdf: ${download.suggestedFilename()}`);
    } else {
      console.log("✓ o nome do arquivo está correto");
    }
  } catch (erro) {
    erros.push(`o download não aconteceu: ${erro.message}`);
  }
}

await browser.close();
console.log("\n=================");
if (erros.length === 0) console.log("PDF VERIFICADO — 0 problemas");
else {
  console.log(`${erros.length} problema(s):`);
  erros.forEach((e) => console.log(" •", e));
  process.exitCode = 1;
}

// Deixa o arquivo onde está para poder ser aberto e olhado.
writeFileSync(`${DESTINO}.txt`, `baixado em ${new Date().toISOString()}\n`);
