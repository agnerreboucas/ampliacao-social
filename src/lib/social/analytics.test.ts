import assert from "node:assert/strict";
import { test } from "node:test";

import { slicePeriod, summarize } from "./analytics.ts";

test("a variação compara com o período anterior, e some quando ele não existe", () => {
  // O cartão por rede recortava a série antes de resumir, e o "anterior"
  // chegava vazio — a variação do alcance saía zero em todos os cartões e a
  // tela mostrava um traço, como se o dado não existisse.
  const dias = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    followers: 1000 + i,
    followersGained: 2,
    followersLost: 1,
    // Os dez primeiros dias rendem metade dos dez últimos.
    organicReach: i < 10 ? 100 : 200,
    paidReach: 0,
    organicImpressions: 0,
    paidImpressions: 0,
    organicEngagement: 0,
    paidEngagement: 0,
    adSpend: 0,
  }));

  const comAnterior = summarize(dias, "7d");
  assert.ok(comAnterior.reachDelta > 0, "com histórico anterior, a variação existe");

  // Recortar antes é o erro que existia: sem o anterior, não há com que
  // comparar, e o zero é honesto.
  const semAnterior = summarize(slicePeriod(dias, "7d"), "tudo");
  assert.equal(semAnterior.reachDelta, 0);
});
