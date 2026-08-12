import assert from "node:assert/strict";
import { test } from "node:test";

import { MINIMOS, recomendar, resumirCanais, type EntradaRecomendacoes } from "./recomendacoes.ts";
import type { DailyMetric, Post, SocialAccount } from "./types.ts";

const AGORA = Date.parse("2026-08-12T12:00:00Z");

function conta(parcial: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: "acc-1",
    projectId: "proj-1",
    networkId: "instagram",
    handle: "@teste",
    displayName: "Conta de teste",
    status: "ativa",
    origem: "demonstracao",
    adAccountConnected: true,
    trackingSince: "2026-01-01",
    tokenExpiresAt: null,
    lastSyncAt: null,
    messagingApproved: true,
    avatarGradient: "",
    ...parcial,
  };
}

/** `quantidade` dias terminando em `ultimoDia`, com os valores informados. */
function dias(
  quantidade: number,
  valores: Partial<DailyMetric> = {},
  ultimoDia = "2026-08-12",
): DailyMetric[] {
  const fim = Date.parse(`${ultimoDia}T12:00:00Z`);
  return Array.from({ length: quantidade }, (_, indice) => {
    const data = new Date(fim - (quantidade - 1 - indice) * 86400000);
    return {
      date: data.toISOString().slice(0, 10),
      followers: 1000,
      followersGained: 5,
      followersLost: 2,
      organicReach: 1000,
      paidReach: 0,
      organicImpressions: 1500,
      paidImpressions: 0,
      organicEngagement: 50,
      paidEngagement: 0,
      adSpend: 0,
      ...valores,
    };
  });
}

function post(parcial: Partial<Post> = {}): Post {
  return {
    id: `post-${Math.random().toString(36).slice(2, 8)}`,
    projectId: "proj-1",
    accountIds: ["acc-1"],
    format: "imagem",
    caption: "legenda",
    media: { count: 1, aspectRatio: "1:1", fileSizeMb: 1 },
    status: "publicado",
    scheduledFor: null,
    publishedAt: "2026-08-01T12:00:00Z",
    createdBy: "user-1",
    approvedBy: null,
    requiresApproval: false,
    metrics: { reach: 1000, impressions: 1200, likes: 10, comments: 2, shares: 1, saves: 1 },
    coverGradient: "",
    ...parcial,
  };
}

function entrada(parcial: Partial<EntradaRecomendacoes> = {}): EntradaRecomendacoes {
  return {
    contas: [conta()],
    metricasPorConta: new Map([["acc-1", dias(30)]]),
    posts: [],
    period: "30d",
    interacoesPendentes: 0,
    pendenteMaisAntigaEm: null,
    agoraMs: AGORA,
    ...parcial,
  };
}

test("toda recomendação carrega a evidência que a sustenta", () => {
  // A regra central do módulo. Se uma análise nova esquecer a evidência, este
  // teste falha antes de a sugestão sem lastro chegar à tela.
  const recomendacoes = recomendar(
    entrada({
      contas: [conta(), conta({ id: "acc-2", displayName: "Segunda" })],
      metricasPorConta: new Map([
        ["acc-1", dias(30, { followersGained: 1, followersLost: 40 })],
        ["acc-2", []],
      ]),
      posts: [post(), post(), post()],
      interacoesPendentes: 5,
      pendenteMaisAntigaEm: "2026-08-09T12:00:00Z",
    }),
  );

  assert.ok(recomendacoes.length > 0, "o cenário deveria gerar recomendações");
  for (const recomendacao of recomendacoes) {
    assert.ok(recomendacao.evidencia.trim().length > 0, `"${recomendacao.titulo}" sem evidência`);
    assert.ok(recomendacao.acao.trim().length > 0, `"${recomendacao.titulo}" sem ação`);
    assert.ok(
      /\d/.test(recomendacao.evidencia),
      `"${recomendacao.titulo}" sem número na evidência`,
    );
  }
});

test("os identificadores não se repetem — a tela usa como chave", () => {
  const recomendacoes = recomendar(
    entrada({
      contas: [conta(), conta({ id: "acc-2", displayName: "Segunda" })],
      metricasPorConta: new Map([
        ["acc-1", dias(30, { followersLost: 40 })],
        ["acc-2", dias(30, { followersLost: 40 })],
      ]),
    }),
  );

  const ids = recomendacoes.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, `ids repetidos: ${ids.join(", ")}`);
});

test("histórico curto não gera conselho sobre tendência", () => {
  const recomendacoes = recomendar(
    entrada({ metricasPorConta: new Map([["acc-1", dias(MINIMOS.diasParaTendencia - 1)]]) }),
  );

  assert.equal(
    recomendacoes.some((r) => r.id === "alcance-tendencia"),
    false,
    "com menos de duas semanas não dá para falar de tendência",
  );
});

test("poucas publicações não decidem qual formato rende mais", () => {
  const recomendacoes = recomendar(
    entrada({
      posts: [
        post({ format: "video", metrics: { ...post().metrics!, reach: 9000 } }),
        post({ format: "imagem" }),
        post({ format: "imagem" }),
      ],
    }),
  );

  assert.equal(
    recomendacoes.some((r) => r.id === "formato-vencedor"),
    false,
    "três posts não sustentam uma recomendação de formato",
  );
});

test("com amostra suficiente, o formato que rende mais aparece", () => {
  const videos = Array.from({ length: 4 }, () =>
    post({ format: "video", metrics: { ...post().metrics!, reach: 5000 } }),
  );
  const imagens = Array.from({ length: 4 }, () =>
    post({ format: "imagem", metrics: { ...post().metrics!, reach: 1000 } }),
  );

  const recomendacoes = recomendar(entrada({ posts: [...videos, ...imagens] }));
  const formato = recomendacoes.find((r) => r.id === "formato-vencedor");

  assert.ok(formato, "deveria recomendar o formato de melhor média");
  assert.match(formato.titulo, /Vídeo/);
  assert.match(formato.evidencia, /5\.000/);
  assert.match(formato.evidencia, /400%/);
});

test("formatos com desempenho parecido não viram recomendação", () => {
  const videos = Array.from({ length: 4 }, () =>
    post({ format: "video", metrics: { ...post().metrics!, reach: 1100 } }),
  );
  const imagens = Array.from({ length: 4 }, () =>
    post({ format: "imagem", metrics: { ...post().metrics!, reach: 1000 } }),
  );

  const recomendacoes = recomendar(entrada({ posts: [...videos, ...imagens] }));
  assert.equal(
    recomendacoes.some((r) => r.id === "formato-vencedor"),
    false,
    "10% de diferença não justifica mudar a pauta",
  );
});

test("variação pequena de alcance não é chamada de tendência", () => {
  // 60 dias iguais: o período atual e o anterior são idênticos.
  const recomendacoes = recomendar(entrada({ metricasPorConta: new Map([["acc-1", dias(60)]]) }));

  assert.equal(
    recomendacoes.some((r) => r.id === "alcance-tendencia"),
    false,
  );
});

test("conta sem leitura há semanas é apontada, com o dia da última", () => {
  const recomendacoes = recomendar(
    entrada({ metricasPorConta: new Map([["acc-1", dias(30, {}, "2026-07-10")]]) }),
  );

  const parada = recomendacoes.find((r) => r.id === "parado-acc-1");
  assert.ok(parada, "uma conta parada há um mês deveria aparecer");
  assert.equal(parada.peso, "risco");
  assert.match(parada.evidencia, /2026-07-10/);
});

test("conta atualizada ontem não é acusada de parada", () => {
  const recomendacoes = recomendar(
    entrada({ metricasPorConta: new Map([["acc-1", dias(30, {}, "2026-08-11")]]) }),
  );

  assert.equal(
    recomendacoes.some((r) => r.id.startsWith("parado-")),
    false,
  );
});

test("perder mais seguidores do que ganhar é risco", () => {
  const recomendacoes = recomendar(
    entrada({
      metricasPorConta: new Map([["acc-1", dias(30, { followersGained: 2, followersLost: 30 })]]),
    }),
  );

  const perda = recomendacoes.find((r) => r.id === "perda-acc-1");
  assert.ok(perda);
  assert.equal(perda.peso, "risco");
  assert.match(perda.evidencia, /900.*60/s);
});

test("crescer não dispara alerta de perda", () => {
  const recomendacoes = recomendar(
    entrada({
      metricasPorConta: new Map([["acc-1", dias(30, { followersGained: 30, followersLost: 2 })]]),
    }),
  );

  assert.equal(
    recomendacoes.some((r) => r.id.startsWith("perda-")),
    false,
  );
});

test("interação parada há mais de dois dias vira risco", () => {
  const recomendacoes = recomendar(
    entrada({ interacoesPendentes: 7, pendenteMaisAntigaEm: "2026-08-09T12:00:00Z" }),
  );

  const inbox = recomendacoes.find((r) => r.id === "inbox-parada");
  assert.ok(inbox);
  assert.equal(inbox.peso, "risco");
  assert.match(inbox.evidencia, /72 horas/);
});

test("interação recente não vira alarme", () => {
  const recomendacoes = recomendar(
    entrada({ interacoesPendentes: 3, pendenteMaisAntigaEm: "2026-08-12T06:00:00Z" }),
  );

  assert.equal(
    recomendacoes.some((r) => r.id === "inbox-parada"),
    false,
    "seis horas de espera ainda é atendimento normal",
  );
});

test("as mais graves vêm primeiro", () => {
  const recomendacoes = recomendar(
    entrada({
      metricasPorConta: new Map([["acc-1", dias(30, { followersGained: 1, followersLost: 50 })]]),
      interacoesPendentes: 4,
      pendenteMaisAntigaEm: "2026-08-11T00:00:00Z",
    }),
  );

  const pesos = recomendacoes.map((r) => r.peso);
  const ordem = { risco: 0, atencao: 1, oportunidade: 2 };
  for (let i = 1; i < pesos.length; i += 1) {
    assert.ok(ordem[pesos[i - 1]] <= ordem[pesos[i]], `fora de ordem: ${pesos.join(", ")}`);
  }
});

test("projeto sem nada não inventa conselho", () => {
  const recomendacoes = recomendar(entrada({ contas: [], metricasPorConta: new Map(), posts: [] }));
  assert.deepEqual(recomendacoes, []);
});

test("investimento sem dias suficientes não vira análise de custo", () => {
  const recomendacoes = recomendar(
    entrada({
      metricasPorConta: new Map([
        ["acc-1", [...dias(25), ...dias(3, { adSpend: 100, paidReach: 5000 }, "2026-08-12")]],
      ]),
    }),
  );

  assert.equal(
    recomendacoes.some((r) => r.id === "custo-por-mil"),
    false,
  );
});

test("o custo por mil sai em reais e com a base do cálculo", () => {
  const recomendacoes = recomendar(
    entrada({
      metricasPorConta: new Map([["acc-1", dias(30, { adSpend: 100, paidReach: 10_000 })]]),
    }),
  );

  const custo = recomendacoes.find((r) => r.id === "custo-por-mil");
  assert.ok(custo);
  // 30 dias × R$100 = R$3.000 por 300.000 alcançados = R$10 por mil.
  assert.match(custo.evidencia, /R\$\s?10,00/);
  assert.match(custo.evidencia, /30 dias/);
});

test("alcance pago muito acima do orgânico vira aviso de dependência", () => {
  const recomendacoes = recomendar(
    entrada({
      metricasPorConta: new Map([
        ["acc-1", dias(30, { adSpend: 50, paidReach: 10_000, organicReach: 500 })],
      ]),
    }),
  );

  const dependencia = recomendacoes.find((r) => r.id === "dependencia-de-midia");
  assert.ok(dependencia, "pago 20x maior que o orgânico deveria acender a luz");
  assert.equal(dependencia.peso, "atencao");
});

test("o resumo por canal ordena por alcance e fecha 100% de participação", () => {
  const linhas = resumirCanais(
    [conta(), conta({ id: "acc-2", displayName: "Segunda", handle: "@dois" })],
    new Map([
      ["acc-1", dias(30, { organicReach: 100 })],
      ["acc-2", dias(30, { organicReach: 300 })],
    ]),
    "30d",
  );

  assert.equal(linhas[0].accountId, "acc-2", "o canal de maior alcance vem primeiro");
  const soma = linhas.reduce((total, linha) => total + linha.participacao, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9, `participações deveriam somar 1, somaram ${soma}`);
});

test("canal sem alcance não divide por zero", () => {
  const linhas = resumirCanais(
    [conta()],
    new Map([["acc-1", dias(5, { organicReach: 0 })]]),
    "30d",
  );

  assert.equal(linhas[0].taxaEngajamento, 0);
  assert.equal(linhas[0].participacao, 0);
});
