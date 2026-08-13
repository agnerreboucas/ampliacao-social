import { getDb } from "@/lib/social/store.server";
import type { PlatformUser } from "@/lib/social/types";

/**
 * Sessão da demonstração, no navegador.
 *
 * O módulo real sela a sessão num cookie que só o servidor sabe assinar. Aqui
 * não existe servidor: a demonstração é um arquivo HTML que roda sozinho, e a
 * sessão vive numa variável.
 *
 * **A regra de autorização é copiada, não afrouxada.** Um gestor continua sem
 * enxergar projeto que não é dele, e cada função continua exigindo sessão. Isso
 * importa porque a demonstração é o que se mostra ao cliente: se aqui o
 * controle de acesso se comportasse diferente, a demonstração estaria vendendo
 * um produto que não é o que existe.
 *
 * O que muda, e é dito na tela de entrada: sem servidor, quem está de posse do
 * arquivo pode mexer nesta variável pelo console do navegador. Numa
 * demonstração com dados fictícios isso não custa nada — em produção, é
 * exatamente por isso que a sessão mora num cookie selado.
 */

let usuarioDaSessao: string | null = null;

export class SemSessao extends Error {
  constructor(mensagem = "Sua sessão expirou. Entre de novo.") {
    super(mensagem);
  }
}

export class SemPermissao extends Error {}

export async function abrirSessao(userId: string): Promise<void> {
  usuarioDaSessao = userId;
}

export async function fecharSessao(): Promise<void> {
  usuarioDaSessao = null;
}

export async function usuarioAtual(): Promise<PlatformUser | null> {
  if (!usuarioDaSessao) return null;
  return getDb().users.find((candidato) => candidato.id === usuarioDaSessao) ?? null;
}

export async function exigirUsuario(): Promise<PlatformUser> {
  const usuario = await usuarioAtual();
  if (!usuario) throw new SemSessao();
  return usuario;
}

export async function exigirProjetos(
  projectId?: string,
): Promise<{ usuario: PlatformUser; projetos: string[] }> {
  const usuario = await exigirUsuario();
  if (!projectId) return { usuario, projetos: usuario.projectIds };
  if (!usuario.projectIds.includes(projectId)) {
    throw new SemPermissao("Você não tem acesso a este projeto.");
  }
  return { usuario, projetos: [projectId] };
}

export async function exigirConta(accountId: string): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  const conta = getDb().accounts.find((candidata) => candidata.id === accountId);
  if (!conta || !usuario.projectIds.includes(conta.projectId)) {
    throw new SemPermissao("Você não tem acesso a esta conta.");
  }
  return usuario;
}

export async function exigirContas(accountIds: string[]): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  const db = getDb();
  for (const accountId of accountIds) {
    const conta = db.accounts.find((candidata) => candidata.id === accountId);
    if (!conta || !usuario.projectIds.includes(conta.projectId)) {
      throw new SemPermissao("Você não tem acesso a uma das contas escolhidas.");
    }
  }
  return usuario;
}

export async function exigirPublicacao(postId: string): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  const post = getDb().posts.find((candidato) => candidato.id === postId);
  if (!post || !usuario.projectIds.includes(post.projectId)) {
    throw new SemPermissao("Você não tem acesso a esta publicação.");
  }
  return usuario;
}

export async function exigirInteracao(itemId: string): Promise<PlatformUser> {
  const item = getDb().inbox.find((candidato) => candidato.id === itemId);
  if (!item) throw new SemPermissao("Interação não encontrada.");
  return exigirConta(item.accountId);
}

export async function exigirImpulsionamento(boostId: string): Promise<PlatformUser> {
  const boost = getDb().boosts.find((candidato) => candidato.id === boostId);
  if (!boost) throw new SemPermissao("Impulsionamento não encontrado.");
  return exigirConta(boost.accountId);
}

export async function exigirRelatorio(reportId: string): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  const report = getDb().reports.find((candidato) => candidato.id === reportId);
  if (!report || !usuario.projectIds.includes(report.projectId)) {
    throw new SemPermissao("Você não tem acesso a este relatório.");
  }
  return usuario;
}

export async function exigirAdministrador(): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  if (usuario.role !== "administrador") {
    throw new SemPermissao("Esta ação é restrita a administradores.");
  }
  return usuario;
}
