import { chromium } from "playwright-core";

/**
 * Prova que errar a senha muitas vezes fica caro.
 *
 * Os testes de unidade de `tentativas.ts` conferem a aritmética do atraso; este
 * roteiro confere que ela está mesmo ligada ao login — que é onde importa. Ele
 * captura a chamada real de autenticação feita pela tela e a repete com a senha
 * errada, cronometrando cada resposta.
 *
 * O primeiro erro serve de controle: se ele já demorasse, o crescimento medido
 * depois não diria nada sobre o limite.
 *
 *   BASE=http://127.0.0.1:5199 EMAIL=... node scripts/verificar-limite-login.mjs
 *
 * Cuidado: ao final a conta usada fica bloqueada pelo tempo previsto em
 * `BLOQUEIO_MS`. Use um e-mail de teste.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const EMAIL = process.env.EMAIL;

if (!EMAIL) {
  console.error("Defina EMAIL de uma conta de teste antes de rodar.");
  process.exit(2);
}

const erros = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await browser.newContext();
const pagina = await contexto.newPage();

let chamada = null;
pagina.on("request", (r) => {
  if (r.url().includes("/_serverFn/") && r.method() === "POST") {
    const body = r.postData() ?? "";
    if (body.includes(EMAIL)) chamada = { url: r.url(), body, headers: r.headers() };
  }
});

await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await pagina.getByLabel(/e-mail/i).fill(EMAIL);
await pagina.getByLabel(/senha/i).fill("senha-errada-de-proposito-0");
await pagina.getByRole("button", { name: /entrar/i }).click();
await pagina.waitForTimeout(2500);

if (!chamada) {
  erros.push("a chamada de autenticação não foi capturada");
} else {
  const headers = { ...chamada.headers };
  delete headers["content-length"];
  delete headers["host"];

  /** Uma tentativa errada. Devolve quanto o servidor demorou e o que respondeu. */
  const errar = async (n) => {
    const corpo = chamada.body.replace(
      /senha-errada-de-proposito-\d+/,
      `senha-errada-de-proposito-${n}`,
    );
    const inicio = Date.now();
    const r = await contexto.request.post(chamada.url, { headers, data: corpo });
    const texto = await r.text();
    return { ms: Date.now() - inicio, texto };
  };

  const medidas = [];
  for (let n = 1; n <= 9; n += 1) {
    const { ms, texto } = await errar(n);
    const bloqueado = /Muitas tentativas/i.test(texto);
    medidas.push({ n, ms, bloqueado });
    console.log(`  erro ${n}: ${ms} ms${bloqueado ? "  (bloqueado)" : ""}`);
    if (/"session"|autenticado.*true/i.test(texto) && !/incorret|Muitas/i.test(texto)) {
      erros.push(`a tentativa ${n} com senha errada foi aceita`);
    }
  }

  const primeiras = medidas.slice(0, 2);
  const rapidas = primeiras.every((m) => m.ms < 900);
  if (!rapidas) {
    erros.push(
      `as primeiras tentativas já vieram lentas (${primeiras.map((m) => m.ms).join(", ")} ms) — o controle não vale`,
    );
  } else {
    console.log("✓ as primeiras tentativas respondem na hora: errar a senha uma vez não pune");
  }

  const cresceu = medidas.some((m) => m.ms >= 3500);
  if (!cresceu) erros.push("o atraso nunca cresceu — o limite não está ligado ao login");
  else console.log("✓ o atraso cresce a cada erro");

  const bloqueou = medidas.some((m) => m.bloqueado);
  if (!bloqueou) erros.push("a conta nunca foi bloqueada depois de muitos erros");
  else console.log("✓ depois de muitos erros, a conta é bloqueada por um tempo");
}

await browser.close();
console.log("\n=================");
if (erros.length === 0) console.log("LIMITE DE LOGIN VERIFICADO — 0 problemas");
else {
  console.log(`${erros.length} problema(s):`);
  erros.forEach((e) => console.log(" •", e));
  process.exitCode = 1;
}
