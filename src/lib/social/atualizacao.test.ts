import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aplicarValores,
  atualizacoesDoDia,
  janelaDe,
  progressoDoDia,
  valoresDe,
  variacaoEntre,
  VALORES_ZERADOS,
} from "./atualizacao.ts";
import type { AtualizacaoManual, DailyMetric, ValoresManuais } from "./types.ts";

function dia(date: string, followers: number, patch: Partial<DailyMetric> = {}): DailyMetric {
  return {
    date,
    followers,
    followersGained: 0,
    followersLost: 0,
    organicReach: 100,
    paidReach: 0,
    organicImpressions: 120,
    paidImpressions: 0,
    organicEngagement: 10,
    paidEngagement: 0,
    adSpend: 0,
    ...patch,
  };
}

const valores = (patch: Partial<ValoresManuais> = {}): ValoresManuais => ({
  ...VALORES_ZERADOS,
  followers: 1000,
  organicReach: 500,
  ...patch,
});

test("atualizar de novo o mesmo dia substitui a linha em vez de criar outra", () => {
  const serie = [dia("2026-08-06", 900), dia("2026-08-07", 950)];

  const primeira = aplicarValores(serie, "2026-08-07", valores({ followers: 960 }));
  const segunda = aplicarValores(primeira, "2026-08-07", valores({ followers: 975 }));
  const terceira = aplicarValores(segunda, "2026-08-07", valores({ followers: 981 }));

  // Três atualizações no dia, um ponto só no histórico.
  assert.equal(terceira.length, 2);
  assert.equal(terceira.filter((d) => d.date === "2026-08-07").length, 1);
  assert.equal(terceira.at(-1)?.followers, 981);
});

test("um dia novo entra na ordem certa", () => {
  const serie = [dia("2026-08-05", 900), dia("2026-08-07", 950)];
  const resultado = aplicarValores(serie, "2026-08-06", valores({ followers: 925 }));

  assert.deepEqual(
    resultado.map((d) => d.date),
    ["2026-08-05", "2026-08-06", "2026-08-07"],
  );
});

test("ganho e perda de seguidores saem da diferença para o dia anterior", () => {
  const serie = [dia("2026-08-06", 900)];

  const crescendo = aplicarValores(serie, "2026-08-07", valores({ followers: 940 }));
  const linhaCrescendo = crescendo.at(-1)!;
  assert.equal(linhaCrescendo.followersGained, 40);
  assert.equal(linhaCrescendo.followersLost, 0);

  const caindo = aplicarValores(serie, "2026-08-07", valores({ followers: 880 }));
  const linhaCaindo = caindo.at(-1)!;
  assert.equal(linhaCaindo.followersGained, 0);
  assert.equal(linhaCaindo.followersLost, 20);
});

test("o dia anterior é o anterior de verdade, não o último da lista", () => {
  // Preencher um buraco no meio não pode olhar para o fim da série.
  const serie = [dia("2026-08-01", 800), dia("2026-08-09", 2000)];
  const resultado = aplicarValores(serie, "2026-08-02", valores({ followers: 850 }));
  const linha = resultado.find((d) => d.date === "2026-08-02")!;

  assert.equal(linha.followersGained, 50);
});

test("sem dia anterior não há ganho inventado", () => {
  const resultado = aplicarValores([], "2026-08-07", valores({ followers: 1200 }));
  assert.equal(resultado[0].followersGained, 0);
  assert.equal(resultado[0].followersLost, 0);
});

test("os valores digitados voltam intactos do histórico", () => {
  const serie = aplicarValores([], "2026-08-07", valores({ followers: 1000, adSpend: 42.5 }));
  const devolvidos = valoresDe(serie[0]);

  assert.equal(devolvidos.followers, 1000);
  assert.equal(devolvidos.adSpend, 42.5);
});

test("a janela sai da hora do registro", () => {
  assert.equal(janelaDe("2026-08-07T09:00:00"), "manha");
  assert.equal(janelaDe("2026-08-07T13:30:00"), "tarde");
  assert.equal(janelaDe("2026-08-07T21:10:00"), "noite");
});

test("a variação lista só o que mudou", () => {
  const variacoes = variacaoEntre(
    valores({ followers: 1000, organicReach: 500 }),
    valores({ followers: 1030, organicReach: 500 }),
  );

  assert.equal(variacoes.length, 1);
  assert.equal(variacoes[0].chave, "followers");
  assert.equal(variacoes[0].diferenca, 30);
});

test("a variação enxerga queda", () => {
  const variacoes = variacaoEntre(valores({ followers: 1000 }), valores({ followers: 990 }));
  assert.equal(variacoes[0].diferenca, -10);
});

function registro(id: string, registradaEm: string, date = "2026-08-07"): AtualizacaoManual {
  return {
    id,
    accountId: "acc-ig",
    date,
    registradaEm,
    autor: "Ana",
    valores: valores(),
  };
}

test("os registros do dia saem em ordem e só da conta pedida", () => {
  const log: AtualizacaoManual[] = [
    registro("c", "2026-08-07T20:00:00"),
    registro("a", "2026-08-07T08:00:00"),
    { ...registro("outro", "2026-08-07T09:00:00"), accountId: "acc-fb" },
    registro("b", "2026-08-07T14:00:00"),
    registro("ontem", "2026-08-06T14:00:00", "2026-08-06"),
  ];

  const doDia = atualizacoesDoDia(log, "acc-ig", "2026-08-07");
  assert.deepEqual(
    doDia.map((item) => item.id),
    ["a", "b", "c"],
  );
});

test("o progresso do dia aponta a próxima janela em aberto", () => {
  const parcial = progressoDoDia([
    registro("a", "2026-08-07T08:00:00"),
    registro("b", "2026-08-07T14:00:00"),
  ]);

  assert.equal(parcial.feitas, 2);
  assert.equal(parcial.meta, 3);
  assert.deepEqual(parcial.janelasFeitas, ["manha", "tarde"]);
  assert.equal(parcial.proxima, "noite");
});

test("duas leituras na mesma janela não fecham o dia", () => {
  const progresso = progressoDoDia([
    registro("a", "2026-08-07T08:00:00"),
    registro("b", "2026-08-07T10:00:00"),
  ]);

  assert.equal(progresso.feitas, 2);
  assert.equal(progresso.proxima, "tarde");
});

test("dia completo não tem próxima janela", () => {
  const progresso = progressoDoDia([
    registro("a", "2026-08-07T08:00:00"),
    registro("b", "2026-08-07T14:00:00"),
    registro("c", "2026-08-07T20:00:00"),
  ]);

  assert.equal(progresso.proxima, null);
});
