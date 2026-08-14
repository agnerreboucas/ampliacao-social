import { chromium } from "playwright-core";

/**
 * Fotografa telas do HTML único, abrindo o arquivo direto do disco.
 *
 * É a única forma de ver o que a pessoa que receber o arquivo vai ver: o build
 * estático troca os módulos de servidor por versões de navegador, e uma tela
 * pode passar no `vite build` e mesmo assim não desenhar aqui.
 *
 *   ARQUIVO=/caminho/social-hub.html TELAS="Mapa de SP,Público" \
 *   DESTINO=/tmp node scripts/capturar-html.mjs
 */
const ARQUIVO = process.env.ARQUIVO;
const TELAS = (process.env.TELAS ?? "Mapa de SP").split(",").filter(Boolean);
const DESTINO = process.env.DESTINO ?? "/tmp";
const ALTURA = Number(process.env.ALTURA ?? 1400);
const PROJETO = process.env.PROJETO ?? "proj-mercadinho";

if (!ARQUIVO) {
  console.error("Defina ARQUIVO com o caminho do HTML.");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pagina = await browser.newPage({ viewport: { width: 1440, height: ALTURA } });

await pagina.goto(`file://${ARQUIVO}`, { waitUntil: "networkidle" });
await pagina.getByLabel(/e-mail/i).fill(process.env.EMAIL ?? "campanha.neoncunha@gmail.com");
await pagina.getByLabel(/senha/i).fill("demonstracao");
await pagina.getByRole("button", { name: /entrar/i }).click();
await pagina.waitForTimeout(3000);
// O seletor de projeto só existe quando há mais de um; a demonstração da
// campanha tem um só, e insistir nele derruba a captura.
const seletor = pagina.locator("select").first();
if ((await seletor.locator(`option[value="${PROJETO}"]`).count()) > 0) {
  await seletor.selectOption(PROJETO);
  await pagina.waitForTimeout(1500);
}

for (const tela of TELAS) {
  await pagina
    .getByRole("link", { name: new RegExp(`^${tela}`, "i") })
    .first()
    .click();
  await pagina.waitForTimeout(3000);

  const arquivo = `${DESTINO}/html-${tela.toLowerCase().replace(/\s+/g, "-")}.png`;
  await pagina.screenshot({ path: arquivo });
  console.log("→", arquivo);
}

await browser.close();
