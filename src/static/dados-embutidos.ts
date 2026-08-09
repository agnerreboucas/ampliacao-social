import { desserializar } from "../lib/social/snapshot";
import type { EstadoPersistivel } from "../lib/social/snapshot";

/**
 * Substituto de `snapshot.server.ts` no build estático.
 *
 * No navegador não existe `node:fs` nem driver de Postgres — mas existe o
 * próprio documento. O `build-html.mjs` embute o conteúdo de
 * `dados/plataforma.json` em uma tag `<script type="application/json">`, e é
 * dela que os números saem aqui.
 *
 * É o que fecha o ciclo que o cliente pediu: digitar os números, commitar o
 * JSON, e o HTML publicado já abrir com eles — sem servidor e sem custo mensal.
 *
 * Este arquivo precisa exportar a mesma superfície de `snapshot.server.ts`. Se
 * uma função nova aparecer lá e não aqui, o build estático quebra na hora — que
 * é o comportamento desejado: melhor falhar no build do que publicar um HTML
 * que quebra na mão de quem recebeu o link.
 */

const ID_DA_TAG = "dados-plataforma";

export function caminhoDoArquivo(): string {
  return "(embutido no HTML)";
}

/** Não existe banco no HTML autocontido — é sempre demonstração. */
export function usandoBanco(): boolean {
  return false;
}

export function destinoDosDados(): { tipo: "postgres" | "arquivo"; descricao: string } {
  return { tipo: "arquivo", descricao: "embutido neste HTML" };
}

export function carregarSnapshot(): EstadoPersistivel | null {
  if (typeof document === "undefined") return null;

  const tag = document.getElementById(ID_DA_TAG);
  const texto = tag?.textContent?.trim();
  if (!texto) return null;

  try {
    return desserializar(texto);
  } catch (erro) {
    // Um HTML publicado com dado quebrado deve continuar abrindo: cair para a
    // semente é ruim, mas mostrar uma página em branco para quem recebeu o link
    // é pior. O erro fica no console de quem for investigar.
    console.error("Dados embutidos ilegíveis; usando a semente de demonstração.", erro);
    return null;
  }
}

export async function carregarEstadoInicial(): Promise<EstadoPersistivel | null> {
  return carregarSnapshot();
}

export type ResultadoGravacao = {
  gravado: boolean;
  destino: string | null;
  tipo: "postgres" | "arquivo";
  erro?: string;
};

/**
 * Gravar não existe aqui — o HTML é um arquivo, não um servidor.
 *
 * A tela trata `gravado: false` mostrando o botão de baixar como o caminho para
 * não perder o que foi digitado.
 */
export async function gravarEstado(): Promise<ResultadoGravacao> {
  return {
    gravado: false,
    destino: null,
    tipo: "arquivo",
    erro: "Esta é a demonstração em HTML: o que você digita vive só nesta aba. Use “Baixar” para guardar.",
  };
}
