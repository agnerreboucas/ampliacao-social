import { chromium } from "playwright-core";

/**
 * Prova que o histórico registra o que aconteceu de verdade.
 *
 * O roteiro age na plataforma — erra a senha, entra, registra uma leitura de
 * números, sai — e depois abre a tela de histórico procurando por essas mesmas
 * ações. Conferir a tabela do banco direto seria mais fácil e provaria menos:
 * o que interessa é que o caminho inteiro funcione, da ação até a linha que o
 * administrador lê.
 *
 * Também confere quem *não* pode ver: a tela é restrita, e uma tela restrita
 * que não recusa ninguém é decoração.
 *
 *   BASE=http://127.0.0.1:5199 \
 *   ADMIN_EMAIL=... ADMIN_SENHA=... GESTOR_EMAIL=... GESTOR_SENHA=... \
 *   node scripts/verificar-historico.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_SENHA = process.env.ADMIN_SENHA;
const GESTOR_EMAIL = process.env.GESTOR_EMAIL;
const GESTOR_SENHA = process.env.GESTOR_SENHA;

if (!ADMIN_EMAIL || !ADMIN_SENHA) {
  console.error("Defina ADMIN_EMAIL e ADMIN_SENHA de uma conta administradora de teste.");
  process.exit(2);
}

const erros = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const entrar = async (pagina, email, senha) => {
  await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
  await pagina.getByLabel(/e-mail/i).fill(email);
  await pagina.getByLabel(/senha/i).fill(senha);
  await pagina.getByRole("button", { name: /entrar/i }).click();
  await pagina.waitForURL(/\/social$/, { timeout: 20000 }).catch(() => {});
  await pagina.waitForTimeout(2000);
};

// --- 1. Gera ações para o histórico ter o que registrar --------------------

const contextoGestor = await browser.newContext();
const gestor = await contextoGestor.newPage();

// Uma senha errada de propósito: é a linha que mais importa numa auditoria.
await gestor.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await gestor.getByLabel(/e-mail/i).fill(GESTOR_EMAIL ?? ADMIN_EMAIL);
await gestor.getByLabel(/senha/i).fill("esta-senha-esta-errada");
await gestor.getByRole("button", { name: /entrar/i }).click();
await gestor.waitForTimeout(2500);

if (GESTOR_EMAIL && GESTOR_SENHA) {
  await entrar(gestor, GESTOR_EMAIL, GESTOR_SENHA);
  if (/\/entrar/.test(gestor.url())) {
    const aviso = await gestor.locator("body").innerText();
    erros.push(
      `a conta de gestor não entrou: ${(aviso.match(/[^\n]*(?:incorret|senha|tentativas)[^\n]*/i) ?? ["sem mensagem"])[0]}`,
    );
  } else {
    // A tela restrita não pode se abrir para quem não é administrador.
    await gestor.goto(`${BASE}/social/historico`, { waitUntil: "networkidle" });
    await gestor.waitForTimeout(2500);
    const corpo = await gestor.locator("body").innerText();
    const vazou = /Linha do tempo/i.test(corpo) && /Quem está usando/i.test(corpo);
    if (vazou) erros.push("um gestor conseguiu abrir o histórico");
    else console.log("✓ gestor não vê o histórico");
  }
}
await contextoGestor.close();

// --- 2. Administrador age e depois procura a própria ação -------------------

const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const admin = await contexto.newPage();
await entrar(admin, ADMIN_EMAIL, ADMIN_SENHA);

if (/\/entrar/.test(admin.url())) {
  erros.push("o administrador não entrou com a senha certa");
} else {
  console.log("✓ administrador entrou");

  // Registra uma leitura de números: ação de rotina, a mais comum do dia a dia.
  await admin.goto(`${BASE}/social/atualizar`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(2500);
  const campos = admin.locator('input[type="number"]');
  const quantos = await campos.count();
  if (quantos === 0) {
    console.log("  (sem formulário de leitura nesta instalação; pulando esta ação)");
  } else {
    for (let i = 0; i < quantos; i += 1) {
      await campos.nth(i).fill(String(1000 + i * 137));
    }
    const salvar = admin.getByRole("button", { name: /salvar|registrar|gravar/i }).first();
    if (await salvar.count()) {
      await salvar.click();
      await admin.waitForTimeout(3000);
      console.log("✓ leitura de números registrada");
    }
  }

  // --- 3. O histórico mostra o que acabou de acontecer ----------------------

  await admin.goto(`${BASE}/social/historico`, { waitUntil: "networkidle" });
  await admin.waitForTimeout(3000);
  const texto = await admin.locator("body").innerText();

  const esperados = [
    ["a própria entrada", /entrou na plataforma/i],
    ["a entrada recusada", /entrada recusada/i],
    ["o resumo por pessoa", /Quem está usando/i],
    ["a linha do tempo", /Linha do tempo/i],
  ];

  for (const [nome, padrao] of esperados) {
    if (padrao.test(texto)) console.log(`✓ histórico mostra ${nome}`);
    else erros.push(`o histórico não mostra ${nome}`);
  }

  // O nome de quem agiu precisa aparecer escrito, não o id.
  if (/user-[a-z]+/.test(texto)) {
    erros.push("o histórico mostra identificadores crus onde deveria mostrar nomes");
  } else {
    console.log("✓ histórico mostra nomes, não identificadores");
  }

  // Filtrar por área tem de mudar o que se vê.
  //
  // O seletor é achado pelo que ele oferece, não por posição: a barra lateral
  // tem o seu próprio `select` de projeto, e contar índices quebraria a cada
  // mudança de layout.
  const seletorArea = admin
    .locator("select")
    .filter({ has: admin.locator('option[value="Acesso"]') });
  if (await seletorArea.count()) {
    await seletorArea.selectOption("Acesso");
    await admin.waitForTimeout(2500);
    const filtrado = await admin.locator("body").innerText();
    if (/registrou uma leitura/i.test(filtrado)) {
      erros.push("o filtro por área não excluiu ações de outras áreas");
    } else if (/entrou na plataforma/i.test(filtrado)) {
      console.log("✓ o filtro por área realmente filtra");
    } else {
      erros.push("o filtro por área esvaziou a lista inteira");
    }
  }

  await admin.screenshot({
    path: process.env.CAPTURA ?? "/tmp/historico.png",
    fullPage: true,
  });
}

await browser.close();
console.log("\n=================");
if (erros.length === 0) console.log("HISTÓRICO VERIFICADO — 0 problemas");
else {
  console.log(`${erros.length} problema(s):`);
  erros.forEach((e) => console.log(" •", e));
  process.exitCode = 1;
}
