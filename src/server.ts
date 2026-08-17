import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { exigirProducaoConfigurada } from "./lib/producao.server";

/**
 * A conferência de produção roda na carga do módulo, antes da primeira
 * requisição.
 *
 * Aqui e não dentro do `fetch` de propósito: falhar na subida aparece no log de
 * implantação da hospedagem, que é onde alguém está olhando naquele minuto.
 * Falhar na primeira requisição apareceria como uma página de erro para um
 * visitante — e a plataforma teria ficado no ar, aberta, até alguém tentar
 * entrar.
 */
exigirProducaoConfigurada();

/**
 * O estado é carregado na subida, e não na primeira requisição.
 *
 * O módulo do store resolve a leitura do banco no topo dele; até alguém chamar
 * uma função de servidor, ele nem é importado. Numa implantação nova isso
 * significa banco vazio até a primeira visita — e `npm run senha` falhando com
 * "nenhum usuário com esse e-mail" para quem seguiu o passo a passo na ordem
 * certa.
 *
 * Carregando aqui, a instalação existe assim que o processo sobe: dá para
 * definir a senha antes de abrir a plataforma pela primeira vez. Se o banco
 * estiver fora do ar, o erro aparece no log da implantação em vez de aparecer
 * para um visitante.
 */
await import("./lib/social/store.server").catch((erro) => {
  console.error("Não foi possível preparar o estado da plataforma na subida.", erro);
  throw erro;
});

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Antes de qualquer coisa: o teste de saúde não pode depender do
      // roteador nem da renderização. Se a aplicação estiver com problema
      // justamente aí, é quando o provedor mais precisa da resposta.
      if (new URL(request.url).pathname === "/api/saude") {
        const { respostaDeSaude } = await import("./lib/saude.server");
        return await respostaDeSaude();
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
