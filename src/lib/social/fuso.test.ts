import assert from "node:assert/strict";
import { test } from "node:test";

import { paredeNaZona } from "./fuso.ts";

test("a hora é a do fuso pedido, não a da máquina", () => {
  // A publicação de abertura da campanha: 02h31 em São Paulo, 05h31 em UTC.
  // Rodando numa hospedagem em UTC, `getHours()` diria 5 — e a peça mudaria de
  // bloco do dia, mudando a recomendação de horário com a hospedagem.
  const abertura = "2026-08-16T05:31:00.000Z";

  assert.equal(paredeNaZona(abertura, "America/Sao_Paulo").hora, 2);
  assert.equal(paredeNaZona(abertura, "UTC").hora, 5);
});

test("o dia da semana também muda com o fuso", () => {
  // 23h de sábado em São Paulo já é domingo em UTC.
  const sabadoTarde = "2026-08-16T02:00:00.000Z";

  assert.equal(paredeNaZona(sabadoTarde, "America/Sao_Paulo").diaDaSemana, 6, "sábado");
  assert.equal(paredeNaZona(sabadoTarde, "UTC").diaDaSemana, 0, "domingo");
});

test("o dia sai no formato de chave, naquele fuso", () => {
  const virada = "2026-08-16T02:30:00.000Z";

  assert.equal(paredeNaZona(virada, "America/Sao_Paulo").dia, "2026-08-15");
  assert.equal(paredeNaZona(virada, "UTC").dia, "2026-08-16");
});

test("meia-noite é zero, não vinte e quatro", () => {
  // Algumas versões do ICU devolvem "24" para meia-noite, e 24 estouraria o
  // índice do bloco do dia.
  const meiaNoite = "2026-08-16T03:00:00.000Z";

  assert.equal(paredeNaZona(meiaNoite, "America/Sao_Paulo").hora, 0);
});
