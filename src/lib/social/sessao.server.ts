// O helper do TanStack Start se chama `useSession`, mas não é um hook de React:
// roda no servidor, dentro de uma requisição. O apelido evita que as regras de
// hooks o confundam com um — e diz melhor o que ele faz.
import { useSession as abrirCofreDaRequisicao } from "@tanstack/react-start/server";

import { getDb } from "./store.server";
import type { PlatformUser } from "./types";

/**
 * Sessão do servidor.
 *
 * Antes, quem estava logado e a qual projeto tinha acesso era decidido pelo
 * navegador: a sessão vivia no `localStorage` e o `projectId` chegava como
 * parâmetro. Qualquer pessoa capaz de chamar a API pedia os dados de outro
 * cliente. Aqui isso muda de lado — o servidor lê a sessão de um cookie que ele
 * mesmo assinou e decide sozinho.
 *
 * O cookie é **selado**: cifrado e com verificação de integridade, `httpOnly` (o
 * JavaScript da página não lê) e `sameSite: lax` (não viaja em requisição vinda
 * de outro site). O conteúdo é só o id do usuário; tudo o mais é buscado no
 * banco a cada chamada, para que trocar o papel de alguém tenha efeito na hora
 * em vez de esperar a sessão expirar.
 */

const NOME_DO_COOKIE = "ampliacao_sessao";

/** Trinta dias — longo o bastante para não irritar, curto o bastante para expirar. */
const DURACAO_SEGUNDOS = 60 * 60 * 24 * 30;

export class SemSessao extends Error {
  constructor(mensagem = "Sua sessão expirou. Entre de novo.") {
    super(mensagem);
  }
}

export class SemPermissao extends Error {}

/**
 * A chave que sela o cookie.
 *
 * Em produção vem do ambiente. Sem ela, a aplicação usa uma chave derivada de
 * um valor fixo — o que é aceitável apenas na demonstração, onde não há dado de
 * cliente, e por isso o aviso aparece no log de quem subir sem configurar.
 */
function chaveDaSessao(): string {
  const doAmbiente = process.env.SESSION_SECRET?.trim();
  if (doAmbiente && doAmbiente.length >= 32) return doAmbiente;

  if (doAmbiente) {
    console.warn("SESSION_SECRET tem menos de 32 caracteres e foi ignorada.");
  }
  if (process.env.DATABASE_URL) {
    console.warn(
      "SESSION_SECRET não configurada. Defina-a: sem ela, as sessões continuam válidas depois de um deploy e qualquer cópia do código consegue forjar uma.",
    );
  }
  return "ampliacao-demonstracao-chave-de-sessao-sem-valor";
}

/**
 * O cookie exige HTTPS?
 *
 * Em desenvolvimento, não: o endereço é http://localhost e exigir TLS ali
 * impediria o cookie de ser gravado — o login pareceria simplesmente não
 * funcionar, sem erro nenhum.
 *
 * Na build de produção, sim, e é uma decisão do **build**, não da execução: o
 * Vite substitui `process.env.NODE_ENV` por "production" ao empacotar, então
 * este valor vira uma constante dentro do pacote. É o comportamento certo —
 * sessão trafegando em claro é sessão roubável na primeira rede aberta.
 *
 * A consequência prática precisa ser dita: **servir a build de produção em
 * http puro quebra o login em silêncio**. O navegador não devolve um cookie
 * `Secure` por http, e cada ação responde "sua sessão expirou" sem qualquer
 * pista da causa.
 *
 * `SESSAO_SEM_TLS=sim` desliga a exigência, com aviso no log. Existe por um
 * motivo específico: conferir a build de produção na própria máquina antes de
 * publicá-la. Não é para servidor de verdade — daí o aviso ser barulhento.
 */
function exigirTls(): boolean {
  const empacotadoParaProducao = process.env.NODE_ENV === "production";
  if (!empacotadoParaProducao) return false;

  if (process.env.SESSAO_SEM_TLS === "sim") {
    console.warn(
      "SESSAO_SEM_TLS=sim: o cookie de sessão está sendo emitido sem exigir HTTPS. Use isto só para conferir a build na própria máquina — em servidor exposto, a sessão trafega em claro.",
    );
    return false;
  }
  return true;
}

function configuracao() {
  return {
    name: NOME_DO_COOKIE,
    password: chaveDaSessao(),
    maxAge: DURACAO_SEGUNDOS,
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: exigirTls(),
    },
  };
}

type DadosDaSessao = { userId?: string; entrouEm?: number };

export async function abrirSessao(userId: string): Promise<void> {
  const sessao = await abrirCofreDaRequisicao<DadosDaSessao>(configuracao());
  await sessao.update({ userId, entrouEm: Date.now() });
}

export async function fecharSessao(): Promise<void> {
  const sessao = await abrirCofreDaRequisicao<DadosDaSessao>(configuracao());
  await sessao.clear();
}

/**
 * Quem está autenticado nesta requisição, ou `null`.
 *
 * O usuário é relido do banco a cada chamada de propósito: se um administrador
 * mudar o papel de alguém, ou tirar o acesso a um projeto, o efeito é imediato.
 * Guardar isso dentro do cookie faria a mudança só valer depois da expiração.
 */
export async function usuarioAtual(): Promise<PlatformUser | null> {
  const sessao = await abrirCofreDaRequisicao<DadosDaSessao>(configuracao());
  const userId = sessao.data.userId;
  if (!userId) return null;

  const usuario = getDb().users.find((candidato) => candidato.id === userId);
  if (!usuario) {
    // Usuário removido enquanto a sessão vivia: o cookie deixa de valer.
    await sessao.clear();
    return null;
  }
  return usuario;
}

export async function exigirUsuario(): Promise<PlatformUser> {
  const usuario = await usuarioAtual();
  if (!usuario) throw new SemSessao();
  return usuario;
}

/**
 * Confirma que quem está pedindo pode ver o projeto — e devolve qual usar.
 *
 * Sem `projectId`, devolve os projetos do usuário. Com ele, exige que esteja
 * entre os que a pessoa tem acesso. É esta função que fecha o buraco: nenhuma
 * função de servidor pode mais aceitar um projeto só porque ele veio escrito na
 * requisição.
 */
export async function exigirProjetos(projectId?: string): Promise<{
  usuario: PlatformUser;
  projetos: string[];
}> {
  const usuario = await exigirUsuario();

  if (!projectId) {
    return { usuario, projetos: usuario.projectIds };
  }

  if (!usuario.projectIds.includes(projectId)) {
    throw new SemPermissao("Você não tem acesso a este projeto.");
  }
  return { usuario, projetos: [projectId] };
}

/**
 * Confirma acesso a uma conta social pelo projeto a que ela pertence.
 *
 * Muitas funções recebem `accountId` em vez de `projectId` — e uma conta sem
 * dono verificado é a mesma brecha por outra porta.
 */
export async function exigirConta(accountId: string): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  const conta = getDb().accounts.find((candidata) => candidata.id === accountId);
  if (!conta || !usuario.projectIds.includes(conta.projectId)) {
    throw new SemPermissao("Você não tem acesso a esta conta.");
  }
  return usuario;
}

/** Confirma acesso a uma publicação, pelo projeto dela. */
export async function exigirPublicacao(postId: string): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  const post = getDb().posts.find((candidato) => candidato.id === postId);
  if (!post || !usuario.projectIds.includes(post.projectId)) {
    throw new SemPermissao("Você não tem acesso a esta publicação.");
  }
  return usuario;
}

/** Confirma acesso a uma interação da caixa, pela conta dela. */
export async function exigirInteracao(itemId: string): Promise<PlatformUser> {
  const item = getDb().inbox.find((candidato) => candidato.id === itemId);
  if (!item) throw new SemPermissao("Interação não encontrada.");
  return exigirConta(item.accountId);
}

/** Confirma acesso a um conjunto de contas — usado por quem recebe `accountIds`. */
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

/** Confirma acesso a um impulsionamento, pela conta dele. */
export async function exigirImpulsionamento(boostId: string): Promise<PlatformUser> {
  const boost = getDb().boosts.find((candidato) => candidato.id === boostId);
  if (!boost) throw new SemPermissao("Impulsionamento não encontrado.");
  return exigirConta(boost.accountId);
}

/** Confirma acesso a um relatório, pelo projeto dele. */
export async function exigirRelatorio(reportId: string): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  const report = getDb().reports.find((candidato) => candidato.id === reportId);
  if (!report || !usuario.projectIds.includes(report.projectId)) {
    throw new SemPermissao("Você não tem acesso a este relatório.");
  }
  return usuario;
}

/** Só administrador. Usado no que mexe em gente e permissões. */
export async function exigirAdministrador(): Promise<PlatformUser> {
  const usuario = await exigirUsuario();
  if (usuario.role !== "administrador") {
    throw new SemPermissao("Esta ação é restrita a administradores.");
  }
  return usuario;
}
