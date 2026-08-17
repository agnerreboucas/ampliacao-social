import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SEM_ASSUNTO,
  assuntosDe,
  avaliarPecas,
  destaques,
  porAssunto,
  porDiaDaSemana,
  porFaixaDeHorario,
  porFormato,
} from "./conteudo.ts";
import type { InboxItem, Post } from "./types.ts";

function post(parcial: Partial<Post> = {}): Post {
  return {
    id: `post-${Math.random().toString(36).slice(2, 9)}`,
    projectId: "proj-1",
    accountIds: ["acc-1"],
    format: "imagem",
    caption: "legenda comum",
    media: { count: 1, aspectRatio: "1:1", fileSizeMb: 1 },
    status: "publicado",
    scheduledFor: null,
    publishedAt: "2026-08-05T10:00:00",
    createdBy: "user-1",
    approvedBy: null,
    requiresApproval: false,
    metrics: { reach: 1000, impressions: 1200, likes: 40, comments: 5, shares: 3, saves: 2 },
    coverGradient: "",
    ...parcial,
  };
}

function metricas(reach: number, likes: number, comments: number): Post["metrics"] {
  return { reach, impressions: Math.round(reach * 1.2), likes, comments, shares: 0, saves: 0 };
}

function comAlcance(alcance: number, parcial: Partial<Post> = {}): Post {
  return post({ ...parcial, metrics: { ...post().metrics!, reach: alcance } });
}

// --- Assuntos ---------------------------------------------------------------

test("hashtag vira assunto", () => {
  assert.deepEqual(assuntosDe("Bom dia! #Mobilidade"), ["Mobilidade"]);
});

test("palavra-chave na legenda vira assunto", () => {
  // "Visita ao posto de saúde" é agenda e é saúde — as duas classificações
  // estão certas, e forçar uma só perderia informação.
  const assuntos = assuntosDe("Visita ao posto de saúde do bairro");
  assert.ok(assuntos.includes("Saúde"), assuntos.join(", "));
});

test("uma legenda pode ter mais de um assunto", () => {
  // Inauguração de posto de saúde é sobre as duas coisas, e forçar uma só
  // esconderia metade do que a peça fala.
  const assuntos = assuntosDe("Inauguramos o posto de saúde: mais um resultado entregue");
  assert.ok(assuntos.includes("Saúde"));
  assert.ok(assuntos.includes("Resultado"));
});

test("acento não muda o reconhecimento", () => {
  assert.deepEqual(assuntosDe("nova creche na educacao infantil"), ["Educação"]);
  assert.deepEqual(assuntosDe("nova creche na educação infantil"), ["Educação"]);
});

test("legenda sem assunto reconhecível não recebe assunto inventado", () => {
  assert.deepEqual(assuntosDe("Bom dia a todos"), []);
});

test("hashtag e palavra-chave do mesmo tema não viram dois assuntos", () => {
  // "#SAUDE" casa com a hashtag e com a palavra-chave "saude". Sem unificar,
  // o relatório mostraria "Saude" e "Saúde" lado a lado, com os números do
  // mesmo tema partidos ao meio.
  assert.deepEqual(assuntosDe("#SAUDE"), ["Saúde"]);
  assert.deepEqual(assuntosDe("#saude"), ["Saúde"]);
  assert.deepEqual(assuntosDe("#Saúde"), ["Saúde"]);
});

test("hashtag sem tema conhecido continua virando assunto próprio", () => {
  assert.deepEqual(assuntosDe("#NeonNaRua"), ["Neonnarua"]);
});

// --- Avaliação das peças ----------------------------------------------------

test("cada peça é comparada com a média do conjunto", () => {
  const pecas = avaliarPecas([comAlcance(2000), comAlcance(1000), comAlcance(1000)]);

  assert.equal(pecas.length, 3);
  // Média 1333; a de 2000 está 50% acima.
  assert.ok(Math.abs(pecas[0].contraMedia - 50) < 1, `deu ${pecas[0].contraMedia}`);
  assert.ok(pecas[2].contraMedia < 0);
});

test("as peças saem ordenadas do maior alcance para o menor", () => {
  const pecas = avaliarPecas([comAlcance(500), comAlcance(3000), comAlcance(1500)]);
  assert.deepEqual(
    pecas.map((peca) => peca.alcance),
    [3000, 1500, 500],
  );
});

test("rascunho e agendado ficam de fora da avaliação", () => {
  const pecas = avaliarPecas([
    post({ status: "rascunho" }),
    post({ status: "agendado" }),
    post({ status: "publicado" }),
  ]);
  assert.equal(pecas.length, 1);
});

test("os comentários da caixa são atribuídos à publicação certa", () => {
  // É a rastreabilidade: da interação até a peça que a gerou.
  const alvo = post({ id: "post-alvo" });
  const outro = post({ id: "post-outro" });
  const inbox = [
    { postId: "post-alvo" },
    { postId: "post-alvo" },
    { postId: "post-outro" },
    { postId: null },
  ] as InboxItem[];

  const pecas = avaliarPecas([alvo, outro], inbox);
  assert.equal(pecas.find((peca) => peca.post.id === "post-alvo")!.comentarios, 2);
  assert.equal(pecas.find((peca) => peca.post.id === "post-outro")!.comentarios, 1);
});

test("alcance zero não divide por zero na taxa", () => {
  const pecas = avaliarPecas([comAlcance(0)]);
  assert.equal(pecas[0].taxa, 0);
});

// --- Agrupamentos -----------------------------------------------------------

test("todo grupo declara quantas peças o sustentam", () => {
  // A regra central do módulo: média sem tamanho de amostra é média que engana.
  const pecas = avaliarPecas([
    comAlcance(5000, { format: "video" }),
    comAlcance(4000, { format: "video" }),
    comAlcance(1000, { format: "imagem" }),
  ]);

  for (const grupo of porFormato(pecas)) {
    assert.ok(grupo.pecas > 0, `${grupo.rotulo} sem contagem de peças`);
  }
  assert.equal(porFormato(pecas).find((g) => g.chave === "video")!.pecas, 2);
});

test("o formato de maior média vem primeiro, com o quanto acima da média", () => {
  const pecas = avaliarPecas([
    comAlcance(6000, { format: "video" }),
    comAlcance(1000, { format: "imagem" }),
    comAlcance(1000, { format: "imagem" }),
  ]);

  const grupos = porFormato(pecas);
  assert.equal(grupos[0].rotulo, "Vídeo");
  assert.ok(grupos[0].contraMedia > 0);
  assert.ok(grupos[1].contraMedia < 0);
});

test("uma peça com dois assuntos conta nos dois grupos", () => {
  const pecas = avaliarPecas([
    comAlcance(2000, { caption: "posto de saúde inaugurado, mais um resultado" }),
  ]);

  const grupos = porAssunto(pecas);
  assert.equal(grupos.find((g) => g.chave === "Saúde")!.pecas, 1);
  assert.equal(grupos.find((g) => g.chave === "Resultado")!.pecas, 1);
});

test("peça sem assunto vai para um grupo próprio, não para um balde inventado", () => {
  const pecas = avaliarPecas([comAlcance(1000, { caption: "bom dia" })]);
  assert.equal(porAssunto(pecas)[0].chave, SEM_ASSUNTO);
});

test("os dias da semana saem em ordem de calendário, não de desempenho", () => {
  const pecas = avaliarPecas([
    comAlcance(1000, { publishedAt: "2026-08-07T10:00:00" }), // sexta
    comAlcance(5000, { publishedAt: "2026-08-03T10:00:00" }), // segunda
  ]);

  const dias = porDiaDaSemana(pecas);
  assert.deepEqual(
    dias.map((dia) => dia.rotulo),
    ["segunda", "sexta"],
  );
});

test("o horário é agrupado em faixas, não em vinte e quatro horas", () => {
  // O fuso vai explícito: a análise lê a hora no fuso da campanha, e um horário
  // sem fuso seria interpretado como hora da máquina que roda o teste — que é
  // UTC aqui e outra coisa na máquina de quem programa.
  const pecas = avaliarPecas([
    comAlcance(1000, { publishedAt: "2026-08-05T08:00:00-03:00" }),
    comAlcance(2000, { publishedAt: "2026-08-05T10:00:00-03:00" }),
    comAlcance(3000, { publishedAt: "2026-08-05T20:00:00-03:00" }),
  ]);

  const faixas = porFaixaDeHorario(pecas);
  assert.equal(faixas.length, 2, "duas faixas, não três horários");
  assert.equal(faixas.find((f) => f.chave === "manha")!.pecas, 2);
});

test("publicação sem data não entra nos agrupamentos por tempo", () => {
  const pecas = avaliarPecas([comAlcance(1000, { publishedAt: null, status: "publicado" })]);
  assert.equal(porDiaDaSemana(pecas).length, 0);
  assert.equal(porFaixaDeHorario(pecas).length, 0);
});

// --- Destaques --------------------------------------------------------------

test("grupo com poucas peças não vira destaque", () => {
  // Duas peças boas não provam nada; é o acaso com duas amostras.
  const pecas = avaliarPecas([
    comAlcance(9000, { format: "video" }),
    comAlcance(8000, { format: "video" }),
    comAlcance(500, { format: "imagem" }),
    comAlcance(500, { format: "imagem" }),
    comAlcance(500, { format: "imagem" }),
    comAlcance(500, { format: "imagem" }),
  ]);

  const { positivos } = destaques(pecas);
  assert.equal(
    positivos.some((grupo) => grupo.chave === "video"),
    false,
    "vídeo tem só duas peças",
  );
});

test("com amostra suficiente, o que rende e o que não rende aparecem", () => {
  const videos = Array.from({ length: 4 }, () => comAlcance(6000, { format: "video" }));
  const imagens = Array.from({ length: 4 }, () => comAlcance(800, { format: "imagem" }));

  const { positivos, negativos } = destaques(avaliarPecas([...videos, ...imagens]));

  assert.ok(positivos.some((grupo) => grupo.chave === "video"));
  assert.ok(negativos.some((grupo) => grupo.chave === "imagem"));
});

test("diferença pequena não vira destaque para nenhum lado", () => {
  const a = Array.from({ length: 4 }, () => comAlcance(1100, { format: "video" }));
  const b = Array.from({ length: 4 }, () => comAlcance(1000, { format: "imagem" }));

  const { positivos, negativos } = destaques(avaliarPecas([...a, ...b]));
  assert.deepEqual(positivos, []);
  assert.deepEqual(negativos, []);
});

test("sem publicações, nada é destacado", () => {
  const { positivos, negativos } = destaques(avaliarPecas([]));
  assert.deepEqual(positivos, []);
  assert.deepEqual(negativos, []);
});

test("'sem assunto' nunca vira destaque", () => {
  // Seria um conselho sem conteúdo: "poste mais coisas sem assunto".
  const pecas = avaliarPecas(
    Array.from({ length: 6 }, () => comAlcance(9000, { caption: "bom dia" })),
  );
  const { positivos } = destaques(pecas);
  assert.equal(
    positivos.some((grupo) => grupo.chave === SEM_ASSUNTO),
    false,
  );
});

// --- Story não é comparável com o feed ---------------------------------------

test("story recebe ressalva no agrupamento por formato", () => {
  const pecas = avaliarPecas([
    post({ id: "a", format: "story", metrics: metricas(1000, 0, 10) }),
    post({ id: "b", format: "story", metrics: metricas(900, 0, 8) }),
    post({ id: "c", format: "video", metrics: metricas(5000, 300, 40) }),
  ]);

  const formatos = porFormato(pecas);
  const story = formatos.find((grupo) => grupo.chave === "story")!;
  const video = formatos.find((grupo) => grupo.chave === "video")!;

  assert.ok(story.ressalva, "story precisa dizer por que não se compara");
  assert.equal(video.ressalva, undefined, "formato de feed não carrega ressalva");
});

test("story nunca vira destaque negativo", () => {
  // O alcance de story é limitado a quem abre stories; chamá-lo de pior formato
  // é concluir sobre uma comparação que a rede não permite fazer.
  const pecas = avaliarPecas([
    post({ id: "s1", format: "story", metrics: metricas(400, 0, 4) }),
    post({ id: "s2", format: "story", metrics: metricas(380, 0, 3) }),
    post({ id: "s3", format: "story", metrics: metricas(420, 0, 5) }),
    post({ id: "v1", format: "video", metrics: metricas(6000, 300, 40) }),
    post({ id: "v2", format: "video", metrics: metricas(6200, 320, 44) }),
    post({ id: "v3", format: "video", metrics: metricas(5800, 280, 38) }),
  ]);

  const { negativos } = destaques(pecas);
  assert.equal(
    negativos.some((grupo) => grupo.chave === "story"),
    false,
  );
});
