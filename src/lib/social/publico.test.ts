import assert from "node:assert/strict";
import { test } from "node:test";

import { cidadesAlcancadas, normalizarCidade, perfilDoPublico } from "./publico.ts";
import type { AudienceInsight, Boost, InboxItem } from "./types.ts";

function boost(parcial: Partial<Boost> = {}): Boost {
  return {
    id: `boost-${Math.random().toString(36).slice(2, 8)}`,
    postId: "post-1",
    accountId: "acc-1",
    objective: "alcance",
    budgetTotal: 300,
    durationDays: 7,
    startedAt: "2026-08-01",
    endsAt: "2026-08-08",
    status: "ativo",
    audience: { locations: ["Recife"], ageMin: 18, ageMax: 65, interests: [] },
    results: { spend: 300, reach: 10_000, impressions: 20_000, engagement: 500, clicks: 100 },
    ...parcial,
  };
}

function perfil(cidades: { city: string; share: number }[]): AudienceInsight {
  return {
    available: true,
    newFollowers: 0,
    unfollows: 0,
    topInteractors: [],
    activityByHour: [],
    topCities: cidades,
  };
}

function interacao(parcial: Partial<InboxItem> = {}): InboxItem {
  return {
    id: `in-${Math.random().toString(36).slice(2, 8)}`,
    accountId: "acc-1",
    kind: "comentario",
    authorHandle: "@pessoa",
    authorName: "Pessoa",
    avatarGradient: "",
    text: "oi",
    postId: null,
    receivedAt: "2026-08-10T14:00:00",
    status: "pendente",
    assignedTo: null,
    replies: [],
    relacao: "seguidor",
    interacoes: 1,
    ...parcial,
  };
}

// --- Cidades ----------------------------------------------------------------

test("o raio do anúncio não cria uma cidade a mais", () => {
  assert.equal(normalizarCidade("São Paulo (+10 km)"), "São Paulo");
  assert.equal(normalizarCidade("  Recife  "), "Recife");
});

test("a fatia de seguidores sai em porcentagem legível, não multiplicada duas vezes", () => {
  // O bug que este teste tranca: `share` vem como 38 significando 38%, e a tela
  // chegou a anunciar "3.800,0% dos seguidores" por converter de novo.
  const cidades = cidadesAlcancadas([], [perfil([{ city: "São Paulo", share: 38 }])], 10_000);

  assert.equal(cidades[0].fatiaDeSeguidores, 0.38);
  assert.equal(cidades[0].seguidoresEstimados, 3800);
});

test("alcance de anúncio é atribuído à cidade segmentada", () => {
  const cidades = cidadesAlcancadas(
    [boost({ audience: { locations: ["Recife"], ageMin: 18, ageMax: 65, interests: [] } })],
    [],
    0,
  );

  assert.equal(cidades[0].cidade, "Recife");
  assert.equal(cidades[0].alcancePago, 10_000);
  assert.deepEqual(cidades[0].origens, ["segmentacao"]);
});

test("anúncio para duas cidades divide o alcance entre elas", () => {
  // A rede não devolve a quebra por cidade dentro de uma campanha; dividir
  // igualmente é a única hipótese que não favorece nenhuma das duas.
  const cidades = cidadesAlcancadas(
    [
      boost({
        audience: { locations: ["Recife", "Olinda"], ageMin: 18, ageMax: 65, interests: [] },
      }),
    ],
    [],
    0,
  );

  assert.equal(cidades.length, 2);
  assert.equal(cidades[0].alcancePago, 5000);
  assert.equal(cidades[1].alcancePago, 5000);
});

test("a mesma cidade vinda das duas origens vira uma linha só", () => {
  const cidades = cidadesAlcancadas(
    [
      boost({
        audience: { locations: ["São Paulo (+10 km)"], ageMin: 18, ageMax: 65, interests: [] },
      }),
    ],
    [perfil([{ city: "São Paulo", share: 20 }])],
    10_000,
  );

  assert.equal(cidades.length, 1);
  assert.deepEqual(cidades[0].origens, ["segmentacao", "perfil_da_rede"]);
  assert.equal(cidades[0].alcancePago, 10_000);
  assert.equal(cidades[0].seguidoresEstimados, 2000);
});

test("o fato vem antes do palpite na ordenação", () => {
  // Uma cidade com alcance contratado precisa vir antes de uma que só tem
  // estimativa da rede, por maior que a estimativa seja.
  const cidades = cidadesAlcancadas(
    [boost({ audience: { locations: ["Olinda"], ageMin: 18, ageMax: 65, interests: [] } })],
    [perfil([{ city: "São Paulo", share: 90 }])],
    100_000,
  );

  assert.equal(cidades[0].cidade, "Olinda");
});

test("perfil indisponível não entra nas contas", () => {
  const indisponivel: AudienceInsight = {
    ...perfil([{ city: "Recife", share: 50 }]),
    available: false,
  };

  assert.deepEqual(cidadesAlcancadas([], [indisponivel], 1000), []);
});

test("cada publicação entregue na cidade fica rastreável", () => {
  const cidades = cidadesAlcancadas(
    [
      boost({
        postId: "post-abc",
        audience: { locations: ["Recife"], ageMin: 18, ageMax: 65, interests: [] },
      }),
    ],
    [],
    0,
  );

  assert.equal(cidades[0].publicacoes.length, 1);
  assert.equal(cidades[0].publicacoes[0].postId, "post-abc");
});

test("sem anúncio e sem perfil, nenhuma cidade é inventada", () => {
  assert.deepEqual(cidadesAlcancadas([], [], 5000), []);
});

// --- Perfil do público ------------------------------------------------------

test("pessoas são contadas uma vez, mesmo com várias interações", () => {
  const perfilDoTeste = perfilDoPublico([
    interacao({ authorHandle: "@ana" }),
    interacao({ authorHandle: "@ana" }),
    interacao({ authorHandle: "@bruno" }),
  ]);

  assert.equal(perfilDoTeste.pessoas, 2);
  assert.ok(Math.abs(perfilDoTeste.interacoesPorPessoa - 1.5) < 0.001);
});

test("a relação usada é a mais recente da pessoa", () => {
  const perfilDoTeste = perfilDoPublico([
    interacao({ authorHandle: "@ana", relacao: "seguidor", receivedAt: "2026-08-01T10:00:00" }),
    interacao({ authorHandle: "@ana", relacao: "defensor", receivedAt: "2026-08-10T10:00:00" }),
  ]);

  const defensores = perfilDoTeste.porRelacao.find((linha) => linha.relacao === "defensor");
  assert.equal(defensores?.pessoas, 1);
  assert.equal(
    perfilDoTeste.porRelacao.some((linha) => linha.relacao === "seguidor"),
    false,
  );
});

test("a hora de pico é a de mais interações", () => {
  const perfilDoTeste = perfilDoPublico([
    interacao({ receivedAt: "2026-08-10T20:00:00" }),
    interacao({ receivedAt: "2026-08-10T20:30:00" }),
    interacao({ receivedAt: "2026-08-10T09:00:00" }),
  ]);

  assert.equal(perfilDoTeste.horaDePico, 20);
  assert.equal(perfilDoTeste.porHora.length, 24, "as 24 horas sempre aparecem, mesmo vazias");
});

test("sem interações, não há hora de pico inventada", () => {
  const perfilDoTeste = perfilDoPublico([]);

  assert.equal(perfilDoTeste.horaDePico, null);
  assert.equal(perfilDoTeste.pessoas, 0);
  assert.equal(perfilDoTeste.interacoesPorPessoa, 0);
});

test("quem mais interage vem primeiro", () => {
  const perfilDoTeste = perfilDoPublico([
    interacao({ authorHandle: "@pouco", interacoes: 2 }),
    interacao({ authorHandle: "@muito", interacoes: 40 }),
  ]);

  assert.equal(perfilDoTeste.maisAtivas[0].handle, "@muito");
});
