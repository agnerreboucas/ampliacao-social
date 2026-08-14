import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { paraSnapshot } from "../snapshot.ts";
import type { EstadoPersistivel } from "../snapshot.ts";
import type { AudienceInsight, DailyMetric, InboxItem, Post } from "../types.ts";

/**
 * Testes de integração contra um Postgres de verdade.
 *
 * Rodam só quando `DATABASE_URL_TESTE` aponta para um banco descartável — o
 * teste **apaga todas as tabelas** antes de cada caso. Sem a variável, o
 * conjunto é pulado, e é por isso que `npm test` continua funcionando em uma
 * máquina sem banco nenhum.
 *
 * O que estes testes cobrem é justamente o que teste unitário não alcança: se o
 * SQL é válido, se os tipos voltam como o domínio espera e se a data não anda
 * um dia para trás no caminho de ida e volta.
 */

const URL_TESTE = process.env.DATABASE_URL_TESTE;

const conta = {
  id: "acc-ig",
  projectId: "proj-1",
  networkId: "instagram" as const,
  handle: "@teste",
  displayName: "Conta de Teste",
  status: "ativa" as const,
  origem: "demonstracao" as const,
  adAccountConnected: true,
  trackingSince: "2026-01-01",
  tokenExpiresAt: "2026-12-31",
  lastSyncAt: "2026-08-08T17:39:00.000Z",
  messagingApproved: true,
  avatarGradient: "grad-1",
};

function metrica(date: string, patch: Partial<DailyMetric> = {}): DailyMetric {
  return {
    date,
    followers: 1000,
    followersGained: 10,
    followersLost: 2,
    organicReach: 500,
    paidReach: 120,
    organicImpressions: 620,
    paidImpressions: 200,
    organicEngagement: 40,
    paidEngagement: 9,
    adSpend: 42.5,
    ...patch,
  };
}

const publico: AudienceInsight = {
  available: true,
  newFollowers: 30,
  unfollows: 4,
  topInteractors: [{ handle: "@a", name: "A", interactions: 9, avatarGradient: "g" }],
  activityByHour: [{ hour: 9, activity: 12 }],
  topCities: [{ city: "São Paulo", share: 0.4 }],
  demografia: [],
};

const post: Post = {
  id: "post-1",
  projectId: "proj-1",
  republicadoDe: "post-0",
  accountIds: ["acc-ig"],
  format: "carrossel",
  caption: 'Legenda com acento e aspas "duplas"',
  media: { count: 3, aspectRatio: "4:5", fileSizeMb: 2.5 },
  status: "publicado",
  scheduledFor: null,
  publishedAt: "2026-08-05T12:00:00.000Z",
  createdBy: "user-ana",
  approvedBy: "user-bruno",
  requiresApproval: true,
  metrics: { reach: 5000, impressions: 7300, likes: 240, comments: 31, shares: 12, saves: 44 },
  coverGradient: "grad-capa",
};

const interacao: InboxItem = {
  id: "inbox-1",
  accountId: "acc-ig",
  kind: "comentario",
  authorHandle: "@marina",
  authorName: "Marina Costa",
  avatarGradient: "grad-2",
  text: "Adorei!",
  postId: "post-1",
  receivedAt: "2026-08-08T15:00:00.000Z",
  status: "respondido",
  assignedTo: "user-diego",
  replies: [
    { id: "reply-1", author: "Diego", text: "Obrigado!", sentAt: "2026-08-08T15:10:00.000Z" },
    { id: "reply-2", author: "Ana", text: "Volte sempre", sentAt: "2026-08-08T15:20:00.000Z" },
  ],
  relacao: "defensor",
  interacoes: 24,
};

function estadoDeExemplo(): EstadoPersistivel {
  return {
    projects: [{ id: "proj-1", name: "Projeto", client: "Cliente" }],
    users: [
      {
        id: "user-ana",
        name: "Ana Ribeiro",
        email: "ana@ampliacao.com.br",
        role: "administrador",
        projectIds: ["proj-1"],
        lastActiveAt: "2026-08-08T12:00:00.000Z",
        avatarGradient: "grad-u",
      },
    ],
    accounts: [conta],
    metrics: new Map([
      ["acc-ig", [metrica("2026-08-06"), metrica("2026-08-07"), metrica("2026-08-08")]],
    ]),
    audience: new Map([["acc-ig", publico]]),
    posts: [post],
    boosts: [
      {
        id: "boost-1",
        postId: "post-1",
        accountId: "acc-ig",
        objective: "alcance",
        budgetTotal: 250.75,
        durationDays: 7,
        startedAt: "2026-08-01",
        endsAt: "2026-08-08",
        status: "ativo",
        audience: { locations: ["São Paulo"], ageMin: 18, ageMax: 45, interests: ["mercado"] },
        results: { spend: 180.4, reach: 22000, impressions: 41000, engagement: 900, clicks: 320 },
      },
    ],
    inbox: [interacao],
    eventos: [],
    reports: [
      {
        id: "rep-1",
        projectId: "proj-1",
        accountIds: ["acc-ig"],
        title: "Relatório de agosto",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-08",
        createdAt: "2026-08-08T18:00:00.000Z",
        createdBy: "user-ana",
        shareToken: "tok123",
        shareEnabled: true,
      },
    ],
    atualizacoes: [
      {
        id: "at-1",
        accountId: "acc-ig",
        date: "2026-08-08",
        registradaEm: "2026-08-08T09:12:00.000Z",
        autor: "Ana Ribeiro",
        valores: {
          followers: 1000,
          organicReach: 500,
          paidReach: 120,
          organicImpressions: 620,
          paidImpressions: 200,
          organicEngagement: 40,
          paidEngagement: 9,
          adSpend: 42.5,
        },
      },
    ],
  };
}

describe(
  "persistência em Postgres",
  { skip: URL_TESTE ? false : "DATABASE_URL_TESTE não definida" },
  () => {
    let carregarDoBanco: typeof import("./postgres.server.ts").carregarDoBanco;
    let gravarNoBanco: typeof import("./postgres.server.ts").gravarNoBanco;
    let garantirEsquema: typeof import("./postgres.server.ts").garantirEsquema;
    let encerrarPool: typeof import("./postgres.server.ts").encerrarPool;
    let obterPool: typeof import("./postgres.server.ts").obterPool;

    before(async () => {
      process.env.DATABASE_URL = URL_TESTE;
      const modulo = await import("./postgres.server.ts");
      carregarDoBanco = modulo.carregarDoBanco;
      gravarNoBanco = modulo.gravarNoBanco;
      garantirEsquema = modulo.garantirEsquema;
      encerrarPool = modulo.encerrarPool;
      obterPool = modulo.obterPool;
      await garantirEsquema();
    });

    after(async () => {
      await encerrarPool();
    });

    test("o esquema pode ser criado duas vezes sem erro", async () => {
      // A aplicação roda o DDL em toda subida; a segunda não pode explodir.
      await garantirEsquema();
      await garantirEsquema();
    });

    test("um banco de esquema antigo ganha as colunas novas na subida", async () => {
      // Simula o que existe em produção: um banco criado por uma versão anterior.
      // "create table if not exists" sozinho deixaria a coluna faltando, e a
      // leitura do estado quebraria — que foi exatamente o que aconteceu antes de
      // o DDL ganhar os "add column if not exists".
      const pool = obterPool();
      await pool.query("alter table contas drop column if exists ordem");

      await garantirEsquema();

      const { rows } = await pool.query(
        "select column_name from information_schema.columns where table_name = 'contas' and column_name = 'ordem'",
      );
      assert.equal(rows.length, 1);
    });

    test("banco vazio devolve null, para a semente assumir", async () => {
      const pool = obterPool();
      await pool.query("delete from contas");
      assert.equal(await carregarDoBanco(), null);
    });

    test("ida e volta preserva o estado inteiro", async () => {
      const original = estadoDeExemplo();
      await gravarNoBanco(original);
      const volta = await carregarDoBanco();

      assert.ok(volta, "o estado deveria ter voltado");
      // Comparar pelo snapshot normaliza a ordem dos Map e ignora diferenças de
      // referência — é a mesma forma que a aplicação usa para exportar.
      assert.deepEqual(paraSnapshot(volta, new Date(0)), paraSnapshot(original, new Date(0)));
    });

    test("a data não escorrega um dia na ida e volta", async () => {
      await gravarNoBanco(estadoDeExemplo());
      const volta = await carregarDoBanco();
      const dias = volta!.metrics.get("acc-ig")!;

      assert.deepEqual(
        dias.map((d) => d.date),
        ["2026-08-06", "2026-08-07", "2026-08-08"],
      );
      assert.equal(volta!.accounts[0].trackingSince, "2026-01-01");
      assert.equal(volta!.accounts[0].tokenExpiresAt, "2026-12-31");
      assert.equal(volta!.reports[0].periodStart, "2026-08-01");
      assert.equal(volta!.atualizacoes[0].date, "2026-08-08");
    });

    test("valores em reais voltam como número, não como texto", async () => {
      await gravarNoBanco(estadoDeExemplo());
      const volta = await carregarDoBanco();

      const dia = volta!.metrics.get("acc-ig")![0];
      assert.equal(typeof dia.adSpend, "number");
      assert.equal(dia.adSpend, 42.5);
      assert.equal(volta!.boosts[0].budgetTotal, 250.75);
      assert.equal(volta!.boosts[0].results.spend, 180.4);
    });

    test("instantes voltam em ISO, com o mesmo momento", async () => {
      await gravarNoBanco(estadoDeExemplo());
      const volta = await carregarDoBanco();

      assert.equal(volta!.inbox[0].receivedAt, "2026-08-08T15:00:00.000Z");
      assert.equal(volta!.posts[0].publishedAt, "2026-08-05T12:00:00.000Z");
      assert.equal(volta!.accounts[0].lastSyncAt, "2026-08-08T17:39:00.000Z");
      assert.equal(volta!.atualizacoes[0].registradaEm, "2026-08-08T09:12:00.000Z");
    });

    test("as respostas de uma interação voltam na ordem em que foram enviadas", async () => {
      await gravarNoBanco(estadoDeExemplo());
      const volta = await carregarDoBanco();

      assert.deepEqual(
        volta!.inbox[0].replies.map((r) => r.id),
        ["reply-1", "reply-2"],
      );
    });

    test("gravar de novo substitui, em vez de duplicar", async () => {
      await gravarNoBanco(estadoDeExemplo());
      await gravarNoBanco(estadoDeExemplo());
      const volta = await carregarDoBanco();

      assert.equal(volta!.accounts.length, 1);
      assert.equal(volta!.posts.length, 1);
      assert.equal(volta!.inbox.length, 1);
      assert.equal(volta!.inbox[0].replies.length, 2);
      assert.equal(volta!.metrics.get("acc-ig")!.length, 3);
      assert.equal(volta!.atualizacoes.length, 1);
    });

    test("o mesmo dia repetido na série não quebra a chave primária", async () => {
      const estado = estadoDeExemplo();
      // A leitura mais recente do dia é a que vale — mesma regra da tela.
      estado.metrics.set("acc-ig", [
        metrica("2026-08-08", { followers: 1000 }),
        metrica("2026-08-08", { followers: 1075 }),
      ]);

      await gravarNoBanco(estado);
      const volta = await carregarDoBanco();
      const dias = volta!.metrics.get("acc-ig")!;

      assert.equal(dias.length, 1);
      assert.equal(dias[0].followers, 1075);
    });

    test("uma escrita que falha no meio não deixa o banco pela metade", async () => {
      await gravarNoBanco(estadoDeExemplo());

      const quebrado = estadoDeExemplo();
      // Publicação apontando para uma conta que não existe: a chave estrangeira
      // de publicacao_contas não é declarada, mas a de metricas_diarias é — então
      // uma métrica órfã derruba a transação inteira.
      quebrado.metrics.set("conta-que-nao-existe", [metrica("2026-08-08")]);

      await assert.rejects(() => gravarNoBanco(quebrado));

      // O estado anterior tem de continuar inteiro.
      const volta = await carregarDoBanco();
      assert.ok(volta);
      assert.equal(volta.accounts.length, 1);
      assert.equal(volta.metrics.get("acc-ig")!.length, 3);
    });

    test("a ordem das listas sobrevive à ida e volta", async () => {
      // Migrar do arquivo para o banco não pode reordenar as telas do cliente:
      // a ordem das contas é a ordem em que a agência as organizou.
      const estado = estadoDeExemplo();
      estado.accounts = [
        { ...conta, id: "zzz-ultima", handle: "@zzz" },
        { ...conta, id: "aaa-primeira", handle: "@aaa" },
        { ...conta, id: "mmm-meio", handle: "@mmm" },
      ];
      estado.metrics = new Map([["zzz-ultima", [metrica("2026-08-08")]]]);
      estado.audience = new Map([["zzz-ultima", publico]]);
      estado.posts = [];
      estado.boosts = [];
      estado.inbox = [];
      estado.reports = [];
      estado.atualizacoes = [];

      await gravarNoBanco(estado);
      const volta = await carregarDoBanco();

      assert.deepEqual(
        volta!.accounts.map((c) => c.id),
        ["zzz-ultima", "aaa-primeira", "mmm-meio"],
      );
    });

    test("um volume realista de dias é gravado e lido", async () => {
      const estado = estadoDeExemplo();
      const dias: DailyMetric[] = [];
      const inicio = new Date("2024-01-01T00:00:00Z");
      for (let i = 0; i < 5000; i += 1) {
        const data = new Date(inicio.getTime() + i * 86400000).toISOString().slice(0, 10);
        dias.push(metrica(data, { followers: 1000 + i }));
      }
      estado.metrics.set("acc-ig", dias);

      await gravarNoBanco(estado);
      const volta = await carregarDoBanco();

      assert.equal(volta!.metrics.get("acc-ig")!.length, 5000);
      assert.equal(volta!.metrics.get("acc-ig")![4999].followers, 5999);
    });
  },
);
