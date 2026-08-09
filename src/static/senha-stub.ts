/**
 * Substituto de `senha.server.ts` no build estático.
 *
 * `scrypt` vive em `node:crypto`, que não existe no navegador. E não faz falta:
 * o HTML autocontido é a demonstração, onde não há banco, não há senha e não há
 * dado de cliente para proteger — qualquer senha entra, que é a graça de poder
 * abrir o arquivo e olhar.
 *
 * `pareceHash` devolvendo `false` é o que faz `autenticar` seguir pelo caminho
 * do modo demonstração sem nenhuma verificação adicional.
 */

export const TAMANHO_MINIMO_SENHA = 8;

export class SenhaFraca extends Error {}

export function pareceHash(): boolean {
  return false;
}

export async function verificarSenha(): Promise<boolean> {
  return false;
}

export async function gerarHash(): Promise<string> {
  throw new SenhaFraca("A demonstração em HTML não guarda senhas.");
}
