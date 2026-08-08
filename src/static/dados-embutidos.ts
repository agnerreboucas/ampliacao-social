import { desserializar } from "../lib/social/snapshot";
import type { EstadoPersistivel } from "../lib/social/snapshot";

/**
 * Substituto de `snapshot.server.ts` no build estático.
 *
 * No navegador não existe `node:fs` — mas existe o próprio documento. O
 * `build-html.mjs` embute o conteúdo de `dados/plataforma.json` em uma tag
 * `<script type="application/json">`, e é dela que os números saem aqui.
 *
 * É o que fecha o ciclo que o cliente pediu: digitar os números, commitar o
 * JSON, e o HTML publicado já abrir com eles — sem servidor e sem custo mensal.
 */

const ID_DA_TAG = "dados-plataforma";

export function caminhoDoArquivo(): string {
  return "(embutido no HTML)";
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

/**
 * Gravar não existe aqui — o HTML é um arquivo, não um servidor.
 *
 * A tela trata `gravado: false` mostrando o botão de baixar como o caminho para
 * não perder o que foi digitado.
 */
export function gravarSnapshot(): { gravado: boolean; caminho: string | null } {
  return { gravado: false, caminho: null };
}
