import { chromium } from "playwright-core";

/** Abre a Agenda na visão de produção e fotografa o quadro. */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const DESTINO = process.env.DESTINO ?? "/tmp";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pagina = await browser.newPage({ viewport: { width: 1440, height: 900 } });
pagina.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await pagina.getByRole("button", { name: /^entrar$/i }).click();
await pagina.waitForTimeout(2500);
await pagina.goto(`${BASE}/social/agenda`, { waitUntil: "networkidle" });
await pagina.waitForTimeout(2000);
await pagina.getByRole("button", { name: "Produção", exact: true }).click();
await pagina.waitForTimeout(2000);

await pagina.screenshot({ path: `${DESTINO}/quadro.png` });
console.log("→", `${DESTINO}/quadro.png`);

// E o mesmo quadro com uma coluna cheia recolhida, que é o gesto que ele pediu.
await pagina.getByRole("button", { name: /Recolher Publicado/i }).click();
await pagina.waitForTimeout(1000);
await pagina.screenshot({ path: `${DESTINO}/quadro-recolhido.png` });
console.log("→", `${DESTINO}/quadro-recolhido.png`);

await browser.close();
