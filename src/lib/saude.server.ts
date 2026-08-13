import { bancoConfigurado, obterPool } from "./social/banco/postgres.server";

/**
 * Teste de saúde da instalação.
 *
 * Todo serviço de hospedagem precisa de um endereço que responda "estou de pé"
 * para decidir se manda tráfego ou reinicia o processo. Sem ele, o provedor usa
 * a página inicial — que responde 200 mesmo com o banco fora do ar, porque a
 * tela de entrada é renderizada de qualquer jeito. Um teste de saúde que mente
 * é pior que nenhum: ele mantém no ar uma instalação quebrada.
 *
 * Por isso este aqui **toca o banco de verdade**. Uma consulta trivial, mas que
 * passa pelo pool, pela rede e pelo Postgres.
 *
 * O que ele devolve é deliberadamente pobre: se está no ar, se o banco responde
 * e há quanto tempo o processo vive. Nada de versão, nome de host ou contagem
 * de registros — este endereço é público por necessidade, e um endereço público
 * é um endereço que alguém vai ler.
 */

const SUBIU_EM = Date.now();

export type Saude = {
  ok: boolean;
  banco: "ok" | "sem resposta" | "não configurado";
  /** Segundos desde que o processo subiu. */
  emPeHa: number;
};

export async function verificarSaude(): Promise<Saude> {
  const emPeHa = Math.round((Date.now() - SUBIU_EM) / 1000);

  if (!bancoConfigurado()) {
    // Modo demonstração: a aplicação funciona, e dizer "ok" seria mentir por
    // omissão para quem configurou um banco e não percebeu que a variável não
    // chegou ao processo.
    return { ok: true, banco: "não configurado", emPeHa };
  }

  try {
    await obterPool().query("select 1");
    return { ok: true, banco: "ok", emPeHa };
  } catch (erro) {
    console.error("Teste de saúde: o banco não respondeu.", erro);
    return { ok: false, banco: "sem resposta", emPeHa };
  }
}

/** A resposta HTTP do teste, pronta para o `fetch` do servidor. */
export async function respostaDeSaude(): Promise<Response> {
  const saude = await verificarSaude();

  return new Response(JSON.stringify(saude), {
    // 503 quando o banco não responde: é o código que faz o provedor tirar a
    // instância do balanceamento em vez de continuar mandando gente para ela.
    status: saude.ok ? 200 : 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Um teste de saúde em cache não testa nada.
      "cache-control": "no-store",
    },
  });
}
