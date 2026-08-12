import assert from "node:assert/strict";
import { test } from "node:test";

import { Documento, corHex, paraBase64 } from "./documento.ts";
import { cortar, medir, quebrar } from "./fontes.ts";

/** O arquivo como texto latin-1, para inspecionar a estrutura. */
function comoTexto(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

test("o arquivo começa e termina como um PDF", () => {
  const doc = new Documento();
  doc.novaPagina().texto("Olá", 50, 50);
  const texto = comoTexto(doc.finalizar());

  assert.match(texto, /^%PDF-1\.4/);
  assert.match(texto, /%%EOF\n$/);
});

test("o índice aponta para o byte exato de cada objeto", () => {
  // É a parte que um leitor de PDF confere primeiro e a que quebra em silêncio
  // se alguém acrescentar bytes sem recontar. Vale conferir de verdade.
  const doc = new Documento();
  const pagina = doc.novaPagina();
  pagina.texto("Acentuação: ação, coração, ônibus", 40, 60);
  pagina.retangulo(10, 10, 100, 20, corHex("#ff8800"));

  const bytes = doc.finalizar();
  const texto = comoTexto(bytes);

  // Procurar "xref" cru acharia o de dentro de "startxref"; a tabela começa
  // numa linha própria.
  const posicaoDoIndice = texto.search(/(?<=\n)xref\n/);
  const inicioDeclarado = Number(texto.match(/startxref\n(\d+)/)![1]);
  assert.equal(inicioDeclarado, posicaoDoIndice, "startxref não aponta para o xref");

  const entradas = [...texto.slice(posicaoDoIndice).matchAll(/^(\d{10}) 00000 n $/gm)];
  assert.ok(entradas.length >= 6, `esperava vários objetos, achei ${entradas.length}`);

  entradas.forEach((entrada, indice) => {
    const deslocamento = Number(entrada[1]);
    const noArquivo = texto.slice(deslocamento, deslocamento + 20);
    assert.match(
      noArquivo,
      new RegExp(`^${indice + 1} 0 obj`),
      `o objeto ${indice + 1} não começa no byte ${deslocamento}`,
    );
  });
});

test("o número de páginas declarado bate com o de objetos de página", () => {
  const doc = new Documento();
  doc.novaPagina().texto("um", 20, 20);
  doc.novaPagina().texto("dois", 20, 20);
  doc.novaPagina().texto("três", 20, 20);

  const texto = comoTexto(doc.finalizar());
  assert.match(texto, /\/Count 3/);
  assert.equal(doc.totalDePaginas, 3);
  assert.equal((texto.match(/\/Type \/Page[^s]/g) ?? []).length, 3);
});

test("parênteses e barras no texto não quebram o arquivo", () => {
  // Um literal de PDF termina no primeiro ")" não escapado. Uma legenda com
  // parêntese destruiria todo o resto da página.
  const doc = new Documento();
  doc.novaPagina().texto("Resultados (parciais) \\ revisados", 40, 40);

  const texto = comoTexto(doc.finalizar());
  assert.match(texto, /Resultados \\\(parciais\\\) \\\\ revisados/);
});

test("os acentuados viram bytes latin-1, não interrogações", () => {
  const doc = new Documento();
  doc.novaPagina().texto("ação", 40, 40);
  const bytes = doc.finalizar();

  // "ç" é 0xE7 e "ã" é 0xE3 no WinAnsi.
  assert.ok(bytes.includes(0xe7), "faltou o ç");
  assert.ok(bytes.includes(0xe3), "faltou o ã");
});

test("travessão e reticências caem na faixa alta do WinAnsi", () => {
  const doc = new Documento();
  doc.novaPagina().texto("crescimento — sem parar…", 40, 40);
  const bytes = doc.finalizar();

  assert.ok(bytes.includes(151), "o travessão deveria virar o byte 151");
  assert.ok(bytes.includes(133), "as reticências deveriam virar o byte 133");
});

test("um caractere fora da tabela não corrompe o arquivo", () => {
  const doc = new Documento();
  doc.novaPagina().texto("emoji 😀 aqui", 40, 40);
  const bytes = doc.finalizar();

  assert.ok(
    bytes.every((byte) => byte <= 255),
    "todo byte precisa caber em um octeto",
  );
  assert.match(comoTexto(bytes), /emoji \?+ aqui/);
});

test("o comprimento declarado do fluxo é o real", () => {
  const doc = new Documento();
  const pagina = doc.novaPagina();
  pagina.texto("Conteúdo de teste com acentuação", 40, 40);
  pagina.retangulo(0, 0, 10, 10, corHex("#123456"));

  const texto = comoTexto(doc.finalizar());
  const encontrado = texto.match(/<< \/Length (\d+) >>\nstream\n/);
  assert.ok(encontrado);

  const declarado = Number(encontrado[1]);
  const inicio = encontrado.index! + encontrado[0].length;
  const fim = texto.indexOf("\nendstream", inicio);
  assert.equal(fim - inicio, declarado, "o /Length não corresponde ao fluxo");
});

test("a cor hexadecimal vira os três componentes do PDF", () => {
  assert.deepEqual(corHex("#000000"), { r: 0, g: 0, b: 0 });
  assert.deepEqual(corHex("#ffffff"), { r: 1, g: 1, b: 1 });
  const laranja = corHex("#ff8800");
  assert.equal(laranja.r, 1);
  assert.ok(Math.abs(laranja.g - 0.533) < 0.01);
  assert.equal(laranja.b, 0);
});

test("o parágrafo devolve a altura que ocupou", () => {
  const doc = new Documento();
  const pagina = doc.novaPagina();
  const altura = pagina.paragrafo(
    "Uma frase longa o suficiente para ocupar mais de uma linha dentro de uma largura estreita.",
    40,
    40,
    120,
    { tamanho: 10, entrelinha: 14 },
  );

  assert.ok(altura >= 28, `esperava mais de duas linhas, ocupou ${altura}`);
  assert.equal(altura % 14, 0, "a altura deveria ser múltipla da entrelinha");
});

test("medir é proporcional ao tamanho da fonte", () => {
  const dez = medir("Ampliação", 10);
  const vinte = medir("Ampliação", 20);
  assert.ok(Math.abs(vinte - dez * 2) < 0.001);
});

test("o negrito é mais largo que o normal", () => {
  assert.ok(medir("relatório mensal", 12, "negrito") > medir("relatório mensal", 12, "normal"));
});

test("a quebra respeita a largura pedida", () => {
  const largura = 150;
  const linhas = quebrar(
    "Crescimento consolidado das contas do projeto no período selecionado pelo cliente",
    largura,
    10,
  );

  assert.ok(linhas.length > 1);
  for (const linha of linhas) {
    assert.ok(medir(linha, 10) <= largura, `"${linha}" passou de ${largura}`);
  }
});

test("uma palavra maior que a linha é partida em vez de vazar", () => {
  const largura = 40;
  const linhas = quebrar("supercalifragilisticoexpialidoso", largura, 10);

  assert.ok(linhas.length > 1);
  for (const linha of linhas) {
    assert.ok(medir(linha, 10) <= largura, `"${linha}" vazou`);
  }
});

test("a quebra preserva as quebras de linha escritas", () => {
  assert.deepEqual(quebrar("um\ndois", 500, 10), ["um", "dois"]);
});

test("cortar devolve o texto intacto quando ele cabe", () => {
  assert.equal(cortar("curto", 500, 10), "curto");
});

test("cortar cabe na largura, com as reticências incluídas", () => {
  const largura = 60;
  const cortado = cortar("um nome de canal bem comprido", largura, 10);

  assert.match(cortado, /…$/);
  assert.ok(medir(cortado, 10) <= largura);
});

test("base64 sobrevive a um documento grande", () => {
  // O caminho ingênuo com spread estoura a pilha por volta de 100 mil bytes.
  const doc = new Documento();
  for (let pagina = 0; pagina < 12; pagina += 1) {
    const p = doc.novaPagina();
    for (let linha = 0; linha < 60; linha += 1) {
      p.texto(`Linha ${linha} com acentuação e um pouco de texto`, 40, 40 + linha * 12);
    }
  }

  const bytes = doc.finalizar();
  assert.ok(bytes.length > 60_000, `esperava um arquivo grande, deu ${bytes.length}`);

  const base64 = paraBase64(bytes);
  assert.match(base64, /^[A-Za-z0-9+/]+={0,2}$/);
  assert.deepEqual(Uint8Array.from(Buffer.from(base64, "base64")), bytes);
});
