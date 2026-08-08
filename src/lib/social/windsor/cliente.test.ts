import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BASE_PADRAO,
  ErroDoWindsor,
  buscarMidiaPaga,
  explicarErroWindsor,
  montarUrl,
} from "./cliente.server.ts";

const config = { apiKey: "chave-de-teste" };

function buscadorFalso(resposta: { status?: number; corpo: unknown }) {
  const chamadas: string[] = [];
  const buscador = async (url: string | URL | Request) => {
    chamadas.push(String(url));
    return new Response(JSON.stringify(resposta.corpo), {
      status: resposta.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { buscador: buscador as unknown as typeof fetch, chamadas };
}

test("a URL leva chave, período e campos pedidos", () => {
  const url = new URL(montarUrl(config, "facebook", ["date", "spend"], "last_30d"));

  assert.equal(url.origin + url.pathname, `${BASE_PADRAO}/facebook`);
  assert.equal(url.searchParams.get("api_key"), "chave-de-teste");
  assert.equal(url.searchParams.get("date_preset"), "last_30d");
  assert.equal(url.searchParams.get("fields"), "date,spend");
});

test("a base é configurável para apontar a outro ambiente", () => {
  const url = montarUrl(
    { ...config, baseUrl: "https://proxy.interno" },
    "facebook",
    ["date"],
    "last_7d",
  );
  assert.ok(url.startsWith("https://proxy.interno/facebook"));
});

test("chave recusada vira instrução, não código de status solto", async () => {
  const { buscador } = buscadorFalso({ status: 401, corpo: {} });
  await assert.rejects(
    () => buscarMidiaPaga(config, "facebook", "last_30d", buscador),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroDoWindsor);
      assert.match(erro.message, /WINDSOR_API_KEY/);
      return true;
    },
  );
});

test("resposta em envelope `data` é aceita", async () => {
  const { buscador } = buscadorFalso({
    corpo: {
      data: [
        {
          date: "2024-09-07",
          account_name: "Neon Cunha",
          campaign: "Tráfego",
          spend: 98.94,
          reach: 9854,
          impressions: 10084,
          clicks: 207,
        },
      ],
    },
  });

  const resultado = await buscarMidiaPaga(config, "facebook", "last_30d", buscador);

  assert.equal(resultado.dias.length, 1);
  assert.equal(resultado.dias[0].adSpend, 98.94);
  assert.equal(resultado.campanhas.length, 1);
  assert.equal(resultado.totais.investido, 98.94);
  assert.deepEqual(resultado.contasDeAnuncio, ["Neon Cunha"]);
});

test("resposta em envelope `result` também é aceita", async () => {
  const { buscador } = buscadorFalso({
    corpo: { result: [{ date: "2024-09-07", campaign: "X", spend: 10, impressions: 100 }] },
  });
  const resultado = await buscarMidiaPaga(config, "facebook", "last_30d", buscador);
  assert.equal(resultado.totais.investido, 10);
});

test("conta sem veiculação no período devolve vazio em vez de erro", async () => {
  // Foi o que aconteceu de verdade: last_30d voltou sem linhas.
  const { buscador } = buscadorFalso({ corpo: { data: [] } });
  const resultado = await buscarMidiaPaga(config, "facebook", "last_30d", buscador);

  assert.deepEqual(resultado.dias, []);
  assert.deepEqual(resultado.campanhas, []);
  assert.equal(resultado.totais.investido, 0);
  assert.equal(resultado.totais.campanhas, 0);
});

test("falha de rede vira mensagem legível", () => {
  assert.match(explicarErroWindsor(new Error("timeout")), /Não foi possível falar com o Windsor/i);
  assert.equal(
    explicarErroWindsor(new ErroDoWindsor(500, "O Windsor.ai respondeu 500.")),
    "O Windsor.ai respondeu 500.",
  );
});
