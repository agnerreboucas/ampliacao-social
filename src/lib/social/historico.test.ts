import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACOES,
  ACOES_CONHECIDAS,
  areaDe,
  detalhesEmTexto,
  filtrar,
  frase,
  pesoDe,
  resumirPorPessoa,
  type EventoHistorico,
} from "./historico.ts";

function evento(parcial: Partial<EventoHistorico> = {}): EventoHistorico {
  return {
    id: "h-1",
    em: "2026-08-09T14:30:00.000Z",
    usuarioId: "u-1",
    usuarioNome: "Bruno",
    projetoId: "proj-1",
    projetoNome: "Campanha",
    acao: "leitura_registrada",
    alvoId: "acc-1",
    alvoRotulo: "@neoncunha",
    detalhes: null,
    ip: null,
    ...parcial,
  };
}

test("toda ação conhecida tem verbo, área e peso", () => {
  for (const acao of ACOES_CONHECIDAS) {
    const definicao = ACOES[acao];
    assert.ok(definicao.verbo.length > 0, `${acao} sem verbo`);
    assert.ok(definicao.area.length > 0, `${acao} sem área`);
    assert.ok(["normal", "atencao"].includes(definicao.peso), `${acao} com peso inválido`);
  }
});

test("a frase junta quem, o quê e sobre o quê", () => {
  assert.equal(frase(evento()), "Bruno registrou uma leitura de números: @neoncunha");
});

test("sem alvo, a frase não deixa dois-pontos soltos", () => {
  assert.equal(frase(evento({ alvoRotulo: null, acao: "entrou" })), "Bruno entrou na plataforma");
});

test("mexer em gente e em dado que sai da plataforma pede atenção", () => {
  assert.equal(pesoDe("usuario_alterado"), "atencao");
  assert.equal(pesoDe("dados_exportados"), "atencao");
  assert.equal(pesoDe("entrada_recusada"), "atencao");
  assert.equal(pesoDe("leitura_registrada"), "normal");
});

test("os detalhes viram texto na ordem em que foram escritos", () => {
  const texto = detalhesEmTexto(evento({ detalhes: { contas: 3, periodo: "30d" } }));
  assert.equal(texto, "contas: 3 · periodo: 30d");
});

test("sem detalhes, texto vazio em vez de 'undefined'", () => {
  assert.equal(detalhesEmTexto(evento()), "");
});

test("o filtro por dia inclui as duas pontas", () => {
  const eventos = [
    evento({ id: "a", em: "2026-08-08T23:59:00.000Z" }),
    evento({ id: "b", em: "2026-08-09T00:00:00.000Z" }),
    evento({ id: "c", em: "2026-08-10T12:00:00.000Z" }),
  ];

  const dentro = filtrar(eventos, { de: "2026-08-09", ate: "2026-08-10" });
  assert.deepEqual(
    dentro.map((e) => e.id),
    ["b", "c"],
  );
});

test("um dia só devolve o dia inteiro, não só a meia-noite", () => {
  const eventos = [
    evento({ id: "manha", em: "2026-08-09T08:00:00.000Z" }),
    evento({ id: "noite", em: "2026-08-09T23:45:00.000Z" }),
    evento({ id: "outro", em: "2026-08-10T00:01:00.000Z" }),
  ];

  const doDia = filtrar(eventos, { de: "2026-08-09", ate: "2026-08-09" });
  assert.deepEqual(
    doDia.map((e) => e.id),
    ["manha", "noite"],
  );
});

test("filtrar por área pega todas as ações daquela área", () => {
  const eventos = [
    evento({ id: "a", acao: "entrou" }),
    evento({ id: "b", acao: "entrada_recusada" }),
    evento({ id: "c", acao: "leitura_registrada" }),
  ];

  const acesso = filtrar(eventos, { area: areaDe("entrou") });
  assert.deepEqual(
    acesso.map((e) => e.id),
    ["a", "b"],
  );
});

test("a busca livre alcança quem agiu e o alvo, sem diferenciar maiúscula", () => {
  const eventos = [
    evento({ id: "a", usuarioNome: "Ana Paula" }),
    evento({ id: "b", usuarioNome: "Bruno", alvoRotulo: "@ANAPAULA" }),
    evento({ id: "c", usuarioNome: "Carlos", alvoRotulo: "@outra" }),
  ];

  const achados = filtrar(eventos, { busca: "anapaula" });
  assert.deepEqual(
    achados.map((e) => e.id),
    ["b"],
  );
  assert.deepEqual(
    filtrar(eventos, { busca: "ana" }).map((e) => e.id),
    ["a", "b"],
  );
});

test("filtros se combinam em vez de se substituírem", () => {
  const eventos = [
    evento({ id: "a", usuarioId: "u-1", acao: "entrou" }),
    evento({ id: "b", usuarioId: "u-2", acao: "entrou" }),
    evento({ id: "c", usuarioId: "u-1", acao: "leitura_registrada" }),
  ];

  assert.deepEqual(
    filtrar(eventos, { usuarioId: "u-1", acao: "entrou" }).map((e) => e.id),
    ["a"],
  );
});

test("sem filtro, nada é escondido", () => {
  const eventos = [evento({ id: "a" }), evento({ id: "b" })];
  assert.equal(filtrar(eventos, {}).length, 2);
});

test("o resumo conta por pessoa e ordena de quem mais usou para quem menos", () => {
  const eventos = [
    evento({ usuarioId: "u-1", usuarioNome: "Bruno", acao: "entrou" }),
    evento({ usuarioId: "u-1", usuarioNome: "Bruno", acao: "leitura_registrada" }),
    evento({ usuarioId: "u-1", usuarioNome: "Bruno", acao: "leitura_registrada" }),
    evento({ usuarioId: "u-2", usuarioNome: "Ana", acao: "entrou" }),
  ];

  const resumo = resumirPorPessoa(eventos);
  assert.equal(resumo.length, 2);
  assert.equal(resumo[0].usuarioNome, "Bruno");
  assert.equal(resumo[0].acoes, 3);
  assert.equal(resumo[1].usuarioNome, "Ana");
  assert.deepEqual(resumo[0].porArea[0], { area: "Números", acoes: 2 });
});

test("o resumo guarda a ação mais recente, mesmo fora de ordem", () => {
  const eventos = [
    evento({ usuarioId: "u-1", em: "2026-08-01T10:00:00.000Z" }),
    evento({ usuarioId: "u-1", em: "2026-08-09T10:00:00.000Z" }),
    evento({ usuarioId: "u-1", em: "2026-08-05T10:00:00.000Z" }),
  ];

  assert.equal(resumirPorPessoa(eventos)[0].ultimaEm, "2026-08-09T10:00:00.000Z");
});

test("tentativas sem sessão não se misturam com quem tem conta", () => {
  // Duas entradas recusadas sem sessão não são "a mesma pessoa" só porque
  // ambas têm usuarioId nulo — mas também não podem sumir do resumo, que é
  // onde um ataque apareceria.
  const eventos = [
    evento({ usuarioId: null, usuarioNome: "desconhecido@exemplo.com", acao: "entrada_recusada" }),
    evento({ usuarioId: null, usuarioNome: "desconhecido@exemplo.com", acao: "entrada_recusada" }),
    evento({ usuarioId: null, usuarioNome: "outro@exemplo.com", acao: "entrada_recusada" }),
    evento({ usuarioId: "u-1", usuarioNome: "Bruno" }),
  ];

  const resumo = resumirPorPessoa(eventos);
  assert.equal(resumo.length, 3);
  assert.equal(resumo[0].usuarioNome, "desconhecido@exemplo.com");
  assert.equal(resumo[0].acoes, 2);
  assert.equal(resumo[0].usuarioId, null);
});
