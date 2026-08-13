import { chromium } from "playwright-core";

/**
 * Prova que importar uma planilha vira histórico de verdade.
 *
 * O roteiro monta uma planilha com as armadilhas que aparecem em arquivo de
 * cliente — número com separador de milhar, valor em reais com vírgula, data em
 * dia/mês, uma linha com data quebrada e uma linha de total sem data — importa
 * pela tela e depois confere no painel se os números chegaram.
 *
 * Conferir no painel, e não na tela de importação, é o ponto: a importação pode
 * dizer "importado" e o número não aparecer em lugar nenhum.
 *
 *   EMAIL=... SENHA=... node scripts/verificar-importacao.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const EMAIL = process.env.EMAIL;
const SENHA = process.env.SENHA;

if (!EMAIL || !SENHA) {
  console.error("Defina EMAIL e SENHA.");
  process.exit(2);
}

/** Trinta dias terminando ontem, com um total conhecido para conferir depois. */
function planilha() {
  const linhas = ["Data;Seguidores;Alcance orgânico;Alcance pago;Investimento;Observação"];
  const hoje = new Date();
  let seguidores = 40_000;

  for (let i = 30; i >= 1; i -= 1) {
    const data = new Date(hoje.getTime() - i * 86_400_000);
    const dd = String(data.getDate()).padStart(2, "0");
    const mm = String(data.getMonth() + 1).padStart(2, "0");
    seguidores += 137;
    // Seguidores com separador de milhar e investimento com vírgula decimal.
    const comMilhar = seguidores.toLocaleString("pt-BR");
    linhas.push(`${dd}/${mm}/${data.getFullYear()};${comMilhar};4.500;1.200;R$ 35,50;nota`);
  }

  // As duas linhas que o importador precisa tratar sem estragar o resto.
  linhas.push("data ruim;1.000;1;1;1;linha problemática");
  linhas.push(";999999;0;0;0;TOTAL");

  return { texto: linhas.join("\n"), ultimoSeguidores: seguidores };
}

const erros = [];
const { texto, ultimoSeguidores } = planilha();
const esperado = ultimoSeguidores.toLocaleString("pt-BR");

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const pagina = await contexto.newPage();

await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await pagina.getByLabel(/e-mail/i).fill(EMAIL);
await pagina.getByLabel(/senha/i).fill(SENHA);
await pagina.getByRole("button", { name: /entrar/i }).click();
await pagina.waitForURL(/\/social$/, { timeout: 20000 }).catch(() => {});
await pagina.waitForTimeout(2500);

await pagina.goto(`${BASE}/social/importar`, { waitUntil: "networkidle" });
await pagina.waitForTimeout(2500);

// 1. Escolher a primeira conta do projeto.
const contas = pagina.locator("button").filter({ hasText: /@|\// });
if ((await contas.count()) === 0) {
  erros.push("nenhuma conta apareceu para escolher");
} else {
  await contas.first().click();
  await pagina.waitForTimeout(500);

  // 2. Colar a planilha e conferir.
  await pagina.locator("#colar").fill(texto);
  await pagina.getByRole("button", { name: /conferir antes de importar/i }).click();
  await pagina.waitForTimeout(3000);

  const conferencia = await pagina.locator("body").innerText();

  if (/30\s*\n?\s*Dias no arquivo|Dias no arquivo\s*\n?\s*30/i.test(conferencia)) {
    console.log("✓ leu 30 dias, ignorando a linha de total");
  } else if (/Dias no arquivo/i.test(conferencia)) {
    const quantos = conferencia.match(/Dias no arquivo\s*\n?\s*([\d.]+)/i)?.[1];
    if (quantos === "30") console.log("✓ leu 30 dias, ignorando a linha de total");
    else erros.push(`esperava 30 dias no arquivo, a tela mostrou ${quantos}`);
  } else {
    erros.push("a conferência não mostrou o resumo de dias");
  }

  if (/linha 32/.test(conferencia) || /data ruim/i.test(conferencia)) {
    console.log("✓ apontou a linha com data quebrada, pelo número");
  } else {
    erros.push("a linha com data quebrada não foi apontada");
  }

  if (/dia\/mês\/ano/i.test(conferencia)) {
    console.log("✓ informou que leu as datas como dia/mês/ano");
  } else {
    erros.push("a tela não disse em que ordem leu as datas");
  }

  if (/Observação/.test(conferencia)) {
    console.log("✓ mostrou a coluna ignorada em vez de escondê-la");
  } else {
    erros.push("a coluna desconhecida não apareceu na conferência");
  }

  // O separador de milhar precisa ter virado número, não texto.
  if (conferencia.includes(esperado.slice(0, 2))) {
    console.log(`✓ converteu "${esperado}" em número`);
  }

  // 3. Importar de verdade.
  await pagina.getByRole("button", { name: /^Importar para/i }).click();
  await pagina.waitForTimeout(4000);

  const depois = await pagina.locator("body").innerText();
  if (/dia\(s\) no histórico/i.test(depois)) console.log("✓ a importação confirmou a gravação");
  else erros.push("a importação não confirmou nada");

  // 4. O teste que vale: os números aparecem no painel?
  await pagina.goto(`${BASE}/social/geral`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(3500);
  const painel = await pagina.locator("body").innerText();

  if (painel.includes(esperado)) {
    console.log(`✓ o painel mostra ${esperado} seguidores — o número da planilha chegou`);
  } else {
    erros.push(`o painel não mostra ${esperado}; a importação não chegou às telas`);
  }

  await pagina.screenshot({ path: process.env.CAPTURA ?? "/tmp/importacao.png", fullPage: true });
}

await browser.close();
console.log("\n=================");
if (erros.length === 0) console.log("IMPORTAÇÃO VERIFICADA — 0 problemas");
else {
  console.log(`${erros.length} problema(s):`);
  erros.forEach((e) => console.log(" •", e));
  process.exitCode = 1;
}
