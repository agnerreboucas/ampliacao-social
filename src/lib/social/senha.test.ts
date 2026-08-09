import assert from "node:assert/strict";
import { test } from "node:test";

import { SenhaFraca, gerarHash, pareceHash, verificarSenha } from "./senha.server.ts";

test("a senha certa confere", async () => {
  const hash = await gerarHash("uma-senha-qualquer");
  assert.equal(await verificarSenha("uma-senha-qualquer", hash), true);
});

test("a senha errada não confere", async () => {
  const hash = await gerarHash("uma-senha-qualquer");
  assert.equal(await verificarSenha("uma-senha-quaIquer", hash), false);
  assert.equal(await verificarSenha("", hash), false);
  assert.equal(await verificarSenha("uma-senha-qualquer ", hash), false);
});

test("o hash não contém a senha", async () => {
  const hash = await gerarHash("frase-secreta-do-cliente");
  assert.ok(!hash.includes("frase"));
  assert.ok(!hash.includes("secreta"));
});

test("a mesma senha gera hashes diferentes", async () => {
  // Sal aleatório: dois usuários com a mesma senha não podem ter o mesmo hash,
  // senão o vazamento de um entrega o outro.
  const [a, b] = await Promise.all([gerarHash("mesma-senha"), gerarHash("mesma-senha")]);
  assert.notEqual(a, b);
  assert.equal(await verificarSenha("mesma-senha", a), true);
  assert.equal(await verificarSenha("mesma-senha", b), true);
});

test("senha curta demais é recusada na hora de definir", async () => {
  await assert.rejects(() => gerarHash("1234567"), SenhaFraca);
  await assert.doesNotReject(() => gerarHash("12345678"));
});

test("acentos e símbolos funcionam", async () => {
  const hash = await gerarHash("Ção@2026#àé");
  assert.equal(await verificarSenha("Ção@2026#àé", hash), true);
  assert.equal(await verificarSenha("Cao@2026#ae", hash), false);
});

test("hash corrompido ou de outro formato não deixa ninguém entrar", async () => {
  for (const invalido of [
    "",
    "abc",
    "scrypt$só$duas$partes",
    "bcrypt$16384$8$1$c2Fs$Y2hhdmU",
    "scrypt$16384$8$1$$",
    "scrypt$x$y$z$c2Fs$Y2hhdmU",
  ]) {
    assert.equal(await verificarSenha("qualquer", invalido), false, `deveria recusar: ${invalido}`);
  }
});

test("o hash carrega os parâmetros, para o custo poder subir depois", async () => {
  const hash = await gerarHash("senha-de-teste");
  const [esquema, n, r, p] = hash.split("$");

  assert.equal(esquema, "scrypt");
  assert.ok(Number(n) >= 16384);
  assert.equal(r, "8");
  assert.equal(p, "1");
});

test("pareceHash distingue hash de qualquer outra coisa", async () => {
  assert.equal(pareceHash(await gerarHash("senha-de-teste")), true);
  assert.equal(pareceHash(undefined), false);
  assert.equal(pareceHash(null), false);
  assert.equal(pareceHash(""), false);
  // Uma senha em texto puro, com os símbolos que costumam aparecer em uma:
  // `pareceHash` precisa dizer não, senão uma senha guardada por engano sem
  // hash passaria por hash e nunca seria migrada.
  assert.equal(pareceHash("@UmaSenhaQualquer2026"), false);
});
