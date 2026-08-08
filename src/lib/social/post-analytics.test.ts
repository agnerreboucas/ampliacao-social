import assert from "node:assert/strict";
import { test } from "node:test";

import {
  curvaDoPost,
  dividirPorConta,
  itensDaMidia,
  taxaDeEngajamento,
  totalDeInteracoes,
} from "./post-analytics.ts";
import type { Post, PostMetrics } from "./types.ts";

const metricas: PostMetrics = {
  reach: 5000,
  impressions: 7300,
  likes: 240,
  comments: 31,
  shares: 12,
  saves: 44,
};

const post = {
  id: "post-1",
  accountIds: ["acc-ig", "acc-fb"],
  metrics: metricas,
  publishedAt: "2026-08-01T12:00:00.000Z",
} satisfies Pick<Post, "id" | "accountIds" | "metrics" | "publishedAt">;

test("a divisão por conta soma exatamente o total", () => {
  const porConta = dividirPorConta(post);
  const soma = (campo: keyof PostMetrics) =>
    Object.values(porConta).reduce((total, m) => total + m[campo], 0);

  assert.equal(soma("reach"), metricas.reach);
  assert.equal(soma("impressions"), metricas.impressions);
  assert.equal(soma("likes"), metricas.likes);
  assert.equal(soma("comments"), metricas.comments);
  assert.equal(soma("shares"), metricas.shares);
  assert.equal(soma("saves"), metricas.saves);
});

test("a divisão é estável: a mesma publicação mostra sempre os mesmos números", () => {
  assert.deepEqual(dividirPorConta(post), dividirPorConta(post));
});

test("contas diferentes recebem parcelas diferentes", () => {
  const porConta = dividirPorConta(post);
  assert.notEqual(porConta["acc-ig"].reach, porConta["acc-fb"].reach);
});

test("publicação em uma única conta recebe o total inteiro", () => {
  const porConta = dividirPorConta({ ...post, accountIds: ["acc-ig"] });
  assert.deepEqual(porConta["acc-ig"], metricas);
});

test("publicação sem métricas não inventa divisão", () => {
  assert.deepEqual(dividirPorConta({ id: "p", accountIds: ["a"], metrics: null }), {});
});

test("a curva soma o alcance total e começa no dia da publicação", () => {
  const curva = curvaDoPost(post, 8);
  assert.equal(curva.length, 8);
  assert.equal(curva[0].dia, 0);
  assert.equal(curva[0].data, "2026-08-01");
  assert.equal(
    curva.reduce((total, ponto) => total + ponto.reach, 0),
    metricas.reach,
  );
});

test("a curva decai: o primeiro dia alcança mais que o último", () => {
  const curva = curvaDoPost(post, 8);
  assert.ok(curva[0].reach > curva.at(-1)!.reach);
});

test("a curva soma o engajamento total", () => {
  const curva = curvaDoPost(post, 10);
  assert.equal(
    curva.reduce((total, ponto) => total + ponto.engagement, 0),
    totalDeInteracoes(metricas),
  );
});

test("publicação não publicada não tem curva", () => {
  assert.deepEqual(curvaDoPost({ id: "p", metrics: metricas, publishedAt: null }), []);
});

test("taxa de engajamento usa o alcance como base", () => {
  assert.equal(taxaDeEngajamento(metricas), (327 / 5000) * 100);
  assert.equal(taxaDeEngajamento({ ...metricas, reach: 0 }), 0);
});

test("carrossel lista um rótulo por item; imagem e vídeo, um só", () => {
  assert.deepEqual(
    itensDaMidia({ format: "carrossel", media: { count: 3, aspectRatio: "4:5", fileSizeMb: 1 } }),
    ["Item 1", "Item 2", "Item 3"],
  );
  assert.deepEqual(
    itensDaMidia({ format: "video", media: { count: 1, aspectRatio: "9:16", fileSizeMb: 1 } }),
    ["Vídeo"],
  );
  assert.deepEqual(
    itensDaMidia({ format: "imagem", media: { count: 1, aspectRatio: "1:1", fileSizeMb: 1 } }),
    ["Imagem"],
  );
});
