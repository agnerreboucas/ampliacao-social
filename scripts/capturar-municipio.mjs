import { chromium } from "playwright-core";

/**
 * Abre o mapa, clica num município pelo nome e fotografa o dossiê.
 *
 * O clique é no território, via o `<title>` do caminho — que é o mesmo alvo que
 * um leitor de tela usa, então o teste também prova que o mapa é navegável.
 *
 *   MUNICIPIO="Sorocaba" VISAO=alcance node scripts/capturar-municipio.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const DESTINO = process.env.DESTINO ?? "/tmp";
const PROJETO = process.env.PROJETO ?? "proj-campanha";
const MUNICIPIO = process.env.MUNICIPIO ?? "Sorocaba";
const VISAO = process.env.VISAO ?? "alcance";
const ALTURA = Number(process.env.ALTURA ?? 1600);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pagina = await browser.newPage({ viewport: { width: 1440, height: ALTURA } });
pagina.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await pagina.getByRole("button", { name: /^entrar$/i }).click();
await pagina.waitForTimeout(2500);
await pagina.goto(`${BASE}/social/mapa`, { waitUntil: "networkidle" });
await pagina.locator("select").first().selectOption(PROJETO);
await pagina.waitForTimeout(2000);

if (VISAO === "alcance") {
  await pagina.getByRole("button", { name: "alcance", exact: true }).click();
  await pagina.waitForTimeout(1000);
}

await pagina.locator(`path:has(title:text-is("${MUNICIPIO}"))`).first().click({ force: true });
await pagina.waitForTimeout(3000);

const arquivo = `${DESTINO}/municipio-${MUNICIPIO.toLowerCase().replace(/\s+/g, "-")}.png`;
await pagina.screenshot({ path: arquivo });
console.log("→", arquivo);

await browser.close();
