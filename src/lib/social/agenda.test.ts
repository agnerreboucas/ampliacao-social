import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chaveDoDia,
  esperandoAprovacao,
  eventosSemPauta,
  gradeDoMes,
  horaDoItem,
  itensDoDia,
  marcaDaPeca,
  montarQuadro,
  motivoParaNaoAvancar,
  pautaDoEvento,
  pautasDoEvento,
  podeMoverPara,
  resumirDia,
  semanaDe,
  tituloDoDia,
} from "./agenda.ts";
import type { Evento, InboxItem, Post, PostStatus } from "./types.ts";

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 8)}`,
    projectId: "proj-1",
    titulo: "Caminhada na feira",
    descricao: null,
    tipo: "agenda",
    comecaEm: "2026-08-15T09:00:00",
    terminaEm: null,
    diaInteiro: false,
    local: "Feira da Vila Nova",
    municipioCodigo: null,
    responsavel: null,
    postIds: [],
    origem: "manual",
    criadoPor: "user-1",
    criadoEm: "2026-08-01T10:00:00",
    ...parcial,
  };
}

function post(parcial: Partial<Post> = {}): Post {
  return {
    id: `post-${Math.random().toString(36).slice(2, 8)}`,
    projectId: "proj-1",
    accountIds: ["acc-1"],
    format: "imagem",
    caption: "legenda",
    media: { count: 1, aspectRatio: "4:5", fileSizeMb: 2 },
    status: "rascunho",
    scheduledFor: null,
    publishedAt: null,
    createdBy: "user-1",
    approvedBy: null,
    requiresApproval: true,
    metrics: null,
    coverGradient: "",
    ...parcial,
  };
}

function interacao(status: InboxItem["status"]): InboxItem {
  return {
    id: `i-${Math.random().toString(36).slice(2, 8)}`,
    accountId: "acc-1",
    kind: "comentario",
    authorHandle: "@alguem",
    authorName: "Alguém",
    avatarGradient: "",
    text: "oi",
    postId: null,
    receivedAt: "2026-08-15T10:00:00",
    status,
    assignedTo: null,
    replies: [],
    relacao: "seguidor",
    interacoes: 1,
  };
}

// --- Dia --------------------------------------------------------------------

test("a chave do dia é local, não UTC", () => {
  // Um evento às 21h de 15 de agosto pertence ao dia 15 para quem está no
  // Brasil, mesmo que em UTC já seja dia 16.
  assert.equal(chaveDoDia(new Date(2026, 7, 15, 21, 0)), "2026-08-15");
  assert.equal(chaveDoDia(new Date(2026, 7, 5, 0, 30)), "2026-08-05");
});

test("o título do dia sai por extenso", () => {
  // 15 de agosto de 2026 é um sábado.
  assert.equal(tituloDoDia("2026-08-15"), "sábado, 15 de agosto");
});

// --- Distribuição -----------------------------------------------------------

test("o evento cai no dia em que começa", () => {
  const itens = itensDoDia("2026-08-15", [evento()], []);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].papel, "evento");
});

test("evento de vários dias aparece em cada um deles", () => {
  // Uma caravana de três dias precisa aparecer na quarta de quem olha a quarta.
  const caravana = evento({
    comecaEm: "2026-08-10T08:00:00",
    terminaEm: "2026-08-12T18:00:00",
  });

  for (const dia of ["2026-08-10", "2026-08-11", "2026-08-12"]) {
    assert.equal(itensDoDia(dia, [caravana], []).length, 1, `faltou no dia ${dia}`);
  }
  assert.equal(itensDoDia("2026-08-13", [caravana], []).length, 0);
});

test("a peça publicada entra pelo dia da publicação", () => {
  const peca = post({ status: "publicado", publishedAt: "2026-08-15T19:00:00" });
  const itens = itensDoDia("2026-08-15", [], [peca]);

  assert.equal(itens[0].papel, "publicado");
});

test("a peça agendada entra pelo dia marcado", () => {
  const peca = post({ status: "agendado", scheduledFor: "2026-08-16T12:00:00" });
  assert.equal(itensDoDia("2026-08-16", [], [peca])[0].papel, "agendado");
});

test("peça em produção sem data não entra em dia nenhum", () => {
  // Ela mora no quadro. Empurrá-la para hoje encheria o dia de hoje com
  // trabalho que não vence hoje.
  const peca = post({ status: "rascunho", scheduledFor: null });
  assert.equal(itensDoDia(chaveDoDia(new Date()), [], [peca]).length, 0);
});

test("o dia sai em ordem de hora", () => {
  const itens = itensDoDia(
    "2026-08-15",
    [evento({ comecaEm: "2026-08-15T14:00:00" })],
    [
      post({ status: "publicado", publishedAt: "2026-08-15T09:00:00" }),
      post({ status: "agendado", scheduledFor: "2026-08-15T20:00:00" }),
    ],
  );

  assert.deepEqual(itens.map(horaDoItem), ["09:00", "14:00", "20:00"]);
});

test("evento de dia inteiro não tem hora", () => {
  const itens = itensDoDia("2026-08-15", [evento({ diaInteiro: true })], []);
  assert.equal(horaDoItem(itens[0]), null);
});

// --- Quadro -----------------------------------------------------------------

test("o quadro tem todas as fases, inclusive as vazias", () => {
  // Coluna vazia é informação: é quando ninguém está produzindo nada.
  const quadro = montarQuadro([post({ status: "ideia" })]);

  assert.equal(quadro.length, 6);
  assert.deepEqual(
    quadro.map((coluna) => coluna.fase),
    ["ideia", "rascunho", "aguardando_aprovacao", "aprovado", "agendado", "publicado"],
  );
  assert.equal(quadro[0].posts.length, 1);
  assert.equal(quadro[1].posts.length, 0);
});

test("dentro da coluna, o que tem prazo mais perto vem antes", () => {
  const quadro = montarQuadro([
    post({ status: "rascunho", scheduledFor: "2026-08-20T10:00:00" }),
    post({ status: "rascunho", scheduledFor: "2026-08-16T10:00:00" }),
    post({ status: "rascunho", scheduledFor: null }),
  ]);

  const datas = quadro[1].posts.map((p) => p.scheduledFor);
  assert.deepEqual(datas, ["2026-08-16T10:00:00", "2026-08-20T10:00:00", null]);
});

test("a peça que falhou não aparece em coluna nenhuma", () => {
  // "Falhou" não é etapa do caminho, é acidente no fim dele: vira marcador na
  // peça, e não uma sétima coluna que ninguém sabe o que fazer com.
  const quadro = montarQuadro([post({ status: "falhou" }), post({ status: "ideia" })]);

  assert.equal(quadro.length, 6);
  assert.equal(
    quadro.reduce((total, coluna) => total + coluna.posts.length, 0),
    1,
  );
});

// --- Movimentos -------------------------------------------------------------

test("a peça anda pelas fases vizinhas", () => {
  assert.equal(podeMoverPara("ideia", "rascunho"), true);
  assert.equal(podeMoverPara("rascunho", "aguardando_aprovacao"), true);
  assert.equal(podeMoverPara("aguardando_aprovacao", "aprovado"), true);
  assert.equal(podeMoverPara("aprovado", "agendado"), true);
});

test("dá para voltar atrás enquanto não publicou", () => {
  assert.equal(podeMoverPara("aguardando_aprovacao", "rascunho"), true);
  assert.equal(podeMoverPara("agendado", "aprovado"), true);
});

test("publicado é fim de linha", () => {
  // Despublicar não é operação que a rede ofereça de volta; oferecer o botão
  // produziria um estado que a plataforma não consegue sustentar.
  for (const fase of ["ideia", "rascunho", "aprovado", "agendado"] as PostStatus[]) {
    assert.equal(podeMoverPara("publicado", fase), false);
  }
});

test("não dá para pular da ideia direto para publicado", () => {
  assert.equal(podeMoverPara("ideia", "publicado"), false);
  assert.equal(podeMoverPara("ideia", "aprovado"), false);
});

// --- Resumo do dia ----------------------------------------------------------

test("o resumo separa o que acontece, o que sai e o que trava", () => {
  const resumo = resumirDia(
    "2026-08-15",
    [evento()],
    [
      post({ status: "agendado", scheduledFor: "2026-08-15T18:00:00" }),
      post({ status: "publicado", publishedAt: "2026-08-15T08:00:00" }),
      post({ status: "aguardando_aprovacao" }),
      post({ status: "rascunho", scheduledFor: "2026-08-15T23:59:00" }),
    ],
    [interacao("pendente"), interacao("respondido")],
  );

  assert.equal(resumo.eventos.length, 1);
  assert.equal(resumo.publicaHoje.length, 1);
  assert.equal(resumo.publicadas.length, 1);
  assert.equal(resumo.esperandoAprovacao.length, 1);
  assert.equal(resumo.produzindo.length, 1);
  assert.equal(resumo.conversasPendentes, 1);
  assert.equal(resumo.vazio, false);
});

test("prazo vencido continua na produção de hoje", () => {
  // A peça esquecida ficaria esquecida se sumisse da lista no dia seguinte.
  const resumo = resumirDia(
    "2026-08-15",
    [],
    [post({ status: "rascunho", scheduledFor: "2026-08-10T10:00:00" })],
  );

  assert.equal(resumo.produzindo.length, 1);
});

test("prazo futuro não entra no dia de hoje", () => {
  const resumo = resumirDia(
    "2026-08-15",
    [],
    [post({ status: "rascunho", scheduledFor: "2026-08-20T10:00:00" })],
  );

  assert.equal(resumo.produzindo.length, 0);
});

test("dia sem nada se declara vazio", () => {
  const resumo = resumirDia("2026-08-15", [], []);
  assert.equal(resumo.vazio, true);
});

test("o dia do meio de um evento longo continua sendo dia de evento", () => {
  const resumo = resumirDia(
    "2026-08-11",
    [evento({ comecaEm: "2026-08-10T08:00:00", terminaEm: "2026-08-12T18:00:00" })],
    [],
  );

  assert.equal(resumo.eventos.length, 1);
});

// --- Grades -----------------------------------------------------------------

test("a grade do mês fecha semanas inteiras", () => {
  const grade = gradeDoMes(2026, 7); // agosto de 2026
  assert.equal(grade.length % 7, 0);
  assert.ok(grade.length === 35 || grade.length === 42, String(grade.length));
});

test("a grade começa num domingo e termina num sábado", () => {
  const grade = gradeDoMes(2026, 7);
  assert.equal(new Date(`${grade[0]}T12:00:00`).getDay(), 0);
  assert.equal(new Date(`${grade[grade.length - 1]}T12:00:00`).getDay(), 6);
});

test("a grade contém todos os dias do mês pedido", () => {
  const grade = gradeDoMes(2026, 7);
  assert.ok(grade.includes("2026-08-01"));
  assert.ok(grade.includes("2026-08-31"));
});

test("a semana vai de domingo a sábado", () => {
  const semana = semanaDe("2026-08-15"); // um sábado
  assert.equal(semana.length, 7);
  assert.equal(semana[0], "2026-08-09");
  assert.equal(semana[6], "2026-08-15");
});

// --- Da agenda para a pauta --------------------------------------------------

test("evento sem pauta é o que ainda vira conteúdo", () => {
  const caminhada = evento({ id: "ev-1" });
  const reuniao = evento({ id: "ev-2" });
  const jaVirou = post({ origemEventoId: "ev-1" });

  assert.deepEqual(
    eventosSemPauta([caminhada, reuniao], [jaVirou]).map((e) => e.id),
    ["ev-2"],
  );
});

test("reimportar a mesma agenda não gera a pauta de novo", () => {
  // O Google exporta o calendário inteiro toda vez. Sem esta checagem, a
  // segunda importação dobraria a coluna de ideias — e a terceira triplicaria.
  const eventos = [evento({ id: "ev-1" }), evento({ id: "ev-2" })];
  const pautas = eventos.map((e) => post({ origemEventoId: e.id, status: "ideia" }));

  assert.deepEqual(eventosSemPauta(eventos, pautas), []);
});

test("as pautas de um evento são só as dele", () => {
  const caminhada = evento({ id: "ev-1" });
  const minhas = [post({ origemEventoId: "ev-1" }), post({ origemEventoId: "ev-1" })];
  const alheia = post({ origemEventoId: "ev-9" });
  const solta = post();

  assert.equal(pautasDoEvento(caminhada, [...minhas, alheia, solta]).length, 2);
});

test("a pauta diz de que compromisso saiu", () => {
  // Sem data e lugar, "Caminhada" no meio de trinta pautas não diz qual.
  const texto = pautaDoEvento(
    evento({ titulo: "Caminhada na feira", comecaEm: "2026-08-15T09:30:00" }),
  );

  assert.match(texto, /Caminhada na feira/);
  assert.match(texto, /15\/08/);
  assert.match(texto, /09h30/);
  assert.match(texto, /Feira da Vila Nova/);
});

test("evento de dia inteiro não inventa horário", () => {
  const texto = pautaDoEvento(evento({ diaInteiro: true, comecaEm: "2026-08-15T00:00:00" }));

  assert.match(texto, /dia inteiro/);
  assert.doesNotMatch(texto, /00h00/);
});

test("pauta sem formato não avança para produção", () => {
  // O modo de falha: a peça chegaria agendada e a rede recusaria na hora de
  // publicar — que é o pior momento para descobrir que ninguém decidiu o
  // formato.
  const pauta = post({ format: "a_definir", status: "ideia" });

  assert.match(motivoParaNaoAvancar(pauta, "aprovado") ?? "", /Escolha o formato/);
  assert.match(motivoParaNaoAvancar(pauta, "agendado") ?? "", /Escolha o formato/);
  assert.match(motivoParaNaoAvancar(pauta, "publicado") ?? "", /Escolha o formato/);
});

test("pauta sem formato pode virar rascunho — é onde se decide", () => {
  const pauta = post({ format: "a_definir", status: "ideia" });

  assert.equal(motivoParaNaoAvancar(pauta, "rascunho"), null);
  assert.equal(motivoParaNaoAvancar(pauta, "ideia"), null);
});

test("com formato escolhido, nada trava", () => {
  assert.equal(motivoParaNaoAvancar(post({ format: "carrossel" }), "agendado"), null);
});

// --- As marcações do calendário ---------------------------------------------

test("a cor da peça diz o que exige ação, não a fase interna", () => {
  assert.equal(marcaDaPeca(post({ status: "aguardando_aprovacao" })), "aprovar");
  assert.equal(marcaDaPeca(post({ status: "aprovado" })), "aguardando");
  assert.equal(marcaDaPeca(post({ status: "agendado" })), "aguardando");
  assert.equal(marcaDaPeca(post({ status: "publicado" })), "publicada");
  assert.equal(marcaDaPeca(post({ status: "ideia" })), "rascunho");
  assert.equal(marcaDaPeca(post({ status: "rascunho" })), "rascunho");
});

test("agendado e aprovado compartilham a marca, porque exigem a mesma coisa", () => {
  // Nada — as duas estão resolvidas e esperando a hora. Separá-las em duas cores
  // gastaria atenção numa distinção que não muda o que alguém faz hoje.
  assert.equal(
    marcaDaPeca(post({ status: "aprovado" })),
    marcaDaPeca(post({ status: "agendado" })),
  );
});

test("a fila de aprovação vem pela data, da mais próxima para a mais distante", () => {
  // O que vence primeiro é o que trava primeiro; ordenar por criação faria a
  // peça de amanhã ficar embaixo da de semana que vem.
  const depois = post({ status: "aguardando_aprovacao", scheduledFor: "2026-08-25T10:00:00" });
  const antes = post({ status: "aguardando_aprovacao", scheduledFor: "2026-08-19T10:00:00" });
  const publicada = post({ status: "publicado" });

  const fila = esperandoAprovacao([depois, publicada, antes]);

  assert.equal(fila.length, 2);
  assert.equal(fila[0].id, antes.id);
});

test("peça sem data ainda entra na fila, mas no fim", () => {
  // Ela trava do mesmo jeito; o que não dá é fingir que tem prazo.
  const semData = post({ status: "aguardando_aprovacao", scheduledFor: null });
  const comData = post({ status: "aguardando_aprovacao", scheduledFor: "2026-08-19T10:00:00" });

  assert.deepEqual(
    esperandoAprovacao([semData, comData]).map((peca) => peca.id),
    [comData.id, semData.id],
  );
});
