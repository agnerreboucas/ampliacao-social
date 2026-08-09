import { chromium } from "playwright-core";

/**
 * Prova que a autorização é feita no servidor.
 *
 * O teste captura uma chamada real que o navegador fez e a repete trocando o
 * projeto — que é exatamente o ataque que a versão anterior permitia. O cliente
 * HTTP do Playwright compartilha os cookies da sessão, então a requisição
 * forjada chega autenticada como a pessoa, e só a checagem do servidor pode
 * barrá-la.
 *
 * O controle no início não é enfeite: sem ele, uma resposta vazia por qualquer
 * motivo passaria por "recusa" e o teste diria que está tudo bem.
 *
 * Como rodar: suba a aplicação com um banco de teste, crie ali uma pessoa com
 * acesso a **um** projeto só, e aponte as variáveis abaixo para ela.
 *
 *   BASE=http://127.0.0.1:5199 \
 *   EMAIL=... SENHA=... PROJETO=proj-mercadinho ALHEIOS=proj-studio,proj-campanha \
 *   node scripts/verificar-autorizacao.mjs
 *
 * A senha vem do ambiente de propósito: um roteiro de teste não é lugar para
 * credencial escrita no repositório, nem mesmo de mentira.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const EMAIL = process.env.EMAIL;
const SENHA = process.env.SENHA;
const PROJETO = process.env.PROJETO ?? "proj-mercadinho";
const ALHEIOS = (process.env.ALHEIOS ?? "proj-studio,proj-campanha").split(",").filter(Boolean);

if (!EMAIL || !SENHA) {
  console.error("Defina EMAIL e SENHA de uma conta de teste antes de rodar.");
  process.exit(2);
}

const erros = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const repetir = async (ctx, chamada, corpo) => {
  const headers = { ...chamada.headers };
  delete headers["content-length"];
  delete headers["host"];
  const r = await ctx.request.post(chamada.url, { headers, data: corpo ?? chamada.body });
  const texto = await r.text();
  return { status: r.status(), texto };
};

/**
 * O envelope de resposta carrega sempre as chaves `["result","error","context"]`
 * — inclusive quando o servidor recusa. Procurar a palavra `result` no texto,
 * portanto, encontra também a recusa, e uma recusa longa o bastante passaria por
 * vazamento. O que separa os dois casos é a mensagem de erro.
 */
const RECUSA = /sessão expirou|não tem acesso|restrita a administradores|não encontrad/i;

const motivoDaRecusa = (texto) =>
  texto.match(RECUSA)
    ? texto
        .match(
          /[^"]*(?:sessão expirou|não tem acesso|restrita a administradores|não encontrad)[^"]*/i,
        )[0]
        .trim()
    : "sem resultado";

const temResultado = (texto) => !RECUSA.test(texto) && /"result"/.test(texto) && texto.length > 200;

const contexto = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const pagina = await contexto.newPage();
const chamadas = [];
pagina.on("request", (r) => {
  if (r.url().includes("/_serverFn/") && r.method() === "POST") {
    chamadas.push({ url: r.url(), body: r.postData() ?? "", headers: r.headers() });
  }
});

await pagina.goto(`${BASE}/social/entrar`, { waitUntil: "networkidle" });
await pagina.getByLabel(/e-mail/i).fill(EMAIL);
await pagina.getByLabel(/senha/i).fill(SENHA);
await pagina.getByRole("button", { name: /entrar/i }).click();
await pagina.waitForURL(/\/social$/, { timeout: 20000 }).catch(() => {});
await pagina.waitForTimeout(3000);

if (/\/entrar/.test(pagina.url())) erros.push("a conta de teste não entrou com a senha certa");
else console.log("✓ entrou");

const projetos = await pagina.locator("select option").allInnerTexts();
console.log("  projetos visíveis:", JSON.stringify(projetos));
if (projetos.length > 1) {
  erros.push(`a conta de teste vê mais de um projeto: ${projetos.join(", ")}`);
} else console.log(`✓ vê só um projeto: ${projetos[0] ?? "nenhum"}`);

const alvo = chamadas.filter((c) => c.body.includes(PROJETO)).pop();
if (!alvo) {
  erros.push("nenhuma chamada com projeto capturada");
} else {
  const controle = await repetir(contexto, alvo);
  console.log(`  controle: status ${controle.status}, ${controle.texto.length} bytes`);
  if (!temResultado(controle.texto)) {
    erros.push("o controle não devolveu dado — o teste do ataque não valeria");
  } else {
    console.log("✓ controle devolve dado: a repetição funciona, o ataque é real");
  }

  for (const alheio of ALHEIOS) {
    const r = await repetir(contexto, alvo, alvo.body.split(PROJETO).join(alheio));
    if (temResultado(r.texto)) {
      erros.push(`VAZOU ${alheio}: ${r.texto.replace(/\s+/g, " ").slice(0, 200)}`);
    } else {
      console.log(`✓ ${alheio} recusado (${r.status}): ${motivoDaRecusa(r.texto)}`);
    }
  }

  const anonimo = await browser.newContext();
  const r = await repetir(anonimo, alvo);
  if (temResultado(r.texto)) erros.push(`sem sessão conseguiu ler: ${r.texto.slice(0, 160)}`);
  else console.log(`✓ sem sessão, recusado (${r.status}): ${motivoDaRecusa(r.texto)}`);
  await anonimo.close();

  await pagina.getByRole("button", { name: /Sair/i }).click();
  await pagina.waitForTimeout(3000);
  const depois = await repetir(contexto, alvo);
  if (temResultado(depois.texto)) {
    erros.push(`depois de sair a sessão continuou valendo: ${depois.texto.slice(0, 160)}`);
  } else
    console.log(`✓ depois de sair, recusado (${depois.status}): ${motivoDaRecusa(depois.texto)}`);
}

await browser.close();
console.log("\n=================");
if (erros.length === 0) console.log("AUTORIZAÇÃO VERIFICADA — 0 problemas");
else {
  console.log(`${erros.length} problema(s):`);
  erros.forEach((e) => console.log(" •", e));
  process.exitCode = 1;
}
