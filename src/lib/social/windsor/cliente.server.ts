// Extensão explícita: os testes rodam no Node sem empacotador.
import { CAMPOS_MIDIA_PAGA, mapearMidiaPaga, resumirCampanhas, totalizar } from "./windsor.ts";
import type { LinhaAnuncio, ResumoCampanha, TotaisPagos } from "./windsor.ts";
import type { DailyMetric } from "../types";

/**
 * Cliente HTTP do Windsor.ai.
 *
 * A API é uma só para todos os conectores: uma chamada GET com a chave da conta,
 * o conector desejado e a lista de campos. O `fetch` é injetável para os testes
 * exercitarem erro e formato sem tocar na rede.
 */

export type Buscador = typeof fetch;

export type ConfigWindsor = {
  apiKey: string;
  /** Base configurável para apontar a um proxy ou a um ambiente de testes. */
  baseUrl?: string;
};

export const BASE_PADRAO = "https://connectors.windsor.ai";

/** Períodos aceitos, com os mesmos nomes que o Windsor usa. */
export type PeriodoWindsor =
  | "last_7d"
  | "last_30d"
  | "last_90d"
  | "last_6m"
  | "last_year"
  | "last_2years";

export class ErroDoWindsor extends Error {
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroDoWindsor";
    this.status = status;
  }
}

export function montarUrl(
  config: ConfigWindsor,
  conector: string,
  campos: readonly string[],
  periodo: PeriodoWindsor,
): string {
  const url = new URL(`${config.baseUrl ?? BASE_PADRAO}/${conector}`);
  url.searchParams.set("api_key", config.apiKey);
  url.searchParams.set("date_preset", periodo);
  url.searchParams.set("fields", campos.join(","));
  return url.toString();
}

async function pedir<T>(buscador: Buscador, url: string): Promise<T> {
  const resposta = await buscador(url, { headers: { accept: "application/json" } });

  if (!resposta.ok) {
    // A chave inválida é o erro mais comum e merece uma frase própria.
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroDoWindsor(
        resposta.status,
        "O Windsor.ai recusou a chave de API. Confira WINDSOR_API_KEY.",
      );
    }
    throw new ErroDoWindsor(resposta.status, `O Windsor.ai respondeu ${resposta.status}.`);
  }

  const corpo = (await resposta.json().catch(() => null)) as { data?: T; result?: T } | null;
  if (!corpo) throw new ErroDoWindsor(502, "O Windsor.ai devolveu uma resposta ilegível.");

  // A API já usou os dois nomes de envelope; aceitamos ambos.
  return (corpo.data ?? corpo.result ?? ([] as unknown as T)) as T;
}

/** Linhas cruas de mídia paga de um conector (ex.: `facebook` = Meta Ads). */
export async function buscarLinhasDeAnuncios(
  config: ConfigWindsor,
  conector: string,
  periodo: PeriodoWindsor,
  buscador: Buscador = fetch,
): Promise<LinhaAnuncio[]> {
  const url = montarUrl(config, conector, CAMPOS_MIDIA_PAGA, periodo);
  const linhas = await pedir<LinhaAnuncio[]>(buscador, url);
  return Array.isArray(linhas) ? linhas : [];
}

export type MidiaPagaDoWindsor = {
  dias: DailyMetric[];
  campanhas: ResumoCampanha[];
  totais: TotaisPagos;
  /** Contas de anúncio encontradas na resposta, para exibir a origem. */
  contasDeAnuncio: string[];
};

/** Busca e já entrega no formato que as telas consomem. */
export async function buscarMidiaPaga(
  config: ConfigWindsor,
  conector: string,
  periodo: PeriodoWindsor,
  buscador: Buscador = fetch,
): Promise<MidiaPagaDoWindsor> {
  const linhas = await buscarLinhasDeAnuncios(config, conector, periodo, buscador);
  const campanhas = resumirCampanhas(linhas);

  return {
    dias: mapearMidiaPaga(linhas),
    campanhas,
    totais: totalizar(campanhas),
    contasDeAnuncio: [
      ...new Set(
        linhas.map((linha) => linha.account_name).filter((nome): nome is string => Boolean(nome)),
      ),
    ],
  };
}

export function explicarErroWindsor(erro: unknown): string {
  if (erro instanceof ErroDoWindsor) return erro.message;
  return "Não foi possível falar com o Windsor.ai agora. Tente de novo em alguns minutos.";
}
