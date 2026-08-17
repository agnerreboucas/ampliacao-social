import assert from "node:assert/strict";
import { test } from "node:test";

import {
  exigirProducaoConfigurada,
  mensagemDePendencias,
  pendenciasDeProducao,
} from "./producao.server.ts";

const CHAVE_BOA = "a".repeat(48);
const EMAIL = "admin@campanha.com.br";

test("produção sem banco não sobe", () => {
  // É o modo de falha que esta checagem existe para impedir: sem banco a
  // plataforma entra em demonstração, e em demonstração qualquer senha entra.
  const pendencias = pendenciasDeProducao({
    NODE_ENV: "production",
    SESSION_SECRET: CHAVE_BOA,
    ADMIN_EMAIL: EMAIL,
  });

  assert.equal(pendencias.length, 1);
  assert.equal(pendencias[0].variavel, "DATABASE_URL");
  assert.match(pendencias[0].porque, /qualquer senha entra/);
});

test("produção sem chave de sessão não sobe", () => {
  const pendencias = pendenciasDeProducao({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:s@h/b",
    ADMIN_EMAIL: EMAIL,
  });

  assert.equal(pendencias.length, 1);
  assert.equal(pendencias[0].variavel, "SESSION_SECRET");
  assert.match(pendencias[0].porque, /código-fonte/);
});

test("chave curta é recusada, e a mensagem diz o tamanho", () => {
  // Uma chave de oito caracteres passa despercebida numa revisão e não protege
  // nada; recusar com o número na frente é o que faz alguém trocá-la.
  const pendencias = pendenciasDeProducao({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:s@h/b",
    SESSION_SECRET: "curtinha",
    ADMIN_EMAIL: EMAIL,
  });

  assert.equal(pendencias.length, 1);
  assert.match(pendencias[0].porque, /8 caracteres/);
});

test("produção sem administrador não sobe", () => {
  // Numa instalação nova o banco está vazio: sem este e-mail não existe conta
  // nenhuma para receber a primeira senha, e o passo a passo trava no meio.
  const pendencias = pendenciasDeProducao({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:s@h/b",
    SESSION_SECRET: CHAVE_BOA,
  });

  assert.equal(pendencias.length, 1);
  assert.equal(pendencias[0].variavel, "ADMIN_EMAIL");
  assert.match(pendencias[0].porque, /primeiro administrador/);
});

test("com banco e chave, não há pendência", () => {
  assert.deepEqual(
    pendenciasDeProducao({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:s@h/b",
      SESSION_SECRET: CHAVE_BOA,
      ADMIN_EMAIL: EMAIL,
    }),
    [],
  );
});

test("fora de produção nada é exigido", () => {
  // A demonstração precisa continuar subindo sem banco nenhum.
  assert.doesNotThrow(() => exigirProducaoConfigurada({ NODE_ENV: "development" }));
  assert.doesNotThrow(() => exigirProducaoConfigurada({}));
});

test("em produção incompleta, a subida é interrompida", () => {
  assert.throws(
    () => exigirProducaoConfigurada({ NODE_ENV: "production" }),
    /DATABASE_URL, ADMIN_EMAIL, SESSION_SECRET/,
  );
});

test("em produção completa, a subida segue", () => {
  assert.doesNotThrow(() =>
    exigirProducaoConfigurada({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://u:s@h/b",
      SESSION_SECRET: CHAVE_BOA,
      ADMIN_EMAIL: EMAIL,
    }),
  );
});

test("a mensagem diz o que fazer, e não só o que está errado", () => {
  const texto = mensagemDePendencias(pendenciasDeProducao({ NODE_ENV: "production" }));

  assert.match(texto, /DATABASE_URL/);
  assert.match(texto, /SESSION_SECRET/);
  assert.match(texto, /painel da hospedagem/);
  // O caminho de volta para a demonstração precisa estar na mesma mensagem:
  // quem só quer mostrar a plataforma não deveria ter que procurar.
  assert.match(texto, /NODE_ENV/);
});
