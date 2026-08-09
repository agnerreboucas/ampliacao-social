import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derivar = promisify(scrypt) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  opcoes: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Senhas da plataforma.
 *
 * Duas regras que o resto do sistema depende:
 *
 * 1. **Senha nunca é guardada.** O que fica é uma derivação com sal aleatório.
 *    Quem obtiver o banco não obtém as senhas.
 * 2. **Senha nunca entra no repositório** — nem em texto, nem como hash. Um
 *    hash de frase memorável em repositório é quebrável por dicionário, e
 *    repositório privado hoje é repositório compartilhado amanhã. A senha vive
 *    na variável de ambiente de quem hospeda, ou é definida pelo script.
 *
 * `scrypt` está na biblioteca padrão do Node e é resistente a ataque com placa
 * de vídeo — não precisa de dependência externa para isto.
 */

/**
 * Custo da derivação.
 *
 * N=16384 leva algumas dezenas de milissegundos por tentativa: imperceptível em
 * um login, caro o suficiente para inviabilizar força bruta em escala.
 */
const PARAMETROS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TAMANHO_SAL = 16;
const TAMANHO_CHAVE = 64;
const ESQUEMA = "scrypt";

export const TAMANHO_MINIMO_SENHA = 8;

export class SenhaFraca extends Error {}

/**
 * Deriva o hash de uma senha nova.
 *
 * O resultado carrega o esquema e os parâmetros junto: quando o custo precisar
 * subir, hashes antigos continuam verificáveis com os parâmetros deles.
 */
export async function gerarHash(senha: string): Promise<string> {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    throw new SenhaFraca(`A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }

  const sal = randomBytes(TAMANHO_SAL);
  const chave = await derivar(senha, sal, TAMANHO_CHAVE, PARAMETROS);

  return [
    ESQUEMA,
    PARAMETROS.N,
    PARAMETROS.r,
    PARAMETROS.p,
    sal.toString("base64url"),
    chave.toString("base64url"),
  ].join("$");
}

/**
 * Confere uma senha contra o hash guardado.
 *
 * Devolve `false` para qualquer entrada estranha — hash malformado, esquema
 * desconhecido — em vez de lançar. Do lado de quem chama, "não confere" e "não
 * consegui conferir" levam ao mesmo lugar: não entra.
 *
 * A comparação é em tempo constante. Comparar com `===` vazaria, pelo tempo de
 * resposta, quantos bytes iniciais estavam certos.
 */
export async function verificarSenha(senha: string, hashGuardado: string): Promise<boolean> {
  const partes = hashGuardado.split("$");
  if (partes.length !== 6 || partes[0] !== ESQUEMA) return false;

  const [, n, r, p, salBase64, chaveBase64] = partes;
  const parametros = { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMETROS.maxmem };
  if (!Number.isInteger(parametros.N) || !Number.isInteger(parametros.r)) return false;

  try {
    const sal = Buffer.from(salBase64, "base64url");
    const esperado = Buffer.from(chaveBase64, "base64url");
    if (sal.length === 0 || esperado.length === 0) return false;

    const calculado = await derivar(senha, sal, esperado.length, parametros);
    return timingSafeEqual(calculado, esperado);
  } catch {
    return false;
  }
}

/** Um hash tem a cara certa? Usado para decidir se o usuário já tem senha. */
export function pareceHash(valor: string | undefined | null): valor is string {
  return (
    typeof valor === "string" && valor.startsWith(`${ESQUEMA}$`) && valor.split("$").length === 6
  );
}
