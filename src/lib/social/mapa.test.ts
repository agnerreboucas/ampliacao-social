import assert from "node:assert/strict";
import { test } from "node:test";

import { PROPORCAO_DO_MAPA, faixaDoIps, medirCobertura, montarMapa, projetar } from "./mapa.ts";
import { CODIGO_DA_CAPITAL, MUNICIPIOS_SP, acharMunicipio } from "./municipios-sp.ts";
import type { Boost } from "./types.ts";

function boost(cidades: string[], alcance = 10_000, gasto = 300): Boost {
  return {
    id: `boost-${Math.random().toString(36).slice(2, 8)}`,
    postId: "post-1",
    accountId: "acc-1",
    objective: "alcance",
    budgetTotal: gasto,
    durationDays: 7,
    startedAt: "2026-08-01",
    endsAt: "2026-08-08",
    status: "ativo",
    audience: { locations: cidades, ageMin: 18, ageMax: 65, interests: [] },
    results: {
      spend: gasto,
      reach: alcance,
      impressions: alcance * 2,
      engagement: 500,
      clicks: 100,
    },
  };
}

// --- A base --------------------------------------------------------------

test("o estado tem os 645 municípios, e a capital está entre eles", () => {
  assert.equal(MUNICIPIOS_SP.length, 645);
  const capital = MUNICIPIOS_SP.find((m) => m.codigo === CODIGO_DA_CAPITAL);
  assert.equal(capital?.nome, "São Paulo");
});

test("todo município tem coordenada utilizável", () => {
  // Sem coordenada não há ponto no mapa, e um município mudo some sem aviso.
  for (const municipio of MUNICIPIOS_SP) {
    assert.ok(
      municipio.lat < -19 && municipio.lat > -26,
      `${municipio.nome} com latitude fora do estado: ${municipio.lat}`,
    );
    assert.ok(
      municipio.lon < -44 && municipio.lon > -54,
      `${municipio.nome} com longitude fora do estado: ${municipio.lon}`,
    );
  }
});

test("os códigos do IBGE não se repetem", () => {
  const codigos = new Set(MUNICIPIOS_SP.map((m) => m.codigo));
  assert.equal(codigos.size, MUNICIPIOS_SP.length);
});

test("quem não entrou no ranking fica sem IPS, não com zero", () => {
  const semIps = MUNICIPIOS_SP.filter((m) => m.ips === null);
  assert.equal(semIps.length, 45, "600 dos 645 têm nota");
  for (const municipio of semIps) {
    assert.equal(municipio.posicao, null);
  }
});

// --- Casamento de nomes -----------------------------------------------------

test("o nome da segmentação casa mesmo escrito de outro jeito", () => {
  // É por aqui que a cidade entra no mapa; falhar aqui a faz sumir em silêncio.
  assert.equal(acharMunicipio("São Paulo")?.codigo, CODIGO_DA_CAPITAL);
  assert.equal(acharMunicipio("SAO PAULO")?.codigo, CODIGO_DA_CAPITAL);
  assert.equal(acharMunicipio("são paulo")?.codigo, CODIGO_DA_CAPITAL);
  assert.equal(acharMunicipio("São Paulo (+10 km)")?.codigo, CODIGO_DA_CAPITAL);
  assert.equal(acharMunicipio("  São Paulo  ")?.codigo, CODIGO_DA_CAPITAL);
});

test("cidade de fora do estado não casa com nada", () => {
  assert.equal(acharMunicipio("Recife"), null);
  assert.equal(acharMunicipio("Belo Horizonte"), null);
});

// --- Projeção ---------------------------------------------------------------

test("todo município cai dentro da caixa de desenho", () => {
  for (const municipio of MUNICIPIOS_SP) {
    const { x, y } = projetar(municipio.lat, municipio.lon);
    assert.ok(x >= 0 && x <= 1, `${municipio.nome} com x fora: ${x}`);
    assert.ok(y >= 0 && y <= PROPORCAO_DO_MAPA, `${municipio.nome} com y fora: ${y}`);
  }
});

test("a caixa é do tamanho do estado, sem faixa morta", () => {
  // São Paulo é deitado. Se a proporção virasse 1, seria sinal de que o desenho
  // voltou a ser quadrado — e um terço da altura seria espaço vazio.
  assert.ok(PROPORCAO_DO_MAPA > 0.5 && PROPORCAO_DO_MAPA < 0.85, String(PROPORCAO_DO_MAPA));

  // E as bordas precisam ser tocadas dos dois lados, senão sobra margem.
  const xs = MUNICIPIOS_SP.map((m) => projetar(m.lat, m.lon).x);
  const ys = MUNICIPIOS_SP.map((m) => projetar(m.lat, m.lon).y);
  assert.equal(Math.min(...xs), 0);
  assert.equal(Math.max(...xs), 1);
  assert.equal(Math.min(...ys), 0);
  assert.ok(Math.abs(Math.max(...ys) - PROPORCAO_DO_MAPA) < 1e-9);
});

test("o norte fica em cima e o leste à direita", () => {
  // O eixo Y da tela cresce para baixo; trocar isso espelharia o estado.
  const norte = projetar(-20, -48);
  const sul = projetar(-25, -48);
  assert.ok(norte.y < sul.y, "o ponto mais ao norte precisa ter y menor");

  const oeste = projetar(-23, -52);
  const leste = projetar(-23, -45);
  assert.ok(leste.x > oeste.x, "o ponto mais a leste precisa ter x maior");
});

// --- Alcance por município --------------------------------------------------

test("o anúncio segmentado marca o município no mapa", () => {
  const pontos = montarMapa([boost(["São Paulo"])]);
  const capital = pontos.find((ponto) => ponto.ehCapital)!;

  assert.equal(capital.alcance, 10_000);
  assert.equal(capital.investido, 300);
  assert.deepEqual(capital.publicacoes, ["post-1"]);
});

test("município não segmentado fica com zero — é o vazio que interessa", () => {
  const pontos = montarMapa([boost(["São Paulo"])]);
  const semEntrega = pontos.filter((ponto) => ponto.alcance === 0);

  assert.equal(semEntrega.length, 644);
});

test("anúncio para várias cidades divide o alcance entre elas", () => {
  const pontos = montarMapa([boost(["São Paulo", "Guarulhos", "Osasco"], 9000, 300)]);
  const comEntrega = pontos.filter((ponto) => ponto.alcance > 0);

  assert.equal(comEntrega.length, 3);
  for (const ponto of comEntrega) assert.equal(ponto.alcance, 3000);
});

test("dois anúncios na mesma cidade somam", () => {
  const pontos = montarMapa([boost(["Campinas"], 5000), boost(["Campinas"], 3000)]);
  const campinas = pontos.find((ponto) => ponto.municipio.nome === "Campinas")!;

  assert.equal(campinas.alcance, 8000);
});

test("cidade de fora do estado não quebra o mapa", () => {
  const pontos = montarMapa([boost(["Recife", "São Paulo"])]);
  const capital = pontos.find((ponto) => ponto.ehCapital)!;

  // Recife não casa, então só a capital conta — e recebe o alcance inteiro.
  assert.equal(capital.alcance, 10_000);
  assert.equal(pontos.length, 645);
});

test("sem impulsionamento, o mapa continua completo e vazio", () => {
  const pontos = montarMapa([]);
  assert.equal(pontos.length, 645);
  assert.ok(pontos.every((ponto) => ponto.alcance === 0));
});

// --- Cobertura --------------------------------------------------------------

test("a cobertura é medida sobre os prioritários, não sobre os 645", () => {
  // Cobrir o estado inteiro não é meta de campanha nenhuma; o que importa é
  // quanto do topo do ranking foi atingido.
  const cobertura = medirCobertura(montarMapa([boost(["São Bernardo do Campo"])]), 10);

  assert.equal(cobertura.total, 10);
  assert.equal(cobertura.alcancados, 1);
  assert.ok(Math.abs(cobertura.fatia - 0.1) < 0.001);
});

test("os prioritários que faltam saem em ordem de prioridade", () => {
  const cobertura = medirCobertura(montarMapa([boost(["Guarulhos"])]), 5);

  assert.equal(cobertura.faltando.length, 4);
  assert.equal(cobertura.faltando[0].nome, "São Bernardo do Campo", "o número 1 vem antes");
  assert.equal(
    cobertura.faltando.some((m) => m.nome === "Guarulhos"),
    false,
    "quem foi alcançado não está faltando",
  );
});

test("a população alcançada soma só a dos prioritários atingidos", () => {
  const cobertura = medirCobertura(montarMapa([boost(["São Bernardo do Campo"])]), 3);

  assert.equal(cobertura.populacaoAlcancada, 810_729);
  assert.ok(cobertura.populacaoTotal > cobertura.populacaoAlcancada);
});

test("campanha sem entrega tem cobertura zero, sem dividir por zero", () => {
  const cobertura = medirCobertura(montarMapa([]), 20);

  assert.equal(cobertura.alcancados, 0);
  assert.equal(cobertura.fatia, 0);
  assert.equal(cobertura.faltando.length, 20);
});

// --- Faixas -----------------------------------------------------------------

test("cada nota cai na faixa que corresponde", () => {
  assert.equal(faixaDoIps(76)?.rotulo, "70 a 80");
  assert.equal(faixaDoIps(65)?.rotulo, "60 a 70");
  assert.equal(faixaDoIps(55)?.rotulo, "50 a 60");
  assert.equal(faixaDoIps(30)?.rotulo, "abaixo de 40");
});

test("município sem nota não recebe cor inventada", () => {
  assert.equal(faixaDoIps(null), null);
});
