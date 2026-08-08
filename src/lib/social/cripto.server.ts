import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra os tokens das redes antes de guardá-los (PRD 5, Segurança).
 *
 * Um token de Página da Meta permite publicar e ler mensagens em nome do
 * cliente — vale mais que uma senha, porque não expira ao trocar a senha. Por
 * isso ele nunca é gravado em texto puro, nem sai da camada de servidor.
 *
 * AES-256-GCM: além de cifrar, autentica. Se o valor guardado for adulterado, a
 * decifragem falha em vez de devolver lixo silenciosamente.
 */

const ALGORITMO = "aes-256-gcm";
const TAMANHO_IV = 12; // recomendado para GCM
const VERSAO = "v1";

export class ChaveDeCriptografiaAusente extends Error {
  constructor() {
    super(
      "SOCIAL_CRYPTO_KEY não está definida. Gere uma com `openssl rand -base64 32` " +
        "e configure no ambiente antes de conectar contas reais.",
    );
    this.name = "ChaveDeCriptografiaAusente";
  }
}

/** Aceita a chave em base64 (32 bytes) — o formato que `openssl rand` devolve. */
export function lerChave(valor: string | undefined): Buffer {
  if (!valor) throw new ChaveDeCriptografiaAusente();
  const chave = Buffer.from(valor, "base64");
  if (chave.length !== 32) {
    throw new Error(
      `SOCIAL_CRYPTO_KEY precisa ter 32 bytes em base64 (recebi ${chave.length}). ` +
        "Gere uma nova com `openssl rand -base64 32`.",
    );
  }
  return chave;
}

/** Formato guardado: v1.<iv>.<tag>.<conteúdo>, tudo em base64url. */
export function cifrar(textoPuro: string, chave: Buffer): string {
  const iv = randomBytes(TAMANHO_IV);
  const cipher = createCipheriv(ALGORITMO, chave, iv);
  const conteudo = Buffer.concat([cipher.update(textoPuro, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSAO,
    iv.toString("base64url"),
    tag.toString("base64url"),
    conteudo.toString("base64url"),
  ].join(".");
}

export function decifrar(valorGuardado: string, chave: Buffer): string {
  const partes = valorGuardado.split(".");
  if (partes.length !== 4 || partes[0] !== VERSAO) {
    throw new Error("Token guardado em formato desconhecido; reconecte a conta.");
  }

  const [, iv, tag, conteudo] = partes;
  const decipher = createDecipheriv(ALGORITMO, chave, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(conteudo, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Para telas e logs: mostra só o fim do token, nunca o valor inteiro. */
export function mascarar(token: string): string {
  if (token.length <= 6) return "••••";
  return `••••${token.slice(-4)}`;
}
