import assert from "node:assert/strict";
import { test } from "node:test";

import {
  conversasPorPeca,
  diaPorExtenso,
  indexarOrigens,
  nomeDoFormato,
  resumirPeca,
  trechoDaLegenda,
} from "./rastreio.ts";
import type { InboxItem, Post, SocialAccount } from "./types.ts";

function conta(id: string, networkId: SocialAccount["networkId"]): SocialAccount {
  return {
    id,
    projectId: "proj-1",
    networkId,
    handle: `@${id}`,
    displayName: id,
    status: "ativa",
    origem: "demonstracao",
    adAccountConnected: false,
    trackingSince: "2026-01-01",
    tokenExpiresAt: null,
    lastSyncAt: "2026-08-01T10:00:00.000Z",
    messagingApproved: false,
    avatarGradient: "linear-gradient(#000,#fff)",
  };
}

function post(parcial: Partial<Post> = {}): Post {
  return {
    id: "post-1",
    projectId: "proj-1",
    accountIds: ["acc-ig"],
    format: "video",
    caption: "Caminhada no centro hoje de manhã com a equipe toda #agenda",
    media: { count: 1, aspectRatio: "9:16", fileSizeMb: 30, durationSeconds: 40 },
    status: "publicado",
    scheduledFor: null,
    publishedAt: "2026-08-06T19:00:00.000Z",
    createdBy: "user-1",
    approvedBy: null,
    requiresApproval: false,
    metrics: { reach: 5000, impressions: 7000, likes: 300, comments: 40, shares: 12, saves: 20 },
    coverGradient: "linear-gradient(#111,#222)",
    ...parcial,
  };
}

function interacao(id: string, postId: string | null): InboxItem {
  return {
    id,
    accountId: "acc-ig",
    kind: "comentario",
    authorHandle: "@alguem",
    authorName: "Alguém",
    avatarGradient: "linear-gradient(#000,#fff)",
    text: "muito bom",
    postId,
    receivedAt: "2026-08-06T20:00:00.000Z",
    status: "pendente",
    assignedTo: null,
    replies: [],
    relacao: "seguidor",
    interacoes: 1,
  };
}

// --- Trecho da legenda -------------------------------------------------------

test("legenda curta passa inteira", () => {
  assert.equal(trechoDaLegenda("Bom dia!"), "Bom dia!");
});

test("legenda longa é cortada em palavra inteira", () => {
  const trecho = trechoDaLegenda("um ".repeat(60), 20);
  assert.ok(trecho.endsWith("…"));
  assert.ok(trecho.length <= 21, trecho);
  assert.equal(trecho.includes("  "), false);
});

test("palavra única gigante é cortada mesmo assim", () => {
  // Sem esta saída, uma legenda de uma palavra só voltaria inteira e quebraria
  // o layout da linha que a mostra.
  const trecho = trechoDaLegenda("a".repeat(200), 20);
  assert.equal(trecho.length, 21);
});

test("quebras de linha viram espaço simples", () => {
  assert.equal(trechoDaLegenda("linha um\n\nlinha dois"), "linha um linha dois");
});

// --- Resumo da peça ----------------------------------------------------------

test("o resumo carrega formato, dia e números", () => {
  const resumo = resumirPeca(post(), [conta("acc-ig", "instagram")]);

  assert.equal(resumo.formato, "video");
  assert.equal(resumo.publicadoEm, "2026-08-06T19:00:00.000Z");
  assert.deepEqual(resumo.redes, ["instagram"]);
  assert.deepEqual(resumo.metricas, { alcance: 5000, curtidas: 300, comentarios: 40 });
});

test("peça sem números da rede volta com métricas nulas, não zeradas", () => {
  // Zero e "ainda não medido" levam a conclusões opostas.
  const resumo = resumirPeca(post({ metrics: null }), [conta("acc-ig", "instagram")]);
  assert.equal(resumo.metricas, null);
});

test("publicação cruzada lista as duas redes, sem repetir", () => {
  const resumo = resumirPeca(post({ accountIds: ["acc-ig", "acc-fb", "acc-ig2"] }), [
    conta("acc-ig", "instagram"),
    conta("acc-fb", "facebook"),
    conta("acc-ig2", "instagram"),
  ]);

  assert.deepEqual(resumo.redes, ["instagram", "facebook"]);
});

test("conta que sumiu não vira rede indefinida na lista", () => {
  const resumo = resumirPeca(post({ accountIds: ["acc-que-nao-existe"] }), []);
  assert.deepEqual(resumo.redes, []);
});

// --- Índice ------------------------------------------------------------------

test("o índice traz só as peças que alguma conversa cita", () => {
  const indice = indexarOrigens(
    [interacao("i1", "post-1"), interacao("i2", "post-1")],
    [post(), post({ id: "post-2" })],
    [conta("acc-ig", "instagram")],
  );

  assert.deepEqual(Object.keys(indice), ["post-1"]);
});

test("conversa apontando para peça inexistente não inventa origem", () => {
  // Interação importada ou publicação apagada na rede: a tela precisa poder
  // dizer "não encontrada" em vez de mostrar um cartão vazio.
  const indice = indexarOrigens([interacao("i1", "post-sumiu")], [post()], []);
  assert.equal(indice["post-sumiu"], undefined);
});

test("mensagem direta não tem publicação de origem", () => {
  const indice = indexarOrigens([interacao("i1", null)], [post()], []);
  assert.deepEqual(indice, {});
});

// --- Contagem ----------------------------------------------------------------

test("conta quantas conversas cada peça gerou", () => {
  const contagem = conversasPorPeca([
    interacao("i1", "post-1"),
    interacao("i2", "post-1"),
    interacao("i3", "post-2"),
    interacao("i4", null),
  ]);

  assert.deepEqual(contagem, { "post-1": 2, "post-2": 1 });
});

// --- Formato e dia -----------------------------------------------------------

test("cada formato tem nome em português, story incluído", () => {
  assert.equal(nomeDoFormato("video"), "vídeo");
  assert.equal(nomeDoFormato("story"), "story");
  assert.equal(nomeDoFormato("carrossel"), "carrossel");
  assert.equal(nomeDoFormato("imagem"), "imagem");
});

test("o dia sai com o dia da semana, que é como a pessoa lembra", () => {
  // 6 de agosto de 2026 é uma quinta-feira.
  const frase = diaPorExtenso("2026-08-06T19:00:00.000Z");
  assert.ok(frase?.startsWith("quinta-feira, 6 de agosto"), String(frase));
});

test("hora quebrada aparece com os minutos", () => {
  const frase = diaPorExtenso("2026-08-06T19:35:00.000Z");
  assert.ok(frase?.endsWith("h35"), String(frase));
});

test("sem data publicada, não há dia a mostrar", () => {
  assert.equal(diaPorExtenso(null), null);
  assert.equal(diaPorExtenso("data podre"), null);
});
