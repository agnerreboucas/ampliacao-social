import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aplicarInsightsDeAnuncios,
  diaDoEndTime,
  mapearContasDescobertas,
  mapearInsightsParaMetricas,
  montarEscopos,
  montarUrlAutorizacao,
} from "./meta.ts";

/**
 * Testes da lógica pura do OAuth da Meta.
 *
 * Rodam sem dependência externa: `npm run test`
 * (node --experimental-strip-types --test).
 */

test("URL de autorização leva os parâmetros exigidos pela Meta", () => {
  const url = new URL(
    montarUrlAutorizacao({
      appId: "123",
      redirectUri: "https://app.exemplo.com/oauth/retorno",
      state: "abc",
      escopos: ["pages_show_list", "instagram_basic"],
    }),
  );

  assert.equal(url.origin, "https://www.facebook.com");
  assert.ok(url.pathname.endsWith("/dialog/oauth"));
  assert.equal(url.searchParams.get("client_id"), "123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://app.exemplo.com/oauth/retorno");
  assert.equal(url.searchParams.get("state"), "abc");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "pages_show_list,instagram_basic");
});

test("escopos não se repetem ao combinar grupos", () => {
  const escopos = montarEscopos(["leitura", "publicacao", "atendimento"]);
  assert.equal(new Set(escopos).size, escopos.length);
  assert.ok(escopos.includes("instagram_basic"));
  assert.ok(escopos.includes("pages_manage_posts"));
});

test("cada Página vira uma conta e o Instagram vinculado vira outra", () => {
  const contas = mapearContasDescobertas({
    data: [
      {
        id: "page-1",
        name: "Mercadinho Perfeito",
        access_token: "token-pagina",
        username: "mercadinho",
        instagram_business_account: { id: "ig-1", username: "mercadinhoperfeito" },
      },
      { id: "page-2", name: "Studio Aurora", access_token: "token-2" },
    ],
  });

  assert.equal(contas.length, 3);

  const facebook = contas.find((c) => c.externalId === "page-1");
  assert.equal(facebook?.networkId, "facebook");
  assert.equal(facebook?.handle, "/mercadinho");

  const instagram = contas.find((c) => c.externalId === "ig-1");
  assert.equal(instagram?.networkId, "instagram");
  assert.equal(instagram?.handle, "@mercadinhoperfeito");
  // O Instagram é operado com o token da Página à qual pertence.
  assert.equal(instagram?.accessToken, "token-pagina");

  const semInstagram = contas.find((c) => c.externalId === "page-2");
  assert.equal(semInstagram?.handle, "/page-2");
});

test("página sem Instagram não inventa conta de Instagram", () => {
  const contas = mapearContasDescobertas({ data: [{ id: "p", name: "P", access_token: "t" }] });
  assert.equal(contas.filter((c) => c.networkId === "instagram").length, 0);
});

test("resposta vazia da Meta não quebra o mapeamento", () => {
  assert.deepEqual(mapearContasDescobertas({}), []);
  assert.deepEqual(mapearContasDescobertas({ data: [] }), []);
});

test("end_time da Meta virá dia no formato do domínio", () => {
  assert.equal(diaDoEndTime("2026-08-08T07:00:00+0000"), "2026-08-08");
});

test("insights de Página viram pontos diários com orgânico e pago separados", () => {
  const dias = mapearInsightsParaMetricas([
    {
      name: "page_fans",
      values: [
        { end_time: "2026-08-07T07:00:00+0000", value: 9000 },
        { end_time: "2026-08-08T07:00:00+0000", value: 9040 },
      ],
    },
    {
      name: "page_impressions_organic_unique",
      values: [
        { end_time: "2026-08-07T07:00:00+0000", value: 1200 },
        { end_time: "2026-08-08T07:00:00+0000", value: 1500 },
      ],
    },
    {
      name: "page_impressions_paid_unique",
      values: [{ end_time: "2026-08-08T07:00:00+0000", value: 800 }],
    },
    {
      name: "page_post_engagements",
      values: [{ end_time: "2026-08-08T07:00:00+0000", value: 95 }],
    },
  ]);

  assert.equal(dias.length, 2);
  assert.equal(dias[0].date, "2026-08-07");
  assert.equal(dias[1].followers, 9040);
  assert.equal(dias[1].organicReach, 1500);
  assert.equal(dias[1].paidReach, 800);
  assert.equal(dias[1].organicEngagement, 95);
  // Dia sem mídia paga fica em zero, não é estimado.
  assert.equal(dias[0].paidReach, 0);
});

test("Instagram entrega ganho diário; o total é reconstruído a partir de hoje", () => {
  const dias = mapearInsightsParaMetricas(
    [
      {
        name: "follower_count",
        values: [
          { end_time: "2026-08-06T07:00:00+0000", value: 10 },
          { end_time: "2026-08-07T07:00:00+0000", value: 20 },
          { end_time: "2026-08-08T07:00:00+0000", value: 5 },
        ],
      },
    ],
    1000,
  );

  assert.equal(dias.at(-1)?.followers, 1000);
  assert.equal(dias[1].followers, 995); // 1000 - 5
  assert.equal(dias[0].followers, 975); // 995 - 20
});

test("sem número de seguidores atual, o acumulado não é adivinhado", () => {
  const dias = mapearInsightsParaMetricas([
    { name: "follower_count", values: [{ end_time: "2026-08-08T07:00:00+0000", value: 7 }] },
  ]);
  assert.equal(dias[0].followers, 0);
  assert.equal(dias[0].followersGained, 7);
});

test("gasto e alcance de anúncios somam nos dias já existentes", () => {
  const dias = mapearInsightsParaMetricas([
    {
      name: "page_impressions_organic_unique",
      values: [{ end_time: "2026-08-08T07:00:00+0000", value: 500 }],
    },
  ]);

  aplicarInsightsDeAnuncios(dias, [
    { date_start: "2026-08-08", spend: "42.50", reach: "1200", impressions: "3000" },
    // Dia fora da janela sincronizada é ignorado em vez de criar ponto solto.
    { date_start: "2026-01-01", spend: "999", reach: "1" },
  ]);

  assert.equal(dias.length, 1);
  assert.equal(dias[0].adSpend, 42.5);
  assert.equal(dias[0].paidReach, 1200);
  assert.equal(dias[0].paidImpressions, 3000);
});
