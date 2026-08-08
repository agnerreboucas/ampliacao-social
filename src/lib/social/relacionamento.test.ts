import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aplicarModelo,
  classificarPorInteracoes,
  consolidarPessoas,
  contarPorRelacao,
  separarEnviaveis,
} from "./relacionamento.ts";
import type { InboxItem, NetworkId } from "./types.ts";

const base: Omit<InboxItem, "id" | "accountId" | "kind" | "receivedAt" | "interacoes" | "relacao"> =
  {
    authorHandle: "@alguem",
    authorName: "Alguém da Silva",
    avatarGradient: "g",
    text: "oi",
    postId: null,
    status: "pendente",
    assignedTo: null,
    replies: [],
  };

function item(patch: Partial<InboxItem> & Pick<InboxItem, "id">): InboxItem {
  return {
    ...base,
    accountId: "acc-ig",
    kind: "comentario",
    receivedAt: "2026-08-08T12:00:00.000Z",
    relacao: "seguidor",
    interacoes: 1,
    ...patch,
  };
}

test("a classificação automática segue os limiares de interação", () => {
  assert.equal(classificarPorInteracoes(0), "nao_seguidor");
  assert.equal(classificarPorInteracoes(1), "seguidor");
  assert.equal(classificarPorInteracoes(5), "seguidor");
  assert.equal(classificarPorInteracoes(6), "apoiador");
  assert.equal(classificarPorInteracoes(19), "apoiador");
  assert.equal(classificarPorInteracoes(20), "defensor");
  assert.equal(classificarPorInteracoes(500), "defensor");
});

test("a mesma pessoa em duas redes vira um único registro", () => {
  const redePorConta: Record<string, NetworkId> = { "acc-ig": "instagram", "acc-fb": "facebook" };
  const pessoas = consolidarPessoas(
    [
      item({ id: "a", accountId: "acc-ig", relacao: "seguidor", interacoes: 3 }),
      item({
        id: "b",
        accountId: "acc-fb",
        relacao: "defensor",
        interacoes: 22,
        receivedAt: "2026-08-08T15:00:00.000Z",
      }),
    ],
    redePorConta,
  );

  assert.equal(pessoas.length, 1);
  const [pessoa] = pessoas;
  // O grau mais alto vence: quem já é defensor não regride por outro item.
  assert.equal(pessoa.relacao, "defensor");
  assert.equal(pessoa.interacoes, 22);
  assert.deepEqual(pessoa.redes, ["instagram", "facebook"]);
  assert.equal(pessoa.itemIds.length, 2);
  assert.equal(pessoa.pendentes, 2);
  assert.equal(pessoa.ultimoContatoEm, "2026-08-08T15:00:00.000Z");
});

test("pessoas diferentes permanecem separadas e ordenadas pelo contato mais recente", () => {
  const pessoas = consolidarPessoas(
    [
      item({ id: "a", authorHandle: "@um", receivedAt: "2026-08-01T10:00:00.000Z" }),
      item({ id: "b", authorHandle: "@dois", receivedAt: "2026-08-07T10:00:00.000Z" }),
    ],
    { "acc-ig": "instagram" },
  );

  assert.deepEqual(
    pessoas.map((p) => p.handle),
    ["@dois", "@um"],
  );
});

test("a contagem por relação cobre os quatro graus", () => {
  const contagem = contarPorRelacao([
    item({ id: "a", relacao: "defensor" }),
    item({ id: "b", relacao: "defensor" }),
    item({ id: "c", relacao: "nao_seguidor" }),
  ]);

  assert.deepEqual(contagem, { nao_seguidor: 1, seguidor: 0, apoiador: 0, defensor: 2 });
});

test("o modelo usa só o primeiro nome", () => {
  const texto = aplicarModelo("Oi {nome}, tudo bem? ({handle})", {
    nome: "Marina Costa Ferreira",
    handle: "@marina.costa",
  });

  assert.equal(texto, "Oi Marina, tudo bem? (@marina.costa)");
});

test("o modelo troca todas as ocorrências da variável", () => {
  assert.equal(aplicarModelo("{nome}, {nome}!", { nome: "Ana", handle: "@ana" }), "Ana, Ana!");
});

const agoraMs = Date.parse("2026-08-08T12:00:00.000Z");

test("comentário público é sempre respondível", () => {
  const { enviados, ignorados } = separarEnviaveis(
    [item({ id: "a", kind: "comentario", receivedAt: "2020-01-01T00:00:00.000Z" })],
    { agoraMs, mensageriaPorConta: {} },
  );

  assert.deepEqual(enviados, ["a"]);
  assert.equal(ignorados.length, 0);
});

test("mensagem direta fora da janela de 24h é bloqueada", () => {
  const { enviados, ignorados } = separarEnviaveis(
    [
      item({ id: "dentro", kind: "mensagem", receivedAt: "2026-08-08T02:00:00.000Z" }),
      item({ id: "fora", kind: "mensagem", receivedAt: "2026-08-06T02:00:00.000Z" }),
    ],
    { agoraMs, mensageriaPorConta: { "acc-ig": true } },
  );

  assert.deepEqual(enviados, ["dentro"]);
  assert.equal(ignorados.length, 1);
  assert.equal(ignorados[0].itemId, "fora");
  assert.match(ignorados[0].motivo, /24h/);
});

test("mensagem em conta sem permissão de mensageria é bloqueada", () => {
  const { enviados, ignorados } = separarEnviaveis(
    [item({ id: "a", kind: "mensagem", receivedAt: "2026-08-08T11:00:00.000Z" })],
    { agoraMs, mensageriaPorConta: { "acc-ig": false } },
  );

  assert.equal(enviados.length, 0);
  assert.match(ignorados[0].motivo, /mensageria/);
});
