import { chromium } from "playwright-core";

/**
 * Prova que o HTML único funciona sozinho.
 *
 * Abre o arquivo direto do disco — sem servidor, sem rede — entra, e percorre
 * as telas conferindo que cada uma mostra o que promete. É o teste que importa
 * para uma demonstração: ela vai ser aberta exatamente assim por quem receber
 * o arquivo.
 *
 * Qualquer requisição para fora é interceptada e registrada. Um arquivo que se
 * diz autocontido e busca uma fonte na internet quebra na primeira máquina sem
 * conexão, e ninguém descobre até a reunião.
 *
 *   ARQUIVO=/caminho/social-hub.html node scripts/verificar-html.mjs
 */
const ARQUIVO = process.env.ARQUIVO;
if (!ARQUIVO) {
  console.error("Defina ARQUIVO com o caminho do HTML.");
  process.exit(2);
}

const erros = [];
const externas = [];
const problemasNoConsole = [];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const pagina = await contexto.newPage();

pagina.on("request", (r) => {
  if (/^https?:/.test(r.url())) externas.push(r.url());
});
pagina.on("console", (m) => {
  if (m.type() === "error") problemasNoConsole.push(m.text());
});
pagina.on("pageerror", (e) => problemasNoConsole.push(String(e)));

await pagina.goto(`file://${ARQUIVO}`, { waitUntil: "networkidle" });
await pagina.waitForTimeout(2500);

// --- Entrar -----------------------------------------------------------------

const campoEmail = pagina.getByLabel(/e-mail/i);
if ((await campoEmail.count()) === 0) {
  erros.push("a tela de entrada não apareceu");
} else {
  await campoEmail.fill("ana@ampliacao.com.br");
  await pagina.getByLabel(/senha/i).fill("qualquer-coisa");
  await pagina.getByRole("button", { name: /entrar/i }).click();
  await pagina.waitForTimeout(3000);

  const painel = await pagina.locator("body").innerText();
  if (/Painel/i.test(painel) && /SEGUIDORES/i.test(painel)) {
    console.log("✓ entrou e o painel carregou");
  } else {
    erros.push("não chegou ao painel depois de entrar");
  }

  // --- O que o painel precisa mostrar ---------------------------------------

  if (/SUAS REDES/i.test(painel)) console.log("✓ o painel traz os cartões por rede");
  else erros.push("os cartões por rede não apareceram no painel");

  for (const rede of ["Instagram", "Facebook", "TikTok", "YouTube"]) {
    if (painel.includes(rede)) console.log(`✓ cartão de ${rede}`);
    else erros.push(`faltou o cartão de ${rede}`);
  }

  // --- Descer um nível: clicar num cartão -----------------------------------

  await pagina
    .getByRole("link", { name: /Instagram/i })
    .first()
    .click();
  await pagina.waitForTimeout(3000);
  const detalheDaRede = await pagina.locator("body").innerText();

  if (/CURVA DE SEGUIDORES/i.test(detalheDaRede) && /PERFIS DESTA REDE/i.test(detalheDaRede)) {
    console.log("✓ o cartão abre o detalhe da rede");
  } else {
    erros.push("clicar no cartão não abriu o detalhe da rede");
  }

  // --- Percorrer as demais telas --------------------------------------------

  const telas = [
    ["Visão geral", /CANAL A CANAL/i],
    ["Contas", /conta|perfil/i],
    ["Importar histórico", /Traga a planilha|Escolha a conta/i],
    ["Conteúdo", /Peça a peça|Por formato/i],
    ["Público", /Cidades|De onde vêm estes números/i],
    ["Publicações", /publica/i],
    ["Relacionamento", /interaç|coment/i],
    ["Relatórios", /relat/i],
    ["Equipe", /papel|Administrador/i],
    ["Histórico", /Linha do tempo|Quem está usando/i],
  ];

  for (const [nome, esperado] of telas) {
    // Sem âncora no fim: itens com contador têm o número no nome acessível,
    // como "Relacionamento 9".
    const link = pagina.getByRole("link", { name: new RegExp(`^${nome}`, "i") }).first();
    if ((await link.count()) === 0) {
      erros.push(`o menu não tem "${nome}"`);
      continue;
    }
    await link.click();
    await pagina.waitForTimeout(2200);
    const corpo = await pagina.locator("body").innerText();
    if (esperado.test(corpo)) console.log(`✓ ${nome}`);
    else erros.push(`a tela "${nome}" abriu sem o conteúdo esperado`);
  }

  // --- O histórico registrou a navegação de verdade? ------------------------

  const historico = await pagina.locator("body").innerText();
  if (/entrou na plataforma/i.test(historico)) {
    console.log("✓ o histórico registrou a entrada que acabou de acontecer");
  } else {
    erros.push("o histórico não registrou a entrada");
  }

  await pagina.screenshot({ path: process.env.CAPTURA ?? "/tmp/html.png", fullPage: true });
}

await browser.close();

// --- Autocontido? -----------------------------------------------------------

if (externas.length > 0) {
  erros.push(
    `o arquivo buscou ${externas.length} recurso(s) externo(s): ${externas.slice(0, 3).join(", ")}`,
  );
} else {
  console.log("✓ nenhuma requisição para fora: o arquivo é autocontido");
}

const relevantes = problemasNoConsole.filter((m) => !/favicon|DevTools/i.test(m));
if (relevantes.length > 0) {
  erros.push(`${relevantes.length} erro(s) no console: ${relevantes[0].slice(0, 160)}`);
} else {
  console.log("✓ sem erros no console");
}

console.log("\n=================");
if (erros.length === 0) console.log("HTML VERIFICADO — 0 problemas");
else {
  console.log(`${erros.length} problema(s):`);
  erros.forEach((e) => console.log(" •", e));
  process.exitCode = 1;
}
