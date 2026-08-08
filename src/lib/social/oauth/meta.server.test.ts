import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ErroDaMeta,
  buscarInsights,
  descobrirContas,
  explicarErro,
  gerarState,
  obterTokenLongaDuracao,
  trocarCodigoPorToken,
} from "./meta.server.ts";

const config = {
  appId: "app-123",
  appSecret: "segredo",
  redirectUri: "https://app.exemplo.com/oauth/retorno",
};

/** `fetch` de mentira: grava as URLs chamadas e devolve o que o teste mandar. */
function buscadorFalso(respostas: Array<{ status?: number; corpo: unknown }>) {
  const chamadas: string[] = [];
  let indice = 0;
  const buscador = async (url: string | URL | Request) => {
    chamadas.push(String(url));
    const atual = respostas[Math.min(indice, respostas.length - 1)];
    indice += 1;
    return new Response(JSON.stringify(atual.corpo), {
      status: atual.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { buscador: buscador as unknown as typeof fetch, chamadas };
}

test("state é aleatório e longo o suficiente para servir de anti-CSRF", () => {
  const a = gerarState();
  const b = gerarState();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32);
});

test("troca do código envia segredo e redirect_uri e devolve o token", async () => {
  const { buscador, chamadas } = buscadorFalso([{ corpo: { access_token: "token-curto" } }]);
  const token = await trocarCodigoPorToken(config, "codigo-do-retorno", buscador);

  assert.equal(token, "token-curto");
  const url = new URL(chamadas[0]);
  assert.equal(url.searchParams.get("client_secret"), "segredo");
  assert.equal(url.searchParams.get("code"), "codigo-do-retorno");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
});

test("erro da Meta na troca do código chega com a mensagem original", async () => {
  const { buscador } = buscadorFalso([
    {
      status: 400,
      corpo: { error: { message: "This authorization code has been used.", code: 100 } },
    },
  ]);

  await assert.rejects(
    () => trocarCodigoPorToken(config, "usado", buscador),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroDaMeta);
      assert.match(erro.message, /authorization code has been used/);
      return true;
    },
  );
});

test("resposta sem token não passa como sucesso", async () => {
  const { buscador } = buscadorFalso([{ corpo: {} }]);
  await assert.rejects(() => trocarCodigoPorToken(config, "c", buscador), /não devolveu o token/i);
});

test("token de longa duração pede a troca correta e devolve validade", async () => {
  const { buscador, chamadas } = buscadorFalso([
    { corpo: { access_token: "token-longo", expires_in: 5183944 } },
  ]);
  const resultado = await obterTokenLongaDuracao(config, "token-curto", buscador);

  assert.equal(resultado.token, "token-longo");
  assert.equal(resultado.expiraEm, 5183944);
  assert.equal(new URL(chamadas[0]).searchParams.get("grant_type"), "fb_exchange_token");
});

test("descobrir contas pede o Instagram vinculado e mapeia as duas redes", async () => {
  const { buscador, chamadas } = buscadorFalso([
    {
      corpo: {
        data: [
          {
            id: "page-1",
            name: "Mercadinho",
            access_token: "token-pagina",
            instagram_business_account: { id: "ig-1", username: "mercadinho" },
          },
        ],
      },
    },
  ]);

  const contas = await descobrirContas(config, "token-usuario", buscador);

  assert.deepEqual(
    contas.map((c) => c.networkId),
    ["facebook", "instagram"],
  );
  assert.match(chamadas[0], /instagram_business_account/);
});

test("insights do Instagram pedem período diário e reconstroem o acumulado", async () => {
  const { buscador, chamadas } = buscadorFalso([
    {
      corpo: {
        data: [
          {
            name: "follower_count",
            values: [
              { end_time: "2026-08-07T07:00:00+0000", value: 10 },
              { end_time: "2026-08-08T07:00:00+0000", value: 5 },
            ],
          },
        ],
      },
    },
    { corpo: { followers_count: 500 } },
  ]);

  const dias = await buscarInsights(
    config,
    { externalId: "page-1", instagramId: "ig-1", accessToken: "token-pagina" },
    { desde: "2026-08-07", ate: "2026-08-08" },
    buscador,
  );

  assert.equal(dias.length, 2);
  assert.equal(dias.at(-1)?.followers, 500);
  const url = new URL(chamadas[0]);
  assert.equal(url.searchParams.get("period"), "day");
  assert.ok(url.pathname.includes("/ig-1/insights"));
});

test("insights de Página não vão buscar seguidores do Instagram", async () => {
  const { buscador, chamadas } = buscadorFalso([
    {
      corpo: {
        data: [
          { name: "page_fans", values: [{ end_time: "2026-08-08T07:00:00+0000", value: 90 }] },
        ],
      },
    },
  ]);

  await buscarInsights(
    config,
    { externalId: "page-1", accessToken: "token" },
    { desde: "2026-08-08", ate: "2026-08-08" },
    buscador,
  );

  assert.equal(chamadas.length, 1);
  assert.ok(chamadas[0].includes("/page-1/insights"));
});

test("cada falha da Meta vira uma instrução acionável", () => {
  assert.match(explicarErro(new ErroDaMeta(400, "x", "OAuthException", 190)), /Reconecte a conta/i);
  assert.match(explicarErro(new ErroDaMeta(429, "limite")), /limitando as chamadas/i);
  assert.match(
    explicarErro(new ErroDaMeta(403, "sem permissão", "OAuthException", 200)),
    /permiss/i,
  );
  assert.match(explicarErro(new Error("rede caiu")), /Não foi possível falar com a Meta/i);
});
