import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

import {
  ChaveDeCriptografiaAusente,
  cifrar,
  decifrar,
  lerChave,
  mascarar,
} from "./cripto.server.ts";

const chave = randomBytes(32);

test("o que é cifrado volta igual", () => {
  const token = "EAAG...token-de-pagina-da-meta";
  assert.equal(decifrar(cifrar(token, chave), chave), token);
});

test("o mesmo token cifrado duas vezes gera valores diferentes", () => {
  // IV aleatório: dois clientes com o mesmo token não ficam iguais no banco.
  assert.notEqual(cifrar("abc", chave), cifrar("abc", chave));
});

test("token adulterado é rejeitado em vez de devolver lixo", () => {
  const guardado = cifrar("token-original", chave);
  const partes = guardado.split(".");
  const conteudoAdulterado = Buffer.from("outro-valor").toString("base64url");
  assert.throws(() =>
    decifrar([partes[0], partes[1], partes[2], conteudoAdulterado].join("."), chave),
  );
});

test("chave errada não decifra", () => {
  const guardado = cifrar("token", chave);
  assert.throws(() => decifrar(guardado, randomBytes(32)));
});

test("formato desconhecido pede reconexão em vez de estourar sem contexto", () => {
  assert.throws(() => decifrar("token-em-texto-puro", chave), /reconecte a conta/i);
});

test("chave ausente falha com instrução de como gerar", () => {
  assert.throws(() => lerChave(undefined), ChaveDeCriptografiaAusente);
  assert.throws(() => lerChave(Buffer.from("curta").toString("base64")), /32 bytes/);
});

test("chave válida em base64 é aceita", () => {
  assert.equal(lerChave(chave.toString("base64")).length, 32);
});

test("máscara não revela o token", () => {
  const token = "EAAGabcdefghijklmnop";
  const mascarado = mascarar(token);
  assert.ok(!mascarado.includes("abcdefgh"));
  assert.ok(mascarado.endsWith("mnop"));
  assert.equal(mascarar("curto"), "••••");
});
