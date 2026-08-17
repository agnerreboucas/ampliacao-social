import assert from "node:assert/strict";
import { test } from "node:test";

import { carregarDoBanco } from "./postgres.server.ts";

/**
 * Um `pg.Pool` de mentira que responde por tabela.
 *
 * Existe para poder testar a decisão "este banco está vazio?" sem subir um
 * Postgres: a decisão é lógica de aplicação, não de banco, e foi justamente ela
 * que apagou a senha do administrador em produção.
 */
function poolFalso(linhasPorTabela: Record<string, Record<string, unknown>[]>) {
  return {
    query(sql: string) {
      const tabela = /from\s+([a-z_]+)/i.exec(sql)?.[1] ?? "";
      const rows = linhasPorTabela[tabela] ?? [];
      return Promise.resolve({ rows, rowCount: rows.length });
    },
  } as never;
}

const ADMINISTRADOR = {
  id: "user-1",
  nome: "Quem administra",
  email: "admin@campanha.com.br",
  papel: "administrador",
  senha_hash: "scrypt$1$sal$derivacao",
  ordem: 0,
  ultimo_acesso_em: new Date("2026-08-14T12:00:00Z"),
  avatar_gradiente: "from-sky-500 to-blue-600",
};

test("instalação sem conta de rede conectada não é banco vazio", async () => {
  // O modo de falha que este teste tranca: a checagem de "vazio" era feita na
  // tabela de contas de rede social. Uma instalação nova e legítima — projeto,
  // administrador e senha definida — não tem conta nenhuma até alguém conectar
  // a primeira. Concluir "vazio" ali fazia a subida regravar o estado de
  // estreia por cima e zerar o hash da senha, sem erro nenhum no log.
  const estado = await carregarDoBanco(
    poolFalso({
      usuarios: [ADMINISTRADOR],
      projetos: [{ id: "proj-1", nome: "Campanha", cliente: "Campanha", ordem: 0 }],
      contas: [],
    }),
  );

  assert.notEqual(estado, null, "banco com usuário não pode ser tratado como vazio");
  assert.equal(estado?.users.length, 1);
  assert.equal(estado?.accounts.length, 0);
});

test("o hash da senha sobrevive à leitura", async () => {
  // Se o hash não voltar do banco para a memória, a próxima gravação o
  // sobrescreve com nulo — e a senha some sem ninguém ter mudado nada.
  const estado = await carregarDoBanco(poolFalso({ usuarios: [ADMINISTRADOR] }));

  assert.equal(estado?.users[0].senhaHash, ADMINISTRADOR.senha_hash);
});

test("banco realmente vazio continua devolvendo nulo", async () => {
  // É o que faz a primeira subida criar a instalação em vez de abrir vazia.
  assert.equal(await carregarDoBanco(poolFalso({})), null);
});
