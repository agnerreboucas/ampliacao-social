import assert from "node:assert/strict";
import { test } from "node:test";

import type { PecaAvaliada } from "./conteudo.ts";
import {
  BLOCOS,
  atividadePorBloco,
  barrasDoQuadro,
  blocoDaHora,
  blocosDoDia,
  categoriasDoQuadro,
  pecasDaBarra,
  redesPresentes,
  detalharFaixa,
  rotuloDaBarra,
  compararComOPublico,
  picoDoPublico,
  descreverQuando,
  horariosPorFormato,
  mapaDeHorarios,
  melhoresBlocos,
  melhoresHorarios,
  type PecaNoTempo,
} from "./horarios.ts";
import type { NetworkId, Post, PostFormat } from "./types.ts";

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

// --- Quando o público está online -------------------------------------------

/** Uma curva de atividade por hora, como a rede devolve. */
function atividade(...horas: [number, number][]): { hour: number; activity: number }[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    activity: horas.find(([h]) => h === hour)?.[1] ?? 0,
  }));
}

test("a atividade do público é somada por bloco", () => {
  const blocos = atividadePorBloco(atividade([19, 30], [20, 40], [9, 10]));

  const noite = blocos.find((bloco) => bloco.bloco === 6);
  assert.equal(noite?.atividade, 70);
  assert.equal(Math.round((noite?.fatia ?? 0) * 100), 88);
});

test("o pico do público é o bloco mais movimentado", () => {
  const pico = picoDoPublico(atividade([9, 20], [20, 55]));

  assert.equal(pico?.rotulo, "18h–21h");
});

test("sem dado de público, não há pico", () => {
  assert.equal(picoDoPublico([]), null);
  assert.equal(picoDoPublico(atividade()), null);
});

test("quando campanha e público batem, a frase manda manter", () => {
  const melhor = melhoresBlocos([peca(1, 19, 8000), peca(2, 20, 8400), peca(3, 19, 7600)], {
    minimoDePecas: 3,
  })[0];

  const frase = compararComOPublico(melhor, picoDoPublico(atividade([20, 60])));

  assert.match(frase ?? "", /o mesmo em que o público/);
  assert.match(frase ?? "", /Manter/);
});

test("quando divergem, a frase diz onde testar", () => {
  // É a conclusão que nenhum dos dois números mostra sozinho.
  const melhor = melhoresBlocos([peca(1, 10, 8000), peca(2, 10, 8400), peca(3, 11, 7600)], {
    minimoDePecas: 3,
  })[0];

  const frase = compararComOPublico(melhor, picoDoPublico(atividade([20, 60])));

  assert.match(frase ?? "", /9h–12h/);
  assert.match(frase ?? "", /18h–21h/);
  assert.match(frase ?? "", /vale testar/);
});

test("com meio dado, a frase não é inventada", () => {
  assert.equal(compararComOPublico(undefined, picoDoPublico(atividade([20, 60]))), null);
  assert.equal(compararComOPublico(melhoresBlocos([peca(1, 19, 100)])[0], null), null);
});

test("os oito blocos do dia vêm todos, na ordem do relógio", () => {
  // Um gráfico com só os três melhores faz as outras cinco faixas parecerem sem
  // alcance nenhum — e o comparativo com o público fica errado.
  const blocos = blocosDoDia([peca(1, 19, 8000), peca(2, 10, 3000)]);

  assert.equal(blocos.length, BLOCOS.length);
  assert.deepEqual(
    blocos.map((bloco) => bloco.bloco),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(blocos[6].alcanceMedio, 8000);
  assert.equal(blocos[0].pecas, 0);
});

// --- O quadro de barras ------------------------------------------------------

function noTempo(
  dia: number,
  hora: number,
  alcance: number,
  formato: PostFormat,
  redes: NetworkId[],
): PecaNoTempo {
  return {
    id: `p-${dia}-${hora}-${Math.random()}`,
    dia,
    hora,
    formato,
    redes,
    alcance,
    interacoes: Math.round(alcance * 0.05),
    legenda: "legenda",
    publicadoEm: "2026-08-17T12:00:00",
    quando: `17/08 ${String(hora).padStart(2, "0")}:00`,
  };
}

test("o eixo de horário tem os oito blocos; o de dia, os sete dias", () => {
  const pecas = [noTempo(2, 19, 5000, "imagem", ["instagram"])];

  assert.equal(barrasDoQuadro(pecas, { eixo: "horario", recorte: "formato" }).length, 8);
  assert.equal(barrasDoQuadro(pecas, { eixo: "dia", recorte: "formato" }).length, 7);
});

test("por formato, a soma é exata", () => {
  // Cada peça tem um formato só — nada a repartir.
  const pecas = [
    noTempo(2, 19, 5000, "imagem", ["instagram"]),
    noTempo(3, 20, 3000, "video", ["instagram"]),
    noTempo(4, 19, 2000, "imagem", ["instagram"]),
  ];

  const barras = barrasDoQuadro(pecas, { eixo: "horario", recorte: "formato" });
  const noite = barras.find((barra) => barra.chave === "h-6");

  assert.equal(noite?.total, 10_000);
  assert.equal(noite?.pecas, 3);
  assert.equal(noite?.fatias.find((f) => f.chave === "imagem")?.valor, 7000);
  assert.equal(noite?.fatias.find((f) => f.chave === "video")?.valor, 3000);
});

test("por rede, a peça é dividida entre as redes e o total não infla", () => {
  // O erro pior seria somar o alcance inteiro em cada rede: a barra ficaria
  // maior que o alcance real da campanha.
  const pecas = [noTempo(2, 19, 6000, "carrossel", ["instagram", "facebook", "tiktok"])];

  const barra = barrasDoQuadro(pecas, { eixo: "horario", recorte: "rede" }).find(
    (item) => item.chave === "h-6",
  );

  assert.equal(barra?.total, 6000);
  assert.equal(barra?.fatias.length, 3);
  for (const fatia of barra?.fatias ?? []) assert.equal(fatia.valor, 2000);
});

test("peça sem rede escolhida não desaparece do total", () => {
  const barra = barrasDoQuadro([noTempo(2, 19, 4000, "a_definir", [])], {
    eixo: "horario",
    recorte: "rede",
  }).find((item) => item.chave === "h-6");

  assert.equal(barra?.total, 4000);
  assert.equal(barra?.fatias[0].chave, "sem_rede");
});

test("a métrica de interações usa as interações, não o alcance", () => {
  const pecas = [noTempo(2, 19, 10_000, "imagem", ["instagram"])];

  const porInteracao = barrasDoQuadro(pecas, {
    eixo: "horario",
    recorte: "formato",
    metrica: "interacoes",
  }).find((item) => item.chave === "h-6");

  assert.equal(porInteracao?.total, 500);
});

test("as fatias vêm da maior para a menor", () => {
  const pecas = [
    noTempo(2, 19, 1000, "imagem", ["instagram"]),
    noTempo(2, 20, 9000, "video", ["instagram"]),
  ];

  const barra = barrasDoQuadro(pecas, { eixo: "horario", recorte: "formato" })[6];

  assert.equal(barra.fatias[0].chave, "video");
});

test("as categorias saem dos dados, não de uma lista fixa", () => {
  const pecas = [
    noTempo(2, 19, 1000, "imagem", ["instagram", "facebook"]),
    noTempo(3, 10, 1000, "story", ["tiktok"]),
  ];

  assert.deepEqual(categoriasDoQuadro(pecas, "formato").sort(), ["imagem", "story"]);
  assert.deepEqual(categoriasDoQuadro(pecas, "rede").sort(), ["facebook", "instagram", "tiktok"]);
});

test("clicar na barra devolve as peças dela, da maior para a menor", () => {
  const pecas = [
    noTempo(2, 19, 3000, "imagem", ["instagram"]),
    noTempo(4, 20, 8000, "video", ["instagram"]),
    noTempo(1, 10, 5000, "imagem", ["instagram"]),
  ];

  const daNoite = pecasDaBarra(pecas, "h-6");
  assert.equal(daNoite.length, 2);
  assert.equal(daNoite[0].alcance, 8000);

  const daQuinta = pecasDaBarra(pecas, "d-4");
  assert.equal(daQuinta.length, 1);
  assert.equal(daQuinta[0].alcance, 8000);
});

test("o rótulo da barra é lido por gente", () => {
  assert.equal(rotuloDaBarra("h-6"), "18h–21h");
  assert.equal(rotuloDaBarra("d-4"), "quinta-feira");
});

// --- A barra fina de hora cheia e o corte por rede ---------------------------

test("o eixo de hora tem as vinte e quatro horas, inclusive as sem publicação", () => {
  const barras = barrasDoQuadro([noTempo(2, 19, 5000, "imagem", ["instagram"])], {
    eixo: "hora",
    recorte: "formato",
  });

  assert.equal(barras.length, 24);
  assert.equal(barras[0].rotulo, "0h");
  assert.equal(barras[23].rotulo, "23h");
  // A grade completa é o ponto: as horas vazias precisam existir para o dia ser
  // lido como uma curva.
  assert.equal(barras[18].total, 0);
  assert.equal(barras[19].total, 5000);
});

test("a hora cheia separa o que o bloco de três horas juntava", () => {
  const pecas = [
    noTempo(2, 18, 1000, "imagem", ["instagram"]),
    noTempo(2, 20, 9000, "video", ["instagram"]),
  ];

  const emBloco = barrasDoQuadro(pecas, { eixo: "horario", recorte: "formato" })[6];
  assert.equal(emBloco.total, 10_000);

  const porHora = barrasDoQuadro(pecas, { eixo: "hora", recorte: "formato" });
  assert.equal(porHora[18].total, 1000);
  assert.equal(porHora[20].total, 9000);
  assert.equal(porHora[19].total, 0);
});

test("escolher uma rede recorta o número, nunca o aumenta", () => {
  // Uma peça em duas redes: metade do alcance é de cada uma.
  const pecas = [noTempo(2, 19, 8000, "imagem", ["instagram", "facebook"])];

  const tudo = barrasDoQuadro(pecas, { eixo: "hora", recorte: "rede" })[19];
  assert.equal(tudo.total, 8000);

  const soInstagram = barrasDoQuadro(pecas, {
    eixo: "hora",
    recorte: "rede",
    rede: "instagram",
  })[19];
  assert.equal(soInstagram.total, 4000);
  assert.equal(soInstagram.fatias.length, 1);
  assert.equal(soInstagram.fatias[0].chave, "instagram");
});

test("a rede escolhida esconde as peças que não saíram nela", () => {
  const pecas = [
    noTempo(2, 19, 5000, "imagem", ["instagram"]),
    noTempo(2, 19, 3000, "video", ["tiktok"]),
  ];

  const soTiktok = barrasDoQuadro(pecas, {
    eixo: "hora",
    recorte: "formato",
    rede: "tiktok",
  })[19];

  assert.equal(soTiktok.pecas, 1);
  assert.equal(soTiktok.total, 3000);
  assert.equal(soTiktok.fatias[0].chave, "video");
});

test("o seletor de rede só oferece as redes que têm peça", () => {
  const pecas = [
    noTempo(2, 19, 5000, "imagem", ["instagram"]),
    noTempo(3, 10, 3000, "video", ["instagram", "facebook"]),
  ];

  assert.deepEqual(redesPresentes(pecas).sort(), ["facebook", "instagram"]);
});

test("o rótulo da hora cheia diz a hora inteira, não um instante", () => {
  // "19h" sozinho se lê como "às sete da noite em ponto"; a barra é a hora toda.
  assert.equal(rotuloDaBarra("c-19"), "19h às 19h59");
  assert.equal(rotuloDaBarra("c-0"), "00h às 00h59");
});

test("clicar numa hora devolve só as peças daquela hora", () => {
  const pecas = [
    noTempo(2, 19, 5000, "imagem", ["instagram"]),
    noTempo(4, 19, 8000, "video", ["instagram"]),
    noTempo(4, 20, 1000, "imagem", ["instagram"]),
  ];

  const das19 = pecasDaBarra(pecas, "c-19");
  assert.equal(das19.length, 2);
  assert.equal(das19[0].alcance, 8000);
});

test("o detalhe da hora compara com a média e diz em que dias ela rendeu", () => {
  const pecas = [
    noTempo(2, 19, 6000, "imagem", ["instagram"]),
    noTempo(4, 19, 6000, "video", ["instagram"]),
    noTempo(1, 9, 2000, "imagem", ["instagram"]),
    noTempo(3, 9, 2000, "imagem", ["instagram"]),
  ];

  const detalhe = detalharFaixa(pecas, "c-19");

  assert.equal(detalhe.rotulo, "19h às 19h59");
  assert.equal(detalhe.pecas.length, 2);
  assert.equal(detalhe.alcance, 12_000);
  assert.equal(detalhe.alcanceMedio, 6000);
  // Média geral 4.000; a faixa está 50% acima.
  assert.equal(Math.round(detalhe.contraMedia), 50);
  assert.equal(detalhe.confiavel, true);
  assert.deepEqual(
    detalhe.dias.map((item) => item.rotulo),
    ["terça-feira", "quinta-feira"],
  );
  assert.equal(detalhe.formatos.length, 2);
});

test("uma peça só na faixa descreve, mas não conclui", () => {
  const pecas = [
    noTempo(2, 19, 9000, "imagem", ["instagram"]),
    noTempo(1, 9, 1000, "imagem", ["instagram"]),
  ];

  const detalhe = detalharFaixa(pecas, "c-19");

  assert.equal(detalhe.pecas.length, 1);
  assert.equal(detalhe.alcance, 9000);
  // O número aparece — o que não pode é a tela chamar isso de padrão.
  assert.equal(detalhe.confiavel, false);
});

test("faixa sem peça nenhuma não inventa comparação", () => {
  const detalhe = detalharFaixa([noTempo(2, 19, 9000, "imagem", ["instagram"])], "c-3");

  assert.equal(detalhe.pecas.length, 0);
  assert.equal(detalhe.alcance, 0);
  assert.equal(detalhe.contraMedia, 0);
  assert.equal(detalhe.confiavel, false);
  assert.deepEqual(detalhe.dias, []);
});
