import { chromium } from "playwright-core";

/**
 * Tira fotos das telas indicadas, nos dois temas.
 *
 * Serve para olhar o resultado em vez de imaginá-lo — e para comparar claro e
 * escuro lado a lado, que é onde os problemas de contraste aparecem.
 *
 *   EMAIL=... SENHA=... ROTAS=/social/geral,/social/historico \
 *   DESTINO=/tmp/telas node scripts/capturar-telas.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const EMAIL = process.env.EMAIL;
const SENHA = process.env.SENHA;
const ROTAS = (process.env.ROTAS ?? "/social/geral").split(",").filter(Boolean);
const DESTINO = process.env.DESTINO ?? "/tmp";
const TEMAS = (process.env.TEMAS ?? "claro,escuro").split(",").filter(Boolean);

if (!EMAIL || !SENHA) {
  console.error("Defina EMAIL e SENHA.");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const pagina = await contexto.newPage();

await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await pagina.getByLabel(/e-mail/i).fill(EMAIL);
await pagina.getByLabel(/senha/i).fill(SENHA);
await pagina.getByRole("button", { name: /entrar/i }).click();
await pagina.waitForURL(/\/social$/, { timeout: 20000 }).catch(() => {});
await pagina.waitForTimeout(2500);

for (const tema of TEMAS) {
  // O tema é decidido por um atributo na raiz; forçá-lo direto evita depender
  // da posição dos botões do seletor.
  await pagina.evaluate((valor) => {
    document.documentElement.setAttribute("data-theme", valor);
  }, tema);

  for (const rota of ROTAS) {
    await pagina.goto(`${BASE}${rota}`, { waitUntil: "networkidle" });
    await pagina.evaluate((valor) => {
      document.documentElement.setAttribute("data-theme", valor);
    }, tema);
    await pagina.waitForTimeout(3000);

    const nome = rota.replace(/^\/social\/?/, "") || "painel";
    const arquivo = `${DESTINO}/${nome.replace(/\//g, "-")}-${tema}.png`;
    await pagina.screenshot({ path: arquivo, fullPage: true });
    console.log("→", arquivo);
  }
}

await browser.close();
