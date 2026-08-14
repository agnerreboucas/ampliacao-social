import assert from "node:assert/strict";
import { test } from "node:test";

import { adivinharTipo, lerDataDoIcs, lerIcs, planejarImportacao } from "./ics.ts";
import type { Evento } from "./types.ts";

const CABECALHO = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Google Inc//Google Calendar//EN";
const RODAPE = "END:VCALENDAR";

function arquivo(...blocos: string[]): string {
  return [CABECALHO, ...blocos, RODAPE].join("\n");
}

function bloco(campos: Record<string, string>): string {
  return [
    "BEGIN:VEVENT",
    ...Object.entries(campos).map(([nome, valor]) => `${nome}:${valor}`),
    "END:VEVENT",
  ].join("\n");
}

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    id: "ev-1",
    projectId: "proj-1",
    titulo: "Caminhada na feira",
    descricao: null,
    tipo: "agenda",
    comecaEm: "2026-08-15T12:00:00.000Z",
    terminaEm: null,
    diaInteiro: false,
    local: "Vila Nova",
    municipioCodigo: null,
    responsavel: null,
    postIds: [],
    origem: "importado",
    uidExterno: "uid-1",
    criadoPor: "user-1",
    criadoEm: "2026-08-01T10:00:00.000Z",
    ...parcial,
  };
}

// --- Datas ------------------------------------------------------------------

test("data sem hora é evento de dia inteiro", () => {
  const lido = lerDataDoIcs("20260815");
  assert.equal(lido?.diaInteiro, true);
  assert.equal(new Date(lido!.iso).getDate(), 15);
});

test("data com hora local fica na hora escrita", () => {
  const lido = lerDataDoIcs("20260815T090000");
  assert.equal(lido?.diaInteiro, false);
  assert.equal(new Date(lido!.iso).getHours(), 9);
});

test("data em UTC é convertida, e só ela", () => {
  // O "Z" é o único caso em que há conversão de fuso.
  const zulu = lerDataDoIcs("20260815T120000Z");
  assert.equal(new Date(zulu!.iso).toISOString(), "2026-08-15T12:00:00.000Z");
});

test("data ilegível não vira data inventada", () => {
  assert.equal(lerDataDoIcs("amanhã"), null);
  assert.equal(lerDataDoIcs(""), null);
});

// --- Leitura ----------------------------------------------------------------

test("lê um evento simples", () => {
  const { eventos } = lerIcs(
    arquivo(
      bloco({
        UID: "abc-123",
        SUMMARY: "Caminhada na feira",
        LOCATION: "Feira da Vila Nova",
        DTSTART: "20260815T090000",
        DTEND: "20260815T110000",
      }),
    ),
  );

  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].uid, "abc-123");
  assert.equal(eventos[0].titulo, "Caminhada na feira");
  assert.equal(eventos[0].local, "Feira da Vila Nova");
});

test("linha quebrada em 75 caracteres é remontada", () => {
  // Sem isto, um título longo chega pela metade.
  const texto = arquivo(
    [
      "BEGIN:VEVENT",
      "UID:abc",
      "SUMMARY:Reunião com as mães da creche do ",
      " Jardim União",
      "DTSTART:20260815T090000",
      "END:VEVENT",
    ].join("\n"),
  );

  assert.equal(lerIcs(texto).eventos[0].titulo, "Reunião com as mães da creche do Jardim União");
});

test("as sequências de escape voltam a ser texto", () => {
  const { eventos } = lerIcs(
    arquivo(
      bloco({
        UID: "abc",
        SUMMARY: "Encontro\\, com apoiadores",
        DESCRIPTION: "Primeira parte\\nSegunda parte",
        DTSTART: "20260815T090000",
      }),
    ),
  );

  assert.equal(eventos[0].titulo, "Encontro, com apoiadores");
  assert.equal(eventos[0].descricao, "Primeira parte\nSegunda parte");
});

test("parâmetro depois do ponto e vírgula não muda o nome do campo", () => {
  const texto = arquivo(
    [
      "BEGIN:VEVENT",
      "UID:abc",
      "SUMMARY:Feriado",
      "DTSTART;VALUE=DATE:20260907",
      "END:VEVENT",
    ].join("\n"),
  );

  const { eventos } = lerIcs(texto);
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].diaInteiro, true);
});

test("evento de dia inteiro não ocupa o dia seguinte", () => {
  // O formato marca o fim no dia seguinte, exclusivo.
  const texto = arquivo(
    [
      "BEGIN:VEVENT",
      "UID:abc",
      "SUMMARY:Feriado",
      "DTSTART;VALUE=DATE:20260907",
      "DTEND;VALUE=DATE:20260908",
      "END:VEVENT",
    ].join("\n"),
  );

  const { eventos } = lerIcs(texto);
  assert.equal(new Date(eventos[0].terminaEm!).getDate(), 7);
});

test("bloco sem identificador é recusado, com o motivo", () => {
  const { eventos, ignorados } = lerIcs(
    arquivo(bloco({ SUMMARY: "Sem UID", DTSTART: "20260815T090000" })),
  );

  assert.equal(eventos.length, 0);
  assert.equal(ignorados.length, 1);
  assert.match(ignorados[0].motivo, /identificador/);
});

test("bloco sem data legível é recusado em vez de entrar torto", () => {
  const { eventos, ignorados } = lerIcs(
    arquivo(bloco({ UID: "abc", SUMMARY: "Quando?", DTSTART: "qualquer coisa" })),
  );

  assert.equal(eventos.length, 0);
  assert.match(ignorados[0].motivo, /data/);
});

test("evento que se repete é marcado", () => {
  const { eventos } = lerIcs(
    arquivo(
      bloco({
        UID: "abc",
        SUMMARY: "Reunião semanal",
        DTSTART: "20260815T090000",
        RRULE: "FREQ=WEEKLY;COUNT=10",
      }),
    ),
  );

  assert.equal(eventos[0].temRepeticao, true);
});

test("arquivo de outro programa, com CRLF, é lido igual", () => {
  const texto = arquivo(
    bloco({ UID: "abc", SUMMARY: "Teste", DTSTART: "20260815T090000" }),
  ).replace(/\n/g, "\r\n");

  assert.equal(lerIcs(texto).eventos.length, 1);
});

test("arquivo vazio não quebra", () => {
  assert.deepEqual(lerIcs(""), { eventos: [], ignorados: [] });
});

// --- Tipo -------------------------------------------------------------------

test("o tipo é adivinhado pelo título", () => {
  assert.equal(adivinharTipo("Gravação do vídeo de saúde"), "gravacao");
  assert.equal(adivinharTipo("Prazo de entrega do material"), "prazo");
  assert.equal(adivinharTipo("Reunião de planejamento"), "interno");
  assert.equal(adivinharTipo("Caminhada na feira"), "agenda");
});

// --- Plano de importação ----------------------------------------------------

test("evento novo entra como novo", () => {
  const leitura = lerIcs(
    arquivo(bloco({ UID: "uid-9", SUMMARY: "Novo", DTSTART: "20260815T090000" })),
  );
  const plano = planejarImportacao(leitura, [], { projectId: "proj-1", criadoPor: "user-1" });

  assert.equal(plano.novos.length, 1);
  assert.equal(plano.novos[0].origem, "importado");
  assert.equal(plano.novos[0].uidExterno, "uid-9");
});

test("reimportar o mesmo arquivo não duplica", () => {
  // É o motivo de o UID existir: agenda importada por cima de agenda é o tipo
  // de operação que ninguém quer descobrir depois.
  const leitura = lerIcs(
    arquivo(
      bloco({
        UID: "uid-1",
        SUMMARY: "Caminhada na feira",
        LOCATION: "Vila Nova",
        DTSTART: "20260815T120000Z",
      }),
    ),
  );
  const plano = planejarImportacao(leitura, [evento()], {
    projectId: "proj-1",
    criadoPor: "user-1",
  });

  assert.equal(plano.novos.length, 0);
  assert.equal(plano.atualizados.length, 0);
  assert.equal(plano.iguais, 1);
});

test("evento que mudou de horário é atualizado, e diz o que mudou", () => {
  const leitura = lerIcs(
    arquivo(
      bloco({
        UID: "uid-1",
        SUMMARY: "Caminhada na feira",
        LOCATION: "Vila Nova",
        DTSTART: "20260815T150000Z",
      }),
    ),
  );
  const plano = planejarImportacao(leitura, [evento()], {
    projectId: "proj-1",
    criadoPor: "user-1",
  });

  assert.equal(plano.atualizados.length, 1);
  assert.deepEqual(plano.atualizados[0].mudou, ["horário"]);
});

test("a atualização preserva o que é da plataforma", () => {
  // Município, responsável e peças vinculadas foram preenchidos aqui dentro; o
  // arquivo do Google não sabe deles e não pode apagá-los.
  const existente = evento({
    municipioCodigo: "3550308",
    responsavel: "user-2",
    postIds: ["post-1"],
  });
  const leitura = lerIcs(
    arquivo(bloco({ UID: "uid-1", SUMMARY: "Caminhada renomeada", DTSTART: "20260815T120000Z" })),
  );
  const plano = planejarImportacao(leitura, [existente], {
    projectId: "proj-1",
    criadoPor: "user-1",
  });

  const atualizado = plano.atualizados[0].evento;
  assert.equal(atualizado.municipioCodigo, "3550308");
  assert.equal(atualizado.responsavel, "user-2");
  assert.deepEqual(atualizado.postIds, ["post-1"]);
});

test("evento criado à mão não é tocado pela importação", () => {
  const manual = evento({ id: "ev-manual", origem: "manual", uidExterno: undefined });
  const leitura = lerIcs(
    arquivo(bloco({ UID: "uid-outro", SUMMARY: "Do Google", DTSTART: "20260815T090000" })),
  );
  const plano = planejarImportacao(leitura, [manual], {
    projectId: "proj-1",
    criadoPor: "user-1",
  });

  assert.equal(plano.novos.length, 1);
  assert.equal(plano.atualizados.length, 0);
});

test("o plano conta quantos eventos se repetem", () => {
  const leitura = lerIcs(
    arquivo(
      bloco({
        UID: "uid-r",
        SUMMARY: "Reunião semanal",
        DTSTART: "20260815T090000",
        RRULE: "FREQ=WEEKLY",
      }),
    ),
  );
  const plano = planejarImportacao(leitura, [], { projectId: "proj-1", criadoPor: "user-1" });

  assert.equal(plano.comRepeticao, 1);
});

// --- Fuso declarado no parâmetro --------------------------------------------

test("hora com TZID é lida no fuso declarado, não no do servidor", () => {
  // A exportação real da agenda de uma campanha em São Paulo traz dezenas de
  // eventos assim. Lê-los como hora do servidor coloca todos três horas fora
  // do lugar numa máquina em UTC — que é onde a plataforma vai rodar.
  const texto = arquivo(
    [
      "BEGIN:VEVENT",
      "UID:tz-1",
      "SUMMARY:Gravação às 19h",
      "DTSTART;TZID=America/Sao_Paulo:20240903T190000",
      "DTEND;TZID=America/Sao_Paulo:20240903T200000",
      "END:VEVENT",
    ].join("\n"),
  );

  const { eventos } = lerIcs(texto);
  // São Paulo está três horas atrás de Greenwich: 19h lá são 22h em UTC.
  assert.equal(eventos[0].comecaEm, "2024-09-03T22:00:00.000Z");
  assert.equal(eventos[0].terminaEm, "2024-09-03T23:00:00.000Z");
});

test("fuso desconhecido não derruba o evento", () => {
  const texto = arquivo(
    [
      "BEGIN:VEVENT",
      "UID:tz-2",
      "SUMMARY:Fuso inventado",
      "DTSTART;TZID=Marte/Olympus:20240903T190000",
      "END:VEVENT",
    ].join("\n"),
  );

  const { eventos, ignorados } = lerIcs(texto);
  assert.equal(eventos.length, 1);
  assert.equal(ignorados.length, 0);
});

test("o parâmetro do fuso não vira campo do evento", () => {
  // O nome do campo é "DTSTART", com ou sem parâmetro depois do ponto e vírgula.
  const texto = arquivo(
    [
      "BEGIN:VEVENT",
      "UID:tz-3",
      "SUMMARY:Teste",
      "DTSTART;TZID=UTC:20240903T190000",
      "END:VEVENT",
    ].join("\n"),
  );

  assert.equal(lerIcs(texto).eventos[0].comecaEm, "2024-09-03T19:00:00.000Z");
});
