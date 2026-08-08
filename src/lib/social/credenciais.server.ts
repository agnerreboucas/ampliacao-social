import { getMetaConfig } from "../config.server";
import { cifrar, decifrar, lerChave } from "./cripto.server";
import type { ContaDescoberta } from "./oauth/meta";

/**
 * Guarda as credenciais das contas conectadas — sempre cifradas.
 *
 * O token em texto puro só existe dentro de uma chamada de servidor: entra
 * cifrado no armazenamento, é decifrado no momento de falar com a Meta e nunca
 * é devolvido para o navegador nem gravado em log.
 */

export type CredencialConta = {
  accountId: string;
  externalId: string;
  instagramId?: string;
  /** Token de Página cifrado com AES-256-GCM. */
  tokenCifrado: string;
  /** Quando o token de usuário que originou este expira (ISO), se informado. */
  expiraEm: string | null;
  escopos: string[];
  conectadoEm: string;
};

/** Descoberta aguardando o usuário escolher quais contas conectar. */
export type DescobertaPendente = {
  id: string;
  projectId: string;
  criadoEm: number;
  escopos: string[];
  contas: ContaDescoberta[];
};

/** Pedido de autorização em andamento — o `state` protege contra CSRF. */
export type StateOAuth = {
  state: string;
  projectId: string;
  escopos: string[];
  criadoEm: number;
};

type Cofre = {
  credenciais: Map<string, CredencialConta>;
  descobertas: Map<string, DescobertaPendente>;
  states: Map<string, StateOAuth>;
};

const global = globalThis as typeof globalThis & { __socialCofre?: Cofre };

function cofre(): Cofre {
  if (!global.__socialCofre) {
    global.__socialCofre = { credenciais: new Map(), descobertas: new Map(), states: new Map() };
  }
  return global.__socialCofre;
}

function chave() {
  return lerChave(getMetaConfig().chaveCriptografia);
}

/** Autorizações e descobertas antigas são descartadas: 15 minutos de validade. */
const VALIDADE_MS = 15 * 60 * 1000;

function limpar(mapa: Map<string, { criadoEm: number }>) {
  const limite = Date.now() - VALIDADE_MS;
  for (const [id, item] of mapa) {
    if (item.criadoEm < limite) mapa.delete(id);
  }
}

export function registrarState(entrada: Omit<StateOAuth, "criadoEm">): void {
  const { states } = cofre();
  limpar(states);
  states.set(entrada.state, { ...entrada, criadoEm: Date.now() });
}

/** Consome o state: um pedido de autorização só pode ser usado uma vez. */
export function consumirState(state: string): StateOAuth | null {
  const { states } = cofre();
  limpar(states);
  const encontrado = states.get(state);
  if (!encontrado) return null;
  states.delete(state);
  return encontrado;
}

export function guardarDescoberta(entrada: Omit<DescobertaPendente, "criadoEm">): void {
  const { descobertas } = cofre();
  limpar(descobertas);
  descobertas.set(entrada.id, { ...entrada, criadoEm: Date.now() });
}

export function lerDescoberta(id: string): DescobertaPendente | null {
  const { descobertas } = cofre();
  limpar(descobertas);
  return descobertas.get(id) ?? null;
}

export function descartarDescoberta(id: string): void {
  cofre().descobertas.delete(id);
}

export function salvarCredencial(entrada: {
  accountId: string;
  externalId: string;
  instagramId?: string;
  token: string;
  expiraEm: string | null;
  escopos: string[];
}): void {
  cofre().credenciais.set(entrada.accountId, {
    accountId: entrada.accountId,
    externalId: entrada.externalId,
    instagramId: entrada.instagramId,
    tokenCifrado: cifrar(entrada.token, chave()),
    expiraEm: entrada.expiraEm,
    escopos: entrada.escopos,
    conectadoEm: new Date().toISOString(),
  });
}

export function temCredencial(accountId: string): boolean {
  return cofre().credenciais.has(accountId);
}

export function lerCredencial(accountId: string): CredencialConta | null {
  return cofre().credenciais.get(accountId) ?? null;
}

/**
 * Decifra o token para uso imediato. Chame o mais perto possível da chamada à
 * Meta e não guarde o retorno em nenhuma estrutura de longa duração.
 */
export function revelarToken(accountId: string): string | null {
  const credencial = lerCredencial(accountId);
  if (!credencial) return null;
  return decifrar(credencial.tokenCifrado, chave());
}

export function removerCredencial(accountId: string): void {
  cofre().credenciais.delete(accountId);
}
