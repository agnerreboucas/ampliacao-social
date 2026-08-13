import { chromium } from "playwright-core";

/** Fotografa a tela de entrada do HTML único, antes de qualquer login. */
const ARQUIVO = process.env.ARQUIVO;
const DESTINO = process.env.DESTINO ?? "/tmp";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pagina = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await pagina.goto(`file://${ARQUIVO}`, { waitUntil: "networkidle" });
await pagina.waitForTimeout(3000);
await pagina.screenshot({ path: `${DESTINO}/html-entrar.png` });
console.log("→", `${DESTINO}/html-entrar.png`);

await browser.close();
