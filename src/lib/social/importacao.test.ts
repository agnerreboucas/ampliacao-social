import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aplicarPlano,
  detectarOrdemDaData,
  detectarSeparador,
  interpretarData,
  interpretarNumero,
  lerTabela,
  montarPlano,
  reconhecerColuna,
  resumirPlano,
} from "./importacao.ts";
import type { DailyMetric } from "./types.ts";

// --- Números ----------------------------------------------------------------

test("número simples", () => {
  assert.equal(interpretarNumero("1234"), 1234);
  assert.equal(interpretarNumero(" 42 "), 42);
});

test("ponto com três dígitos é separador de milhar", () => {
  // A armadilha principal do módulo: em planilha brasileira, 1.234 é mil.
  assert.equal(interpretarNumero("1.234"), 1234);
  assert.equal(interpretarNumero("12.345"), 12345);
  assert.equal(interpretarNumero("1.234.567"), 1234567);
});

test("ponto com outra quantidade de dígitos é decimal", () => {
  assert.equal(interpretarNumero("35.50"), 35.5);
  assert.equal(interpretarNumero("0.5"), 0.5);
  assert.equal(interpretarNumero("12.7"), 12.7);
});

test("vírgula sozinha é decimal em português", () => {
  assert.equal(interpretarNumero("35,50"), 35.5);
  assert.equal(interpretarNumero("0,75"), 0.75);
});

test("vírgula em grupos de três é separador de milhar", () => {
  assert.equal(interpretarNumero("1,234"), 1234);
  assert.equal(interpretarNumero("12,345"), 12345);
});

test("com os dois separadores, vence o último", () => {
  assert.equal(interpretarNumero("1.234,56"), 1234.56);
  assert.equal(interpretarNumero("1,234.56"), 1234.56);
  assert.equal(interpretarNumero("1.234.567,89"), 1234567.89);
});

test("símbolo de moeda e porcentagem não atrapalham", () => {
  assert.equal(interpretarNumero("R$ 1.234,56"), 1234.56);
  assert.equal(interpretarNumero("4,7%"), 4.7);
});

test("o que não é número devolve nulo, não zero", () => {
  // A diferença importa: nulo vira problema com o número da linha; zero viraria
  // dado errado em silêncio.
  assert.equal(interpretarNumero("n/d"), null);
  assert.equal(interpretarNumero("—"), null);
  assert.equal(interpretarNumero(""), null);
  assert.equal(interpretarNumero("abc"), null);
});

// --- Datas ------------------------------------------------------------------

test("um dia acima de 12 prova a ordem dia/mês", () => {
  assert.equal(detectarOrdemDaData(["01/02/2026", "25/02/2026"]), "dia-mes");
});

test("um mês na primeira posição acima de 12 prova a ordem mês/dia", () => {
  assert.equal(detectarOrdemDaData(["02/25/2026", "02/01/2026"]), "mes-dia");
});

test("datas que se contradizem não são adivinhadas", () => {
  // 25/02 só faz sentido como dia/mês; 02/25 só como mês/dia. Aceitar as duas
  // deslocaria metade do histórico.
  assert.equal(detectarOrdemDaData(["25/02/2026", "02/25/2026"]), "indefinida");
});

test("ISO é reconhecido sem ambiguidade", () => {
  assert.equal(detectarOrdemDaData(["2026-08-12", "2026-08-13"]), "iso");
});

test("sem prova nenhuma, assume o padrão brasileiro", () => {
  assert.equal(detectarOrdemDaData(["01/02/2026", "03/04/2026"]), "dia-mes");
});

test("conversão para AAAA-MM-DD nos três formatos", () => {
  assert.equal(interpretarData("12/08/2026", "dia-mes"), "2026-08-12");
  assert.equal(interpretarData("08/12/2026", "mes-dia"), "2026-08-12");
  assert.equal(interpretarData("2026-08-12", "iso"), "2026-08-12");
  assert.equal(interpretarData("12-08-2026", "dia-mes"), "2026-08-12");
  assert.equal(interpretarData("12.08.2026", "dia-mes"), "2026-08-12");
});

test("ano de dois dígitos vira o século atual", () => {
  assert.equal(interpretarData("12/08/26", "dia-mes"), "2026-08-12");
});

test("data que não existe é recusada em vez de corrigida", () => {
  // O Date do JavaScript transformaria 31 de fevereiro em 3 de março sem avisar.
  assert.equal(interpretarData("31/02/2026", "dia-mes"), null);
  assert.equal(interpretarData("32/01/2026", "dia-mes"), null);
  assert.equal(interpretarData("qualquer coisa", "dia-mes"), null);
});

test("ISO com hora junto continua sendo lido", () => {
  assert.equal(interpretarData("2026-08-12T14:30:00Z", "iso"), "2026-08-12");
});

// --- Leitura do arquivo -----------------------------------------------------

test("o separador mais frequente vence", () => {
  assert.equal(detectarSeparador("a;b;c\n1;2;3"), ";");
  assert.equal(detectarSeparador("a,b,c\n1,2,3"), ",");
  assert.equal(detectarSeparador("a\tb\tc"), "\t");
});

test("o separador dentro de aspas não parte a célula", () => {
  const tabela = lerTabela('nome;valor\n"Silva; Ana";10');
  assert.deepEqual(tabela[1], ["Silva; Ana", "10"]);
});

test("aspas duplicadas viram uma aspa", () => {
  const tabela = lerTabela('a\n"diz ""oi"""');
  assert.equal(tabela[1][0], 'diz "oi"');
});

test("linhas em branco no meio do arquivo são ignoradas", () => {
  const tabela = lerTabela("a;b\n1;2\n\n3;4\n");
  assert.equal(tabela.length, 3);
});

// --- Cabeçalhos -------------------------------------------------------------

test("o cabeçalho é reconhecido sem depender de acento ou caixa", () => {
  assert.equal(reconhecerColuna("Alcance Orgânico"), "organicReach");
  assert.equal(reconhecerColuna("alcance organico"), "organicReach");
  assert.equal(reconhecerColuna("ALCANCE ORGANICO"), "organicReach");
  assert.equal(reconhecerColuna("Organic Reach"), "organicReach");
});

test("coluna desconhecida devolve nulo em vez de chutar", () => {
  assert.equal(reconhecerColuna("Observações do analista"), null);
});

// --- Plano completo ---------------------------------------------------------

const PLANILHA = [
  "Data;Seguidores;Alcance orgânico;Alcance pago;Investimento",
  "01/07/2026;10.000;4.500;1.200;R$ 35,50",
  "02/07/2026;10.120;4.800;1.100;R$ 40,00",
  "03/07/2026;10.050;5.200;0;0",
].join("\n");

test("uma planilha comum vira plano sem problemas", () => {
  const plano = montarPlano(PLANILHA);

  assert.equal(plano.utilizavel, true);
  assert.deepEqual(plano.problemas, []);
  assert.equal(plano.linhas.length, 3);
  assert.equal(plano.ordemDaData, "dia-mes");
  assert.equal(plano.primeiroDia, "2026-07-01");
  assert.equal(plano.ultimoDia, "2026-07-03");

  assert.equal(plano.linhas[0].valores.followers, 10_000);
  assert.equal(plano.linhas[0].valores.organicReach, 4500);
  assert.equal(plano.linhas[0].valores.adSpend, 35.5);
});

test("colunas desconhecidas são ignoradas, não recusadas", () => {
  const plano = montarPlano("Data;Seguidores;Observação\n01/07/2026;100;tudo certo");

  assert.equal(plano.utilizavel, true);
  assert.deepEqual(
    plano.colunas.map((coluna) => coluna.campo),
    ["date", "followers", null],
  );
});

test("sem coluna de data o plano avisa e não segue", () => {
  const plano = montarPlano("Seguidores;Alcance orgânico\n100;200");

  assert.equal(plano.utilizavel, false);
  assert.match(plano.problemas[0].mensagem, /Nenhuma coluna de data/);
  // A mensagem precisa dizer o que foi lido, senão a pessoa não sabe o que
  // renomear.
  assert.match(plano.problemas[0].mensagem, /Seguidores/);
});

test("sem nenhuma coluna de número o plano avisa", () => {
  const plano = montarPlano("Data;Observação\n01/07/2026;nada");

  assert.equal(plano.utilizavel, false);
  assert.ok(plano.problemas.some((problema) => /Nenhuma coluna de número/.test(problema.mensagem)));
});

test("a linha problemática é apontada pelo número, e as boas passam", () => {
  const plano = montarPlano(
    ["Data;Seguidores", "01/07/2026;100", "data ruim;200", "03/07/2026;300"].join("\n"),
  );

  assert.equal(plano.linhas.length, 2);
  assert.equal(plano.problemas.length, 1);
  assert.equal(plano.problemas[0].linha, 3);
  assert.match(plano.problemas[0].mensagem, /data ruim/);
});

test("valor não numérico vira problema com a coluna nomeada", () => {
  const plano = montarPlano("Data;Seguidores\n01/07/2026;dez mil");

  assert.equal(plano.problemas.length, 1);
  assert.match(plano.problemas[0].mensagem, /dez mil/);
  assert.match(plano.problemas[0].mensagem, /Seguidores/);
});

test("valor negativo é recusado", () => {
  const plano = montarPlano("Data;Seguidores\n01/07/2026;-50");
  assert.match(plano.problemas[0].mensagem, /negativo/i);
});

test("linha de total sem data é ignorada em silêncio", () => {
  // A planilha está certa; acusar erro aqui ensinaria a pessoa a ignorar avisos.
  const plano = montarPlano(
    ["Data;Seguidores", "01/07/2026;100", "02/07/2026;200", ";300"].join("\n"),
  );

  assert.equal(plano.linhas.length, 2);
  assert.deepEqual(plano.problemas, []);
});

test("célula vazia vira zero sem reclamar", () => {
  const plano = montarPlano("Data;Seguidores;Alcance pago\n01/07/2026;100;");

  assert.deepEqual(plano.problemas, []);
  assert.equal(plano.linhas[0].valores.paidReach, 0);
});

test("o mesmo dia repetido no arquivo: o último vence", () => {
  const plano = montarPlano(["Data;Seguidores", "01/07/2026;100", "01/07/2026;175"].join("\n"));

  assert.equal(plano.linhas.length, 1);
  assert.equal(plano.linhas[0].valores.followers, 175);
});

test("dias que já existem são listados como conflito antes de gravar", () => {
  const plano = montarPlano(PLANILHA, ["2026-07-02", "2026-07-03"]);

  assert.deepEqual(plano.conflitos, ["2026-07-02", "2026-07-03"]);
  assert.match(resumirPlano(plano), /1 novo/);
  assert.match(resumirPlano(plano), /2 que já existe/);
});

test("arquivo vazio não explode", () => {
  const plano = montarPlano("");
  assert.equal(plano.utilizavel, false);
  assert.equal(plano.linhas.length, 0);
});

test("planilha exportada em inglês também é lida", () => {
  const plano = montarPlano(
    ["Date,Followers,Organic Reach,Amount spent", "2026-07-01,10000,4500,35.50"].join("\n"),
  );

  assert.equal(plano.utilizavel, true);
  assert.equal(plano.linhas[0].date, "2026-07-01");
  assert.equal(plano.linhas[0].valores.followers, 10_000);
  assert.equal(plano.linhas[0].valores.adSpend, 35.5);
});

// --- Aplicação ao histórico -------------------------------------------------

function dia(date: string, followers: number): DailyMetric {
  return {
    date,
    followers,
    followersGained: 0,
    followersLost: 0,
    organicReach: 0,
    paidReach: 0,
    organicImpressions: 0,
    paidImpressions: 0,
    organicEngagement: 0,
    paidEngagement: 0,
    adSpend: 0,
  };
}

test("o histórico importado sai em ordem e com ganho calculado", () => {
  const plano = montarPlano(PLANILHA);
  const serie = aplicarPlano([], plano);

  assert.deepEqual(
    serie.map((linha) => linha.date),
    ["2026-07-01", "2026-07-02", "2026-07-03"],
  );
  assert.equal(serie[0].followersGained, 0, "o primeiro dia não tem anterior para comparar");
  assert.equal(serie[1].followersGained, 120);
  assert.equal(serie[2].followersLost, 70, "10.050 depois de 10.120 é perda de 70");
  assert.equal(serie[2].followersGained, 0);
});

test("importar no meio de um histórico recalcula os vizinhos", () => {
  // O ponto do recálculo em bloco: o dia seguinte ao importado também muda de
  // ganho, e aplicar linha a linha deixaria o número velho ali.
  const existente = [dia("2026-07-01", 1000), dia("2026-07-03", 1300)];
  existente[1].followersGained = 300;

  const plano = montarPlano("Data;Seguidores\n02/07/2026;1100");
  const serie = aplicarPlano(existente, plano);

  assert.equal(serie.length, 3);
  assert.equal(serie[1].followersGained, 100, "02 cresceu 100 sobre o dia 01");
  assert.equal(serie[2].followersGained, 200, "03 agora cresce sobre o 02, não sobre o 01");
});

test("importar reescreve o dia que já existia", () => {
  const plano = montarPlano("Data;Seguidores\n01/07/2026;999");
  const serie = aplicarPlano([dia("2026-07-01", 100)], plano);

  assert.equal(serie.length, 1);
  assert.equal(serie[0].followers, 999);
});

test("o que não veio no arquivo não é apagado do dia existente", () => {
  // A planilha traz só seguidores; o alcance já medido daquele dia continua.
  const existente = [dia("2026-07-01", 100)];
  existente[0].organicReach = 4321;

  const plano = montarPlano("Data;Seguidores;Alcance orgânico\n01/07/2026;200;0");
  const serie = aplicarPlano(existente, plano);

  assert.equal(serie[0].followers, 200);
  assert.equal(serie[0].organicReach, 0, "a coluna veio no arquivo, com zero — vale o zero");

  const semAColuna = aplicarPlano(existente, montarPlano("Data;Seguidores\n01/07/2026;200"));
  assert.equal(semAColuna[0].organicReach, 4321, "coluna ausente não pode zerar o que existia");
});

test("espaço como separador de milhar é aceito", () => {
  // Excel em português exporta assim, às vezes com espaço não separável.
  assert.equal(interpretarNumero("12 345"), 12345);
  assert.equal(interpretarNumero("12 345"), 12345);
});
