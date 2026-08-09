import { chromium } from "playwright-core";
import { env, exit } from "node:process";

/**
 * Mede o contraste de todo texto visível, nos dois temas.
 *
 *   npm run dev            (em outro terminal)
 *   npm run contraste
 *
 * Existe porque olho não mede contraste. Na primeira execução este verificador
 * encontrou quatro problemas que tinham passado despercebidos: a descrição dos
 * cartões a 80% de opacidade, o cinza de apoio em 4,46, o laranja como texto em
 * 3,84 e o branco sobre o azul do botão em 4,39 — todos abaixo do mínimo do
 * WCAG AA, todos invisíveis a olho nu.
 *
 * As cores são resolvidas pintando cada uma num canvas e lendo o pixel. Tentar
 * interpretar `oklch(...)` na mão produz números sem sentido — foi o primeiro
 * erro desta ferramenta.
 */

const BASE = env.BASE_URL ?? "http://127.0.0.1:5199";
const EMAIL = env.CONTRASTE_EMAIL ?? "ana@ampliacao.com.br";
const SENHA = env.CONTRASTE_SENHA ?? "demonstracao";

const TELAS = [
  ["painel", "/social"],
  ["contas", "/social/contas"],
  ["atualizar", "/social/atualizar"],
  ["publicações", "/social/publicacoes"],
  ["impulsionamentos", "/social/impulsionamentos"],
  ["relacionamento", "/social/relacionamento"],
  ["relatórios", "/social/relatorios"],
  ["equipe", "/social/equipe"],
];

const MEDIDOR = `
  const tela = document.createElement("canvas");
  tela.width = tela.height = 1;
  const ctx = tela.getContext("2d", { willReadFrequently: true });
  const pixel = (camadas) => {
    ctx.clearRect(0, 0, 1, 1);
    for (const cor of camadas) { ctx.fillStyle = cor; ctx.fillRect(0, 0, 1, 1); }
    return ctx.getImageData(0, 0, 1, 1).data;
  };
  const canal = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (p) => 0.2126 * canal(p[0]) + 0.7152 * canal(p[1]) + 0.0722 * canal(p[2]);
  const pilhaDeFundo = (el) => {
    const camadas = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const d = pixel([bg]);
      if (d[3] !== 0) { camadas.unshift(bg); if (d[3] === 255) return camadas; }
      n = n.parentElement;
    }
    camadas.unshift(getComputedStyle(document.body).backgroundColor);
    return camadas;
  };
  const contraste = (el) => {
    const fundo = pilhaDeFundo(el);
    const l1 = lum(pixel([...fundo, getComputedStyle(el).color]));
    const l2 = lum(pixel(fundo));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
`;

const medir = (page) =>
  page.evaluate(`(() => {
    ${MEDIDOR}
    const alvos = [...document.querySelectorAll("p, span, div, h1, h2, h3, a, button, label, li, td, code, strong, option")]
      .filter((el) => {
        const proprio = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
        if (proprio.length < 2) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const s = getComputedStyle(el);
        if (s.visibility === "hidden" || s.opacity === "0") return false;
        // Texto sobre gradiente (avatares, capas) não se mede pelo
        // backgroundColor. Só pula quando o gradiente vem antes de um fundo
        // opaco: o body tem gradiente decorativo sobre cor sólida, e aquele é
        // perfeitamente medível.
        let n = el;
        while (n && n !== document.documentElement) {
          const s2 = getComputedStyle(n);
          if (pixel([s2.backgroundColor])[3] === 255) break;
          if (s2.backgroundImage !== "none") return false;
          n = n.parentElement;
        }
        return true;
      });

    const ruins = [];
    for (const el of alvos) {
      const s = getComputedStyle(el);
      const tamanho = parseFloat(s.fontSize);
      const grande = tamanho >= 24 || (tamanho >= 18.66 && Number(s.fontWeight) >= 700);
      const minimo = grande ? 3 : 4.5;
      const razao = contraste(el);
      if (razao < minimo) {
        ruins.push({ texto: el.textContent.trim().slice(0, 40), razao: +razao.toFixed(2), minimo, cor: s.color, tamanho });
      }
    }
    return { total: alvos.length, ruins, tema: document.documentElement.getAttribute("data-theme") };
  })()`);

const navegador = await chromium.launch({
  executablePath: env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const problemas = [];

for (const tema of ["claro", "escuro"]) {
  const page = await navegador.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(`localStorage.setItem("ampliacao:tema", ${JSON.stringify(tema)});`);

  await page.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  console.log(`\n${tema.toUpperCase()}`);
  const entrada = await medir(page);
  if (entrada.tema !== tema) problemas.push(`${tema}: data-theme veio "${entrada.tema}"`);
  relatar("entrar", entrada, tema);

  await page.getByLabel(/e-mail/i).fill(EMAIL);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/social$/, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);

  if (/\/entrar/.test(page.url())) {
    problemas.push(
      `${tema}: não foi possível entrar como ${EMAIL} — defina CONTRASTE_EMAIL e CONTRASTE_SENHA`,
    );
    await page.close();
    continue;
  }

  for (const [nome, caminho] of TELAS) {
    if (caminho !== "/social") {
      await page.goto(`${BASE}${caminho}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
    }
    const r = await medir(page);
    if (r.tema !== tema) problemas.push(`${tema}/${nome}: data-theme virou "${r.tema}"`);
    relatar(nome, r, tema);
  }
  await page.close();
}

function relatar(nome, r, tema) {
  if (r.ruins.length === 0) {
    console.log(`  ${nome}: ${r.total} textos, todos legíveis`);
    return;
  }
  problemas.push(`${tema}/${nome}: ${r.ruins.length} de ${r.total}`);
  console.log(`  ${nome}: ${r.ruins.length} abaixo do mínimo`);
  for (const ruim of r.ruins.slice(0, 6)) {
    console.log(
      `    ${ruim.razao} < ${ruim.minimo}  "${ruim.texto}"  ${ruim.cor} @${ruim.tamanho}px`,
    );
  }
}

await navegador.close();

console.log("");
if (problemas.length === 0) {
  console.log("Contraste suficiente em todo texto, nos dois temas.");
} else {
  console.log(`${problemas.length} problema(s):`);
  for (const p of problemas) console.log(" •", p);
  exit(1);
}
