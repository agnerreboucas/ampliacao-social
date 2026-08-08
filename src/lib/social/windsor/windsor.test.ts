import assert from "node:assert/strict";
import { test } from "node:test";

import { mapearMidiaPaga, resumirCampanhas, totalizar } from "./windsor.ts";

/**
 * Os dados abaixo são linhas reais devolvidas pelo Windsor.ai para a conta de
 * Meta Ads conectada — copiadas de uma chamada de verdade, não inventadas. Se o
 * formato da resposta mudar, estes testes acusam.
 */
const LINHAS_REAIS = [
  {
    date: "2024-09-07",
    account_name: "Neon Cunha",
    campaign: "[05][p2][Tráfego][Mulher graduada]",
    spend: 98.94,
    reach: 9854,
    impressions: 10084,
    clicks: 207,
  },
  {
    date: "2024-09-07",
    account_name: "Neon Cunha",
    campaign: "[01][p1][01][Tráfego][H/M] [remarketing][Privilégio]",
    spend: 150.41,
    reach: 10071,
    impressions: 10963,
    clicks: 292,
  },
  {
    date: "2024-09-08",
    account_name: "Neon Cunha",
    campaign: "[05][p2][Tráfego][Mulher graduada]",
    spend: 105.55,
    reach: 8835,
    impressions: 9196,
    clicks: 230,
  },
];

test("linhas do mesmo dia viram um único ponto diário", () => {
  const dias = mapearMidiaPaga(LINHAS_REAIS);

  assert.equal(dias.length, 2);
  assert.equal(dias[0].date, "2024-09-07");
  // 98,94 + 150,41
  assert.equal(dias[0].adSpend, 249.35);
  assert.equal(dias[0].paidReach, 9854 + 10071);
  assert.equal(dias[0].paidImpressions, 10084 + 10963);
});

test("mídia paga não preenche campos de orgânico", () => {
  const [dia] = mapearMidiaPaga(LINHAS_REAIS);
  // Misturar as origens quebraria o comparativo orgânico x pago do PRD 3.2.
  assert.equal(dia.organicReach, 0);
  assert.equal(dia.organicImpressions, 0);
  assert.equal(dia.organicEngagement, 0);
  assert.equal(dia.followers, 0);
});

test("os dias saem em ordem cronológica", () => {
  const dias = mapearMidiaPaga([...LINHAS_REAIS].reverse());
  assert.deepEqual(
    dias.map((dia) => dia.date),
    ["2024-09-07", "2024-09-08"],
  );
});

test("linha sem data é ignorada em vez de virar um dia inválido", () => {
  const dias = mapearMidiaPaga([{ spend: 10, reach: 5 }, ...LINHAS_REAIS]);
  assert.equal(dias.length, 2);
});

test("valores em texto são convertidos; lixo vira zero", () => {
  const dias = mapearMidiaPaga([
    { date: "2024-09-07", spend: "12.50", reach: "100", impressions: "abc" },
  ]);
  assert.equal(dias[0].adSpend, 12.5);
  assert.equal(dias[0].paidReach, 100);
  assert.equal(dias[0].paidImpressions, 0);
});

test("resumo por campanha soma os dias e calcula CPM e CPC", () => {
  const campanhas = resumirCampanhas(LINHAS_REAIS);

  assert.equal(campanhas.length, 2);

  // Ordenado por investimento: a campanha de tráfego somou 98,94 + 105,55.
  const trafego = campanhas.find((c) => c.campanha.startsWith("[05]"))!;
  assert.equal(trafego.investido, 204.49);
  assert.equal(trafego.cliques, 437);
  assert.equal(trafego.dias, 2);
  assert.equal(trafego.primeiroDia, "2024-09-07");
  assert.equal(trafego.ultimoDia, "2024-09-08");
  assert.equal(trafego.cpm, (204.49 / (10084 + 9196)) * 1000);
  assert.equal(trafego.cpc, 204.49 / 437);
});

test("campanhas vêm ordenadas por investimento", () => {
  const campanhas = resumirCampanhas(LINHAS_REAIS);
  assert.ok(campanhas[0].investido >= campanhas[1].investido);
});

test("campanha sem nome não entra no resumo", () => {
  const campanhas = resumirCampanhas([{ date: "2024-09-07", spend: 50 }]);
  assert.equal(campanhas.length, 0);
});

test("totais somam as campanhas e derivam CPM e CPC do conjunto", () => {
  const totais = totalizar(resumirCampanhas(LINHAS_REAIS));

  assert.equal(totais.campanhas, 2);
  assert.equal(totais.investido, 354.9); // 98,94 + 150,41 + 105,55
  assert.equal(totais.cliques, 207 + 292 + 230);
  assert.equal(totais.impressoes, 10084 + 10963 + 9196);
  assert.equal(totais.cpm, (354.9 / (10084 + 10963 + 9196)) * 1000);
});

test("conjunto vazio não divide por zero", () => {
  const totais = totalizar([]);
  assert.equal(totais.cpm, 0);
  assert.equal(totais.cpc, 0);
  assert.equal(totais.campanhas, 0);
});
