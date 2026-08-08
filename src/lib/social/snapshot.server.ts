import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { SnapshotInvalido, desserializar, serializar } from "./snapshot";
import type { EstadoPersistivel } from "./snapshot";

/**
 * O snapshot no disco.
 *
 * O caminho padrão é um arquivo dentro do próprio repositório, e isso é
 * intencional: o fluxo de trabalho é digitar os números, gravar, commitar e
 * empurrar para o Git. O versionamento dos dados sai de graça junto com o do
 * código — quem mudou qual número, quando, e como voltar atrás.
 *
 * `SOCIAL_DADOS_ARQUIVO` troca o caminho em quem hospeda a aplicação com o
 * diretório de trabalho em outro lugar.
 */

const CAMINHO_PADRAO = "dados/plataforma.json";

export function caminhoDoArquivo(): string {
  return resolve(process.cwd(), process.env.SOCIAL_DADOS_ARQUIVO ?? CAMINHO_PADRAO);
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

export function gravarSnapshot(estado: EstadoPersistivel): {
  gravado: boolean;
  caminho: string | null;
} {
  const caminho = caminhoDoArquivo();
  try {
    mkdirSync(dirname(caminho), { recursive: true });
    writeFileSync(caminho, serializar(estado), "utf8");
    return { gravado: true, caminho };
  } catch {
    // Hospedagem com disco somente leitura é um caso real. A tela continua
    // funcionando e o botão de baixar o arquivo vira o caminho de saída.
    return { gravado: false, caminho: null };
  }
}
