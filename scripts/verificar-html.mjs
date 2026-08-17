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
  await campoEmail.fill(process.env.EMAIL ?? "campanha.neoncunha@gmail.com");
  await pagina.getByLabel(/senha/i).fill("qualquer-coisa");
  await pagina.getByRole("button", { name: /entrar/i }).click();
  await pagina.waitForTimeout(3000);

  const painel = await pagina.locator("body").innerText();
  // Painel e Visão geral eram duas entradas para a mesma tela; sobrou uma, e
  // ela precisa trazer o que a outra tinha de próprio.
  if (/CANAL A CANAL/i.test(painel) && /O QUE OS NÚMEROS SUGEREM/i.test(painel)) {
    console.log("✓ o painel absorveu a leitura canal a canal e as observações");
  } else {
    erros.push("o painel não traz canal a canal e as observações");
  }

  if (/Painel/i.test(painel) && /SEGUIDORES/i.test(painel)) {
    console.log("✓ entrou e o painel carregou");
  } else {
    erros.push("não chegou ao painel depois de entrar");
  }

  // --- O que o painel precisa mostrar ---------------------------------------

  if (/SUAS REDES/i.test(painel)) console.log("✓ o painel traz os cartões por rede");
  else erros.push("os cartões por rede não apareceram no painel");

  for (const rede of ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Threads"]) {
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
    ["Agenda", /Compromissos cadastrados|Quadro de produção/i],
    ["Contas", /conta|perfil/i],
    ["Importar histórico", /Traga a planilha|Escolha a conta/i],
    ["Conteúdo", /Peça a peça|Por formato/i],
    ["Público", /Cidades|De onde vêm estes números/i],
    // As duas telas que o estado de São Paulo pediu: o mapa precisa desenhar os
    // 645 municípios e a pirâmide precisa separar homens de mulheres.
    ["Mapa de SP", /645 munic|Onde a campanha/i],
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

  // --- O que só existe nas telas novas --------------------------------------

  await pagina
    .getByRole("link", { name: /^Público/i })
    .first()
    .click();
  await pagina.waitForTimeout(2500);
  const publico = await pagina.locator("body").innerText();
  // Com dados reais de conteúdo, o perfil demográfico não existe: ele vem da
  // conexão por OAuth, não da exportação. A tela precisa **dizer isso** — o
  // erro seria desenhar uma pirâmide vazia, que lê como "o público sumiu".
  if (/HOMENS/i.test(publico) && /MULHERES/i.test(publico)) {
    console.log("✓ a pirâmide de gênero e idade desenhou");
  } else if (/exportação de conteúdo|não vem|indisponível|conectada/i.test(publico)) {
    console.log("✓ Público explica por que ainda não há perfil demográfico");
  } else {
    erros.push("Público não desenhou a pirâmide nem explicou a ausência");
  }

  await pagina
    .getByRole("link", { name: /^Mapa de SP/i })
    .first()
    .click();
  await pagina.waitForTimeout(2500);
  // Territórios, não pontos: o mapa desenha um caminho por município, e o
  // recorte metropolitano repete os mesmos 645 num segundo SVG.
  // O contorno do estado entra como recorte e como traço: sem ele o mapa volta
  // a ter borda reta, que foi o defeito que este teste existe para pegar.
  if ((await pagina.locator("clipPath#contorno-do-estado path").count()) > 0) {
    console.log("✓ o mapa recorta pelo contorno do estado");
  } else {
    erros.push("o contorno do estado não está sendo usado como recorte");
  }

  const territorios = await pagina.locator("svg path").count();
  if (territorios >= 1290) {
    console.log(`✓ o mapa desenhou ${territorios} territórios (estado + recorte)`);
  } else {
    erros.push(`o mapa desenhou ${territorios} territórios; esperava 1290 ou mais`);
  }

  await pagina.locator('path:has(title:text-is("Sorocaba"))').first().click({ force: true });
  await pagina.waitForTimeout(2500);
  const dossie = await pagina.locator("body").innerText();
  if (/Vizinhos/i.test(dossie) && /Custo por mil/i.test(dossie)) {
    console.log("✓ clicar no território abre o dossiê do município");
  } else {
    erros.push("clicar no território não abriu o dossiê do município");
  }

  await pagina
    .getByRole("link", { name: /^Relacionamento/i })
    .first()
    .click();
  await pagina.waitForTimeout(2500);
  const conversa = await pagina.locator("body").innerText();
  if (/de alcance/i.test(conversa) && /(Imagem|Vídeo|Carrossel|Story)/.test(conversa)) {
    console.log("✓ a conversa mostra a publicação que a originou");
  } else if (/Nenhuma conversa|nada por aqui|vazio/i.test(conversa)) {
    console.log("✓ Relacionamento mostra o estado vazio, sem inventar conversa");
  } else {
    erros.push("a conversa não mostra a peça de origem nem o estado vazio");
  }

  await pagina
    .getByRole("link", { name: /^Histórico/i })
    .first()
    .click();
  await pagina.waitForTimeout(2500);

  const historico = await pagina.locator("body").innerText();
  if (/entrou na plataforma/i.test(historico)) {
    console.log("✓ o histórico registrou a entrada que acabou de acontecer");
  } else {
    erros.push("o histórico não registrou a entrada");
  }

  // --- Minha área -----------------------------------------------------------
  //
  // A tela do perfil precisa trazer as três coisas que a justificam: quem a
  // pessoa é, o que o papel dela permite, e o que ela não pode fazer.
  await pagina
    .getByRole("link", { name: /Administrador|Gestor|Editor|Atendimento/i })
    .first()
    .click();
  await pagina.waitForTimeout(2500);

  const perfil = await pagina.locator("body").innerText();
  for (const [rotulo, marca] of [
    ["a área do usuário abriu", /Minha área/i],
    ["o e-mail de quem entrou", /@/],
    ["a frente de atuação", /Frente de atuação/i],
    ["o que o papel permite", /Você pode/i],
    ["e o que ele não permite", /Você não pode|Papel só muda/i],
  ]) {
    if (marca.test(perfil)) console.log(`✓ ${rotulo}`);
    else erros.push(`perfil: faltou ${rotulo}`);
  }

  // --- Compromisso vira pauta ------------------------------------------------
  //
  // O caminho inteiro do pedido: cadastrar o compromisso, ver a pauta nascer no
  // quadro marcada como vinda da agenda, e escolher o formato ali mesmo.
  await pagina
    .getByRole("link", { name: /^Agenda/i })
    .first()
    .click();
  await pagina.waitForTimeout(2000);

  await pagina
    .getByRole("button", { name: /Compromisso/ })
    .first()
    .click();
  await pagina.waitForTimeout(1000);
  await pagina.getByLabel(/Título/i).fill("Caminhada na Vila Nova");
  const campoLocal = pagina.getByLabel(/Local/i);
  if (await campoLocal.count()) await campoLocal.first().fill("Campinas");
  await pagina
    .getByRole("button", { name: /^Salvar|Criar/ })
    .last()
    .click();
  await pagina.waitForTimeout(2500);

  await pagina.getByRole("button", { name: "Produção", exact: true }).click();
  await pagina.waitForTimeout(2000);

  // A coluna de ideias começa recolhida quando está vazia; a pauta cai lá.
  const abrirIdeia = pagina.locator('button[title="Abrir Ideia"]').first();
  if (await abrirIdeia.count()) {
    await abrirIdeia.click();
    await pagina.waitForTimeout(1200);
  }

  const quadro = await pagina.locator("body").innerText();
  if (/Da agenda/.test(quadro)) console.log("✓ o compromisso virou pauta marcada como da agenda");
  else erros.push("o compromisso não virou pauta no quadro");

  if (/Post simples/.test(quadro)) console.log("✓ a pauta oferece a escolha do formato");
  else erros.push("a pauta não oferece a escolha do formato");

  const semFormato = () => pagina.locator("text=Esta pauta ainda não tem formato").count();
  const antes = await semFormato();
  const carrossel = pagina.getByRole("button", { name: "Carrossel", exact: true }).first();
  if (await carrossel.count()) {
    await carrossel.click();
    await pagina.waitForTimeout(2500);
    if ((await semFormato()) < antes) console.log("✓ escolher o formato decide a pauta");
    else erros.push("escolher o formato não mudou a pauta");
  } else {
    erros.push("não achei o botão de carrossel na pauta");
  }

  // --- Tela do compromisso ---------------------------------------------------
  await pagina
    .getByRole("link", { name: /^Agenda/i })
    .first()
    .click();
  await pagina.waitForTimeout(2000);

  // A visão de produção não desenha calendário nenhum; o compromisso só é
  // clicável na visão que mostra os dias.
  await pagina.getByRole("button", { name: "Tudo", exact: true }).click();
  await pagina.waitForTimeout(1500);
  await pagina.getByRole("button", { name: /Hoje/i }).first().click();
  await pagina.waitForTimeout(1500);
  // A célula do dia deixou de ser um <button> com o texto dentro — agora é uma
  // área clicável com rótulo próprio, para caber o "+" de criar ali mesmo.
  const celulaDeHoje = pagina.getByRole("button", { name: /^Abrir \d{4}-\d{2}-\d{2}$/ }).first();
  if ((await celulaDeHoje.count()) === 0) {
    erros.push("as células do calendário deixaram de ser clicáveis");
  }

  // O semáforo do pedido: vermelho pede aprovação, amarelo está aprovada e não
  // publicada, verde já saiu. A legenda é a prova de que as três existem.
  const naAgenda = await pagina.locator("body").innerText();
  for (const [rotulo, marca] of [
    ["a marcação de quem precisa aprovar", /Precisa aprovar/i],
    ["a de aprovada e ainda não publicada", /Aprovada, ainda não publicada/i],
    ["a de publicada", /Publicada/i],
  ]) {
    if (marca.test(naAgenda)) console.log(`✓ ${rotulo}`);
    else erros.push(`agenda: faltou ${rotulo}`);
  }

  // A quarta visão: só o que espera um sim, no dia em que vai ao ar.
  const aprovacoes = pagina.getByRole("button", { name: "Aprovações", exact: true });
  if (await aprovacoes.count()) {
    await aprovacoes.click();
    await pagina.waitForTimeout(1500);
    const fila = await pagina.locator("body").innerText();
    if (/espera[m]? aprovação|Nada esperando aprovação/i.test(fila)) {
      console.log("✓ a visão de aprovações diz o tamanho da fila");
    } else {
      erros.push("agenda: a visão de aprovações não resumiu a fila");
    }
    await pagina.getByRole("button", { name: "Tudo", exact: true }).click();
    await pagina.waitForTimeout(1500);
  } else {
    erros.push("agenda: não achei a visão de aprovações");
  }

  // Criar no dia clicado: o "+" pergunta o que é, e o formulário de publicação
  // já nasce agendado para aquele dia — que é o ponto do pedido.
  const diaParaCriar = pagina.getByRole("button", { name: /^Abrir \d{4}-\d{2}-\d{2}$/ }).nth(20);
  await diaParaCriar.hover();
  await pagina.waitForTimeout(400);
  const maisDoDia = pagina.getByRole("button", { name: /^Criar neste dia/ }).first();
  if (await maisDoDia.count()) {
    const rotulo = (await maisDoDia.getAttribute("aria-label")) ?? "";
    const dia = rotulo.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
    await maisDoDia.click();
    await pagina.waitForTimeout(900);
    if (/O que você quer criar neste dia/i.test(await pagina.locator("body").innerText())) {
      console.log("✓ o \"+\" do dia pergunta se é compromisso ou publicação");
    } else {
      erros.push("agenda: o \"+\" do dia não perguntou o que criar");
    }

    await pagina.getByRole("button", { name: /^Publicação/ }).click();
    await pagina.waitForTimeout(1200);
    const agendado = await pagina.locator("#scheduledFor").inputValue().catch(() => "");
    if (agendado.startsWith(dia)) {
      console.log("✓ a nova publicação já nasce agendada para o dia clicado");
    } else {
      erros.push(`agenda: a publicação nasceu com "${agendado}" em vez de ${dia}`);
    }
    await pagina.keyboard.press("Escape");
    await pagina.waitForTimeout(800);
  } else {
    erros.push("agenda: o dia do calendário não oferece criar ali mesmo");
  }

  // Clicar no "+" também abriu aquele dia; o teste seguinte é sobre o dia de
  // hoje, então o painel volta para ele.
  const hoje = new Date();
  const chaveDeHoje = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const celulaDeVolta = pagina.getByRole("button", { name: `Abrir ${chaveDeHoje}` }).first();
  if (await celulaDeVolta.count()) {
    await celulaDeVolta.click();
    await pagina.waitForTimeout(1500);
  }

  const linkDoEvento = pagina
    .getByRole("link", { name: "Caminhada na Vila Nova", exact: true })
    .first();
  if (await linkDoEvento.count()) {
    await linkDoEvento.click();
    await pagina.waitForTimeout(2500);
    const evento = await pagina.locator("body").innerText();
    if (/Onde e quando/i.test(evento) && /Conteúdo que sai daqui/i.test(evento)) {
      console.log("✓ clicar no compromisso abre a tela dele, com o conteúdo que saiu dali");
    } else {
      erros.push("a tela do compromisso não abriu completa");
    }
  } else {
    erros.push("o compromisso não ficou clicável na agenda");
  }

  // --- O quadro no painel ---------------------------------------------------
  //
  // Fechado ele resume quatro perguntas; aberto, compara o alcance da campanha
  // com a atividade do público faixa por faixa. As duas coisas são conferidas.
  await pagina
    .getByRole("link", { name: /^Painel/i })
    .first()
    .click();
  await pagina.waitForTimeout(3000);

  const noPainel = await pagina.locator("body").innerText();
  for (const [rotulo, marca] of [
    ["o quadro de horários, mídia e público", /Horários, mídia e público/i],
    ["o melhor horário", /Melhor horário/i],
    ["o formato que rende", /Formato que rende/i],
    ["quando o público está na rede", /Público na rede/i],
  ]) {
    if (marca.test(noPainel)) console.log(`✓ ${rotulo}`);
    else erros.push(`painel: faltou ${rotulo}`);
  }

  // As vinte e quatro barras finas e o corte por rede são o pedido de agosto:
  // um gráfico que mostre a hora cheia e deixe escolher a rede. Se o eixo de
  // hora sumir ou desenhar de menos, o bloco volta a ser figura de faixa larga
  // sem ninguém perceber.
  const porHora = pagina.getByRole("button", { name: /^Hora a hora$/ }).first();
  if (await porHora.count()) {
    await porHora.click();
    await pagina.waitForTimeout(1200);
    const rotulos = await pagina.locator(".recharts-cartesian-axis-tick-value").allTextContents();
    if (rotulos.includes("0h") && rotulos.includes("22h")) {
      console.log("✓ o eixo hora a hora vai de 0h a 22h");
    } else {
      erros.push("painel: o eixo de hora cheia não desenhou as vinte e quatro horas");
    }

    // Clicar numa hora precisa abrir o que sustenta aquela barra — sem isso a
    // barra é um número sem nome, e ninguém consegue repetir o que deu certo.
    const barras = pagina.locator(".recharts-bar-rectangle");
    let abriu = false;
    for (let indice = 0; indice < (await barras.count()) && !abriu; indice += 1) {
      await barras.nth(indice).click({ force: true }).catch(() => {});
      await pagina.waitForTimeout(500);
      abriu = (await pagina.getByText(/nesta faixa/i).count()) > 0;
    }
    if (abriu) console.log("✓ clicar numa hora abre o detalhe da faixa");
    else erros.push("painel: clicar na barra não abriu o detalhe da faixa");
  } else {
    erros.push("painel: não achei o eixo de hora a hora");
  }

  const aprofundar = pagina.getByRole("button", { name: /Aprofundar/i }).first();
  if (await aprofundar.count()) {
    await aprofundar.click();
    await pagina.waitForTimeout(1200);
    const aberto = await pagina.locator("body").innerText();
    if (/Onde a campanha acerta/i.test(aberto) && /Melhor horário por tipo/i.test(aberto)) {
      console.log("✓ o quadro aprofunda: campanha × público e horário por formato");
    } else {
      erros.push("painel: o quadro não abriu o detalhe");
    }
  } else {
    erros.push("painel: não achei o botão de aprofundar o quadro");
  }

  // --- Quando publicar ------------------------------------------------------
  //
  // O mapa de horários é a parte da análise que vira decisão de rotina; se ele
  // não desenhar, a tela de conteúdo perde o que ela tem de mais acionável.
  await pagina
    .getByRole("link", { name: /^Conteúdo/i })
    .first()
    .click();
  await pagina.waitForTimeout(3000);

  const conteudo = await pagina.locator("body").innerText();
  for (const [rotulo, marca] of [
    ["a seção de quando publicar", /Quando publicar/i],
    ["o ranking dos melhores horários", /Melhores horários/i],
    ["o cruzamento com o dia da semana", /Cruzando com o dia da semana/i],
    ["o recorte por tipo de conteúdo", /Por tipo de conteúdo/i],
    ["a comparação com a média", /vs\. média/],
    ["a legenda do mapa de calor", /a cor é o alcance médio/i],
  ]) {
    if (marca.test(conteudo)) console.log(`✓ ${rotulo}`);
    else erros.push(`conteúdo: faltou ${rotulo}`);
  }

  // --- Números onde a pessoa olha ------------------------------------------
  //
  // O que já foi ao ar precisa mostrar como foi no mesmo lugar em que aparece.
  await pagina
    .getByRole("link", { name: /^Publicações/i })
    .first()
    .click();
  await pagina.waitForTimeout(2500);
  // A lista abre na fila de produção, onde nada tem número ainda.
  await pagina
    .getByRole("button", { name: /^Publicado/i })
    .first()
    .click();
  await pagina.waitForTimeout(2000);

  const lista = await pagina.locator("body").innerText();
  if (/alcance/i.test(lista) && /curtidas/i.test(lista) && /coment/i.test(lista)) {
    console.log("✓ a lista de publicações traz alcance, curtidas e comentários");
  } else {
    erros.push("a lista de publicações não traz os números da peça");
  }

  if (/A_definir/.test(lista)) {
    erros.push("o formato aparece cru na tela (A_definir)");
  } else {
    console.log("✓ nenhum nome técnico de formato vazou para a tela");
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
