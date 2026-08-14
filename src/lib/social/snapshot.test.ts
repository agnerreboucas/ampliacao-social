import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SnapshotInvalido,
  VERSAO_SNAPSHOT,
  desserializar,
  nomeDoArquivo,
  serializar,
} from "./snapshot.ts";
import type { EstadoPersistivel } from "./snapshot.ts";
import type { DailyMetric, SocialAccount } from "./types.ts";

const conta: SocialAccount = {
  id: "acc-ig",
  projectId: "proj-1",
  networkId: "instagram",
  handle: "@teste",
  displayName: "Teste",
  status: "ativa",
  origem: "demonstracao",
  adAccountConnected: false,
  trackingSince: "2026-01-01",
  tokenExpiresAt: null,
  lastSyncAt: null,
  messagingApproved: false,
  avatarGradient: "g",
};

const dia: DailyMetric = {
  date: "2026-08-07",
  followers: 1000,
  followersGained: 10,
  followersLost: 2,
  organicReach: 500,
  paidReach: 0,
  organicImpressions: 620,
  paidImpressions: 0,
  organicEngagement: 40,
  paidEngagement: 0,
  adSpend: 0,
};

const estado: EstadoPersistivel = {
  projects: [{ id: "proj-1", name: "Projeto", client: "Cliente" }],
  users: [],
  accounts: [conta],
  metrics: new Map([["acc-ig", [dia]]]),
  audience: new Map(),
  posts: [],
  boosts: [],
  inbox: [],
  eventos: [],
  reports: [],
  atualizacoes: [
    {
      id: "at-1",
      accountId: "acc-ig",
      date: "2026-08-07",
      registradaEm: "2026-08-07T09:00:00.000Z",
      autor: "Ana",
      valores: {
        followers: 1000,
        organicReach: 500,
        paidReach: 0,
        organicImpressions: 620,
        paidImpressions: 0,
        organicEngagement: 40,
        paidEngagement: 0,
        adSpend: 0,
      },
    },
  ],
};

test("ida e volta preserva o estado, inclusive os Map", () => {
  const volta = desserializar(serializar(estado));

  assert.deepEqual(volta.accounts, estado.accounts);
  assert.deepEqual(volta.metrics.get("acc-ig"), [dia]);
  assert.equal(volta.atualizacoes.length, 1);
  assert.equal(volta.atualizacoes[0].autor, "Ana");
  assert.ok(volta.metrics instanceof Map);
  assert.ok(volta.audience instanceof Map);
});

test("o arquivo sai indentado e com quebra final, para o diff do Git ficar legível", () => {
  const texto = serializar(estado);
  assert.ok(texto.includes('\n  "versao"'));
  assert.ok(texto.endsWith("\n"));
});

test("o snapshot carrega a versão do formato e quando foi gerado", () => {
  const dados = JSON.parse(serializar(estado, new Date("2026-08-08T12:00:00.000Z")));
  assert.equal(dados.versao, VERSAO_SNAPSHOT);
  assert.equal(dados.geradoEm, "2026-08-08T12:00:00.000Z");
});

test("um arquivo de versão futura é recusado em vez de lido pela metade", () => {
  const futuro = JSON.stringify({ ...JSON.parse(serializar(estado)), versao: VERSAO_SNAPSHOT + 1 });

  assert.throws(() => desserializar(futuro), SnapshotInvalido);
  assert.throws(() => desserializar(futuro), /Atualize a plataforma/);
});

test("texto que não é JSON dá erro explicado", () => {
  assert.throws(() => desserializar("isto não é json"), /não é um JSON válido/);
});

test("JSON válido sem cara de backup é recusado", () => {
  assert.throws(() => desserializar('{"qualquer":"coisa"}'), /não tem versão/);
  assert.throws(() => desserializar('{"versao":1}'), /faltam contas ou métricas/);
});

test("campos opcionais ausentes viram listas vazias, sem quebrar", () => {
  const minimo = JSON.stringify({ versao: 1, accounts: [conta], metrics: [] });
  const estadoLido = desserializar(minimo);

  assert.deepEqual(estadoLido.posts, []);
  assert.deepEqual(estadoLido.atualizacoes, []);
  assert.equal(estadoLido.metrics.size, 0);
});

test("o nome do arquivo carrega dia e hora, para não sobrescrever o anterior", () => {
  const nome = nomeDoArquivo(new Date(2026, 7, 8, 9, 5));
  assert.match(nome, /^plataforma-2026-08-08-0905\.json$/);
});
