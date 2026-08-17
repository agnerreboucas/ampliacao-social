import assert from "node:assert/strict";
import { test } from "node:test";

import type { PecaAvaliada } from "./conteudo.ts";
import {
  BLOCOS,
  blocoDaHora,
  descreverQuando,
  horariosPorFormato,
  mapaDeHorarios,
  melhoresBlocos,
  melhoresHorarios,
} from "./horarios.ts";
import type { Post, PostFormat } from "./types.ts";

/**
 * Uma peça já avaliada, com o que o módulo de horários precisa: quando saiu,
 * quanto alcançou e em que formato.
 */
function peca(
  dia: number,
  hora: number,
  alcance: number,
  formato: PostFormat = "imagem",
  taxa = 4,
): PecaAvaliada {
  return {
    post: { id: `p-${Math.random()}`, format: formato } as Post,
    alcance,
    interacoes: Math.round((alcance * taxa) / 100),
    taxa,
    comentarios: 0,
    contraMedia: 0,
    assuntos: [],
    diaDaSemana: dia,
    hora,
  };
}

test("cada hora cai no bloco de três horas certo", () => {
  assert.equal(blocoDaHora(0).rotulo, "0h–3h");
  assert.equal(blocoDaHora(2).rotulo, "0h–3h");
  assert.equal(blocoDaHora(3).rotulo, "3h–6h");
  assert.equal(blocoDaHora(19).rotulo, "18h–21h");
  assert.equal(blocoDaHora(23).rotulo, "21h–0h");
});

test("o mapa tem a grade inteira, inclusive as casas vazias", () => {
  // Um mapa de calor com buracos não se lê: o olho compara linhas e colunas, e
  // "nunca publicamos nesse horário" é informação, não ausência dela.
  const mapa = mapaDeHorarios([peca(2, 19, 5000)]);

  assert.equal(mapa.casas.length, 7 * BLOCOS.length);
  assert.equal(mapa.casas.filter((casa) => casa.pecas > 0).length, 1);
});

test("a casa média o alcance das peças dela", () => {
  const mapa = mapaDeHorarios([peca(4, 19, 4000), peca(4, 20, 6000)]);
  const casa = mapa.casas.find((c) => c.dia === 4 && c.bloco === 6);

  assert.equal(casa?.pecas, 2);
  assert.equal(casa?.alcanceMedio, 5000);
});

test("uma peça só não sustenta recomendação", () => {
  // O modo de falha: um post que foi bem por acaso viraria "publique sempre às
  // terças de madrugada", e alguém seguiria.
  const pecas = [peca(2, 3, 90_000), peca(4, 19, 5000), peca(5, 19, 5200), peca(6, 20, 4800)];

  const melhores = melhoresHorarios(pecas, { minimoDePecas: 2 });

  assert.ok(
    melhores.every((casa) => casa.pecas >= 2),
    "nenhuma recomendação pode vir de uma peça só",
  );
  assert.ok(
    !melhores.some((casa) => casa.bloco === 1),
    "a madrugada com um único acerto não pode encabeçar a lista",
  );
});

test("sem histórico suficiente, a lista volta vazia em vez de inventar", () => {
  assert.deepEqual(melhoresHorarios([peca(1, 10, 3000)], { minimoDePecas: 3 }), []);
  assert.deepEqual(melhoresHorarios([]), []);
});

test("os melhores vêm ordenados por alcance", () => {
  const pecas = [
    peca(1, 19, 8000),
    peca(1, 20, 8200),
    peca(3, 10, 3000),
    peca(3, 11, 3200),
    peca(5, 13, 5000),
    peca(5, 14, 5400),
  ];

  const melhores = melhoresHorarios(pecas, { minimoDePecas: 2, quantidade: 3 });

  assert.equal(melhores.length, 3);
  assert.ok(melhores[0].alcanceMedio > melhores[1].alcanceMedio);
  assert.ok(melhores[1].alcanceMedio > melhores[2].alcanceMedio);
  assert.match(melhores[0].quando, /segunda-feira, 18h–21h/);
});

test("ordenar por alcance, e não por taxa, mantém a madrugada fora", () => {
  // Um post ótimo às três da manhã tem taxa alta sobre um alcance minúsculo.
  // Ordenar por taxa colocaria a madrugada em primeiro, e o conselho seria o
  // oposto do certo.
  const pecas = [
    peca(2, 3, 200, "imagem", 40),
    peca(2, 4, 220, "imagem", 38),
    peca(4, 19, 9000, "imagem", 5),
    peca(4, 20, 9500, "imagem", 5),
  ];

  const melhores = melhoresHorarios(pecas, { minimoDePecas: 2 });

  assert.equal(melhores[0].bloco, 6, "o fim da tarde tem que vir na frente da madrugada");
});

test("contra a média diz se vale a pena publicar naquela casa", () => {
  const pecas = [peca(1, 19, 9000), peca(1, 20, 9000), peca(3, 10, 3000), peca(3, 11, 3000)];

  const melhores = melhoresHorarios(pecas, { minimoDePecas: 2 });

  // Média geral = 6.000; a casa das 18h–21h tem 9.000 → +50%.
  assert.equal(Math.round(melhores[0].contraMedia), 50);
});

test("somando os dias, o bloco do dia conclui com amostra bem menor", () => {
  // É o motivo de este corte existir: o cruzamento dia × bloco raramente
  // sustenta uma conclusão numa campanha nova.
  const pecas = [peca(1, 19, 8000), peca(3, 20, 8400), peca(5, 19, 7600)];

  assert.deepEqual(melhoresHorarios(pecas, { minimoDePecas: 3 }), []);

  const blocos = melhoresBlocos(pecas, { minimoDePecas: 3 });
  assert.equal(blocos.length, 1);
  assert.equal(blocos[0].pecas, 3);
  assert.equal(blocos[0].quando, "18h–21h");
});

test("cada formato tem o próprio melhor horário", () => {
  // A diferença é real: story é consumido no intervalo do dia e reels à noite.
  const pecas = [
    peca(1, 12, 4000, "story"),
    peca(2, 13, 4200, "story"),
    peca(3, 12, 3800, "story"),
    peca(1, 20, 9000, "video"),
    peca(2, 19, 9400, "video"),
    peca(4, 20, 8800, "video"),
  ];

  const porFormato = horariosPorFormato(pecas, { minimoDePecas: 3, quantidade: 1 });
  const story = porFormato.find((item) => item.formato === "story");
  const video = porFormato.find((item) => item.formato === "video");

  assert.equal(story?.melhores[0].quando, "12h–15h");
  assert.equal(video?.melhores[0].quando, "18h–21h");
  assert.equal(video?.rotulo, "Vídeo");
});

test("formato com poucas peças diz o que falta, em vez de sumir", () => {
  // A ausência de recomendação é ela própria a informação útil: falta publicar
  // mais naquele formato para saber.
  const pecas = [peca(1, 12, 4000, "carrossel"), peca(2, 19, 9000, "video")];

  const porFormato = horariosPorFormato(pecas, { minimoDePecas: 3 });
  const carrossel = porFormato.find((item) => item.formato === "carrossel");

  assert.deepEqual(carrossel?.melhores, []);
  assert.match(carrossel?.ressalva ?? "", /1 peça publicada/);
});

test("formato espalhado demais recebe outra explicação", () => {
  const pecas = [
    peca(1, 2, 4000, "imagem"),
    peca(2, 8, 4000, "imagem"),
    peca(3, 14, 4000, "imagem"),
    peca(4, 22, 4000, "imagem"),
  ];

  const imagem = horariosPorFormato(pecas, { minimoDePecas: 3 })[0];

  assert.deepEqual(imagem.melhores, []);
  assert.match(imagem.ressalva ?? "", /espalhadas demais/);
});

test("o formato com mais peças vem primeiro", () => {
  const pecas = [
    peca(1, 12, 4000, "story"),
    peca(2, 12, 4000, "story"),
    peca(3, 12, 4000, "story"),
    peca(4, 19, 9000, "video"),
  ];

  assert.equal(horariosPorFormato(pecas)[0].formato, "story");
});

test("a frase do horário é a que alguém escreveria", () => {
  assert.equal(descreverQuando({ dia: 4, bloco: 6 }), "quinta-feira, 18h–21h");
  assert.equal(descreverQuando({ dia: 0, bloco: 3 }), "domingo, 9h–12h");
});

test("a escala de cor usa só as casas em que dá para confiar", () => {
  // Uma casa de uma peça com alcance absurdo esticaria a escala e achataria o
  // resto do mapa até tudo parecer igual.
  const pecas = [peca(0, 3, 80_000), peca(1, 19, 5000), peca(2, 19, 5400)];

  const mapa = mapaDeHorarios(pecas, { minimoDePecas: 2 });

  assert.ok(mapa.maiorAlcance < 10_000, "a casa de uma peça não pode definir a escala");
});
