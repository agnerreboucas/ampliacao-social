import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  bancoConfigurado,
  carregarDoBanco,
  garantirEsquema,
  gravarNoBanco,
} from "./banco/postgres.server";
import { SnapshotInvalido, desserializar, serializar } from "./snapshot";
import type { EstadoPersistivel } from "./snapshot";

/**
 * Onde o estado da plataforma fica guardado.
 *
 * Dois destinos, escolhidos por uma variável de ambiente:
 *
 * - **`DATABASE_URL` definida** → Postgres (Neon, Supabase, o que for). É o
 *   caminho para operar com cliente de verdade: escrita concorrente, backup do
 *   provedor, e nada que dependa do disco da máquina que roda a aplicação.
 * - **sem `DATABASE_URL`** → o arquivo `dados/plataforma.json`, que vai para o
 *   Git. Continua sendo o caminho de custo zero, e é o que a demonstração usa.
 *
 * A troca não exige mudar mais nada: as duas pontas falam `EstadoPersistivel`,
 * e é por isso que a aplicação inteira ignora qual delas está ativa.
 */

const CAMINHO_PADRAO = "dados/plataforma.json";

export function caminhoDoArquivo(): string {
  return resolve(process.cwd(), process.env.SOCIAL_DADOS_ARQUIVO ?? CAMINHO_PADRAO);
}

/**
 * A plataforma está operando com banco?
 *
 * Reexportado aqui de propósito. Quem precisa da resposta — o store, a
 * autenticação — importa deste módulo, e não do módulo do Postgres: no build
 * estático `snapshot.server` inteiro é trocado por um substituto, e com ele some
 * qualquer traço do driver do bundle do navegador.
 */
export function usandoBanco(): boolean {
  return bancoConfigurado();
}

/** Descrição do destino atual, para a tela dizer onde os dados estão. */
export function destinoDosDados(): { tipo: "postgres" | "arquivo"; descricao: string } {
  if (bancoConfigurado()) {
    return { tipo: "postgres", descricao: descreverBanco() };
  }
  return { tipo: "arquivo", descricao: caminhoDoArquivo() };
}

/**
 * O endereço do banco sem a senha.
 *
 * A tela mostra onde os dados estão; a senha do banco não tem por que aparecer
 * em tela nenhuma, e menos ainda em um print que alguém manda por WhatsApp.
 */
function descreverBanco(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    const { hostname, pathname } = new URL(url);
    return `${hostname}${pathname}`;
  } catch {
    return "banco de dados";
  }
}

// --- Leitura ----------------------------------------------------------------

export async function carregarEstadoInicial(): Promise<EstadoPersistivel | null> {
  if (bancoConfigurado()) {
    // O esquema é criado na primeira subida; nas seguintes o DDL não faz nada.
    await garantirEsquema();
    return carregarDoBanco();
  }
  return carregarSnapshot();
}

/**
 * Lê o arquivo, se existir.
 *
 * Arquivo ausente é normal — é a primeira execução, e a semente cobre. Arquivo
 * corrompido não é: devolver `null` ali faria a plataforma abrir com dados de
 * demonstração como se nada tivesse acontecido, e o cliente só descobriria pelo
 * número errado. Por isso o erro sobe.
 */
export function carregarSnapshot(): EstadoPersistivel | null {
  const caminho = caminhoDoArquivo();
  if (!existsSync(caminho)) return null;

  const texto = readFileSync(caminho, "utf8");
  try {
    return desserializar(texto);
  } catch (erro) {
    if (erro instanceof SnapshotInvalido) {
      throw new SnapshotInvalido(`${caminho}: ${erro.message}`);
    }
    throw erro;
  }
}

// --- Escrita ----------------------------------------------------------------

export type ResultadoGravacao = {
  gravado: boolean;
  /** Onde foi parar, já sem credencial. `null` quando não deu para gravar. */
  destino: string | null;
  tipo: "postgres" | "arquivo";
  erro?: string;
};

export async function gravarEstado(estado: EstadoPersistivel): Promise<ResultadoGravacao> {
  if (bancoConfigurado()) {
    try {
      await gravarNoBanco(estado);
      return { gravado: true, destino: descreverBanco(), tipo: "postgres" };
    } catch (erro) {
      // Não engolir: se o banco recusou a escrita, quem digitou precisa saber
      // agora — e o botão de baixar o arquivo continua sendo a saída.
      return {
        gravado: false,
        destino: null,
        tipo: "postgres",
        erro: erro instanceof Error ? erro.message : "Falha ao gravar no banco.",
      };
    }
  }

  const caminho = caminhoDoArquivo();
  try {
    mkdirSync(dirname(caminho), { recursive: true });
    writeFileSync(caminho, serializar(estado), "utf8");
    return { gravado: true, destino: caminho, tipo: "arquivo" };
  } catch (erro) {
    // Hospedagem com disco somente leitura é um caso real. A tela continua
    // funcionando e o botão de baixar o arquivo vira o caminho de saída.
    return {
      gravado: false,
      destino: null,
      tipo: "arquivo",
      erro: erro instanceof Error ? erro.message : "Falha ao gravar o arquivo.",
    };
  }
}
