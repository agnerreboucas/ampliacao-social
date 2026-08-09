import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLOQUEIO_MS,
  ERROS_ANTES_DO_ATRASO,
  ERROS_ANTES_DO_BLOQUEIO,
  JANELA_MS,
  TENTATIVAS_ZERADAS,
  atrasoDe,
  avaliar,
  mensagemDeBloqueio,
  registrarAcerto,
  registrarErro,
} from "./tentativas.ts";

const AGORA = 1_700_000_000_000;

/** Erra `quantidade` vezes seguidas, uma por segundo. */
function errarSeguido(quantidade: number, inicio = AGORA) {
  let estado = TENTATIVAS_ZERADAS;
  for (let i = 0; i < quantidade; i += 1) {
    estado = registrarErro(estado, inicio + i * 1000);
  }
  return estado;
}

test("as primeiras tentativas erradas passam sem atraso", () => {
  for (let erros = 0; erros < ERROS_ANTES_DO_ATRASO; erros += 1) {
    assert.equal(atrasoDe(erros), 0, `${erros} erros não deveriam atrasar`);
  }
});

test("o atraso dobra a cada erro, até um teto", () => {
  assert.equal(atrasoDe(3), 1000);
  assert.equal(atrasoDe(4), 2000);
  assert.equal(atrasoDe(5), 4000);
  assert.equal(atrasoDe(6), 8000);
  assert.equal(atrasoDe(20), 30_000, "o atraso não pode crescer para sempre");
});

test("quem nunca errou entra na hora", () => {
  const decisao = avaliar(TENTATIVAS_ZERADAS, AGORA);
  assert.equal(decisao.permitido, true);
  assert.equal(decisao.permitido && decisao.atrasoMs, 0);
});

test("errar muitas vezes bloqueia por um tempo", () => {
  const estado = errarSeguido(ERROS_ANTES_DO_BLOQUEIO);
  const decisao = avaliar(estado, AGORA + 10_000);

  assert.equal(decisao.permitido, false);
  assert.ok(!decisao.permitido && decisao.segundosRestantes > 0);
});

test("o bloqueio acaba sozinho", () => {
  const estado = errarSeguido(ERROS_ANTES_DO_BLOQUEIO);
  const depois = avaliar(estado, estado.bloqueadoAte + 1);

  assert.equal(depois.permitido, true);
});

test("acertar limpa a contagem", () => {
  const estado = errarSeguido(ERROS_ANTES_DO_BLOQUEIO - 1);
  assert.ok(atrasoDe(estado.erros) > 0);

  const decisao = avaliar(registrarAcerto(), AGORA);
  assert.equal(decisao.permitido, true);
  assert.equal(decisao.permitido && decisao.atrasoMs, 0);
});

test("quem errou ontem não paga hoje", () => {
  // A contagem tem janela: sem erro novo por um tempo, tudo recomeça. Do
  // contrário, alguém que errou três vezes na semana passada entraria hoje já
  // penalizado.
  const antigo = errarSeguido(ERROS_ANTES_DO_BLOQUEIO - 1);
  // A janela conta a partir do último erro, não do primeiro.
  const muitoDepois = antigo.ultimoErroEm + JANELA_MS + 1;

  const decisao = avaliar(antigo, muitoDepois);
  assert.equal(decisao.permitido, true);
  assert.equal(decisao.permitido && decisao.atrasoMs, 0);
});

test("um erro depois da janela recomeça a contagem do um", () => {
  const antigo = errarSeguido(5);
  const novo = registrarErro(antigo, antigo.ultimoErroEm + JANELA_MS + 1);

  assert.equal(novo.erros, 1);
  assert.equal(novo.bloqueadoAte, 0);
});

test("erros dentro da janela continuam somando", () => {
  const estado = errarSeguido(4);
  const novo = registrarErro(estado, AGORA + 5000);

  assert.equal(novo.erros, 5);
});

test("o bloqueio dura o tempo previsto", () => {
  const estado = errarSeguido(ERROS_ANTES_DO_BLOQUEIO);
  const ultimoErroEm = AGORA + (ERROS_ANTES_DO_BLOQUEIO - 1) * 1000;

  assert.equal(estado.bloqueadoAte, ultimoErroEm + BLOQUEIO_MS);
});

test("a mensagem de bloqueio diz quanto falta", () => {
  assert.match(mensagemDeBloqueio(30), /um minuto/);
  assert.match(mensagemDeBloqueio(60), /um minuto/);
  assert.match(mensagemDeBloqueio(600), /10 minutos/);
});
