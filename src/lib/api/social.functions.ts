import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  buildSeries,
  mergeSeries,
  slicePeriod,
  splitOrganicPaid,
  summarize,
} from "@/lib/social/analytics";
import { getMetaConfig, getWindsorConfig } from "@/lib/config.server";
import {
  consumirState,
  descartarDescoberta,
  guardarDescoberta,
  lerCredencial,
  registrarState,
  removerCredencial,
  revelarToken,
  salvarCredencial,
  temCredencial,
  lerDescoberta,
} from "@/lib/social/credenciais.server";
import { NETWORKS, hasBlockingIssues, statusLabel, validateDraft } from "@/lib/social/networks";
import { aplicarModelo, separarEnviaveis } from "@/lib/social/relacionamento";
import {
  VALORES_ZERADOS,
  aplicarValores,
  atualizacoesDoDia,
  progressoDoDia,
  valoresDe,
  variacaoEntre,
} from "@/lib/social/atualizacao";
import { desserializar, nomeDoArquivo, serializar } from "@/lib/social/snapshot";
import { caminhoDoArquivo } from "@/lib/social/snapshot.server";
import { buscarMidiaPaga, explicarErroWindsor } from "@/lib/social/windsor/cliente.server";
import { CONECTORES_SOCIAIS } from "@/lib/social/windsor/windsor";
import {
  curvaDoPost,
  dividirPorConta,
  itensDaMidia,
  taxaDeEngajamento,
  totalDeInteracoes,
} from "@/lib/social/post-analytics";
import { montarEscopos, montarUrlAutorizacao, type GrupoEscopo } from "@/lib/social/oauth/meta";
import {
  buscarInsights,
  descobrirContas,
  explicarErro,
  gerarState,
  obterTokenLongaDuracao,
  trocarCodigoPorToken,
} from "@/lib/social/oauth/meta.server";
import {
  getDb,
  mesclarMetricas,
  nextId,
  persistir,
  releaseIncoming,
  sortPostsByRecency,
  substituirEstado,
  toDayKey,
} from "@/lib/social/store.server";
import type {
  AtualizacaoManual,
  Boost,
  InboxItem,
  NetworkId,
  PeriodKey,
  Post,
  PostFormat,
  SocialAccount,
} from "@/lib/social/types";

/**
 * API da plataforma social. Tudo que a UI lê ou escreve passa por aqui — os
 * componentes nunca tocam no store diretamente, então trocar o store em memória
 * por um banco (ou pelos conectores oficiais de cada rede) fica restrito à
 * camada de dados.
 */

const periodSchema = z.enum(["7d", "30d", "90d", "12m", "tudo"]).default("30d");
// Os limites reais por rede vivem em `networks.ts` e são reportados como erros
// de validação legíveis; aqui só barramos valores absurdos.
const mediaSchema = z.object({
  count: z.number().int().min(1).max(100),
  aspectRatio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  fileSizeMb: z.number().min(0),
  durationSeconds: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Sessão, projetos e usuários (PRD 3.1 e 3.7)
// ---------------------------------------------------------------------------

/**
 * Autenticação da plataforma. Enquanto não há provedor de identidade, valida o
 * e-mail contra os usuários cadastrados; a senha é aceita em qualquer valor não
 * vazio e nunca é persistida.
 */
export const autenticar = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email(), senha: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const user = db.users.find(
      (candidate) => candidate.email.toLowerCase() === data.email.toLowerCase(),
    );
    if (!user) {
      return { ok: false as const, erro: "E-mail não encontrado nesta organização." };
    }

    user.lastActiveAt = new Date().toISOString();
    return {
      ok: true as const,
      session: {
        user,
        projects: db.projects.filter((project) => user.projectIds.includes(project.id)),
      },
    };
  });

export const listarUsuarios = createServerFn({ method: "POST" }).handler(async () => {
  const db = getDb();
  return { users: db.users, projects: db.projects };
});

export const atualizarUsuario = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string(),
      role: z.enum(["administrador", "gestor", "editor", "atendimento"]).optional(),
      projectIds: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const user = db.users.find((candidate) => candidate.id === data.userId);
    if (!user) throw new Error("Usuário não encontrado.");
    if (data.role) user.role = data.role;
    if (data.projectIds) user.projectIds = data.projectIds;
    return { user };
  });

export const convidarUsuario = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.enum(["administrador", "gestor", "editor", "atendimento"]),
      projectIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    if (db.users.some((user) => user.email.toLowerCase() === data.email.toLowerCase())) {
      return { ok: false as const, erro: "Já existe um usuário com este e-mail." };
    }

    const user = {
      id: nextId("user"),
      name: data.name,
      email: data.email,
      role: data.role,
      projectIds: data.projectIds,
      lastActiveAt: new Date().toISOString(),
      avatarGradient: "linear-gradient(135deg, oklch(0.6 0.18 200), oklch(0.4 0.16 280))",
    };
    db.users.push(user);
    return { ok: true as const, user };
  });

// ---------------------------------------------------------------------------
// Contas conectadas (PRD 3.1)
// ---------------------------------------------------------------------------

function accountsOfProject(projectId: string | undefined): SocialAccount[] {
  const db = getDb();
  return projectId ? db.accounts.filter((account) => account.projectId === projectId) : db.accounts;
}

export const listarContas = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = accountsOfProject(data.projectId);
    return {
      accounts,
      projects: db.projects,
      /** Dias restantes até o token expirar, para o alerta de reconexão. */
      tokenWarnings: accounts
        .filter((account) => account.tokenExpiresAt !== null)
        .map((account) => ({
          accountId: account.id,
          daysToExpire: Math.ceil(
            (new Date(`${account.tokenExpiresAt}T00:00:00`).getTime() - Date.now()) / 86400000,
          ),
        }))
        .filter((warning) => warning.daysToExpire <= 15),
    };
  });

/**
 * Conclui a conexão de um perfil. Em produção este passo recebe o `code` do
 * OAuth oficial da rede e troca por um token de longa duração; aqui o handshake
 * é simulado e a conta entra já sincronizada.
 */
export const conectarConta = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      networkId: z.enum(["instagram", "facebook", "tiktok", "linkedin", "youtube"]),
      handle: z.string().min(2),
      displayName: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const duplicated = db.accounts.some(
      (account) =>
        account.networkId === data.networkId &&
        account.handle.toLowerCase() === data.handle.toLowerCase(),
    );
    if (duplicated) {
      return { ok: false as const, erro: "Este perfil já está conectado." };
    }

    const now = new Date();
    const account: SocialAccount = {
      id: nextId("acc"),
      projectId: data.projectId,
      networkId: data.networkId as NetworkId,
      handle: data.handle,
      displayName: data.displayName,
      status: "ativa",
      origem: "demonstracao",
      adAccountConnected: false,
      trackingSince: toDayKey(now),
      tokenExpiresAt: toDayKey(new Date(now.getTime() + 60 * 86400000)),
      lastSyncAt: now.toISOString(),
      messagingApproved: false,
      avatarGradient: "linear-gradient(135deg, oklch(0.62 0.2 40), oklch(0.4 0.18 300))",
    };

    db.accounts.push(account);
    // Conta nova começa sem histórico: a curva de evolução nasce hoje.
    db.metrics.set(account.id, []);
    db.audience.set(account.id, {
      available: NETWORKS[account.networkId].supportsAudienceInsights,
      unavailableReason: NETWORKS[account.networkId].supportsAudienceInsights
        ? undefined
        : `A API do ${NETWORKS[account.networkId].label} não expõe dados de perfil do público.`,
      newFollowers: 0,
      unfollows: 0,
      topInteractors: [],
      activityByHour: [],
      topCities: [],
    });

    return { ok: true as const, account };
  });

export const atualizarConexao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountId: z.string(),
      acao: z.enum(["reconectar", "desconectar", "sincronizar", "conectar_anuncios"]),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    const now = new Date();
    switch (data.acao) {
      case "reconectar":
        account.status = "ativa";
        account.tokenExpiresAt = toDayKey(new Date(now.getTime() + 60 * 86400000));
        account.lastSyncAt = now.toISOString();
        break;
      case "desconectar":
        // O histórico continua no store: desconectar não apaga métricas (PRD 3.2).
        account.status = "desconectada";
        account.tokenExpiresAt = null;
        break;
      case "sincronizar":
        account.lastSyncAt = now.toISOString();
        break;
      case "conectar_anuncios":
        account.adAccountConnected = true;
        break;
    }

    return { account };
  });

// ---------------------------------------------------------------------------
// Métricas (PRD 3.2)
// ---------------------------------------------------------------------------

function accountSummary(account: SocialAccount, period: PeriodKey) {
  const db = getDb();
  const metrics = db.metrics.get(account.id) ?? [];
  return {
    account,
    summary: summarize(metrics, period),
    series: buildSeries(slicePeriod(metrics, period)),
    split: splitOrganicPaid(slicePeriod(metrics, period)),
    daysTracked: metrics.length,
  };
}

/** Visão consolidada do projeto: todas as contas somadas + destaque por conta. */
export const obterPainel = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), period: periodSchema }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = accountsOfProject(data.projectId);
    const period = data.period as PeriodKey;

    const seriesByAccount = accounts.map((account) =>
      slicePeriod(db.metrics.get(account.id) ?? [], period),
    );
    const merged = mergeSeries(seriesByAccount);

    const posts = db.posts
      .filter((post) => post.accountIds.some((id) => accounts.some((account) => account.id === id)))
      .filter((post) => post.status === "publicado" && post.metrics)
      .sort((a, b) => (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0))
      .slice(0, 5);

    const pendingInbox = db.inbox.filter(
      (item) =>
        item.status === "pendente" && accounts.some((account) => account.id === item.accountId),
    ).length;

    const scheduled = db.posts.filter(
      (post) =>
        (post.status === "agendado" || post.status === "aguardando_aprovacao") &&
        post.accountIds.some((id) => accounts.some((account) => account.id === id)),
    ).length;

    return {
      period,
      accounts: accounts.map((account) => accountSummary(account, period)),
      summary: summarize(merged, "tudo"),
      series: buildSeries(merged),
      split: splitOrganicPaid(merged),
      topPosts: posts,
      pendingInbox,
      scheduled,
      activeBoosts: db.boosts.filter(
        (boost) =>
          boost.status === "ativo" && accounts.some((account) => account.id === boost.accountId),
      ).length,
    };
  });

/** Detalhe de uma conta: curva desde o início, orgânico x pago e público. */
export const obterConta = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accountId: z.string(), period: periodSchema }))
  .handler(async ({ data }) => {
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    const period = data.period as PeriodKey;
    const metrics = db.metrics.get(account.id) ?? [];
    const windowed = slicePeriod(metrics, period);

    return {
      ...accountSummary(account, period),
      /** Curva completa desde o início do acompanhamento, independente do filtro. */
      lifetimeSeries: buildSeries(metrics, 120),
      audience: db.audience.get(account.id) ?? null,
      capabilities: NETWORKS[account.networkId],
      posts: db.posts.filter((post) => post.accountIds.includes(account.id)).slice(0, 8),
      boosts: db.boosts.filter((boost) => boost.accountId === account.id),
      firstDay: metrics[0]?.date ?? null,
      lastDay: metrics[metrics.length - 1]?.date ?? null,
      windowDays: windowed.length,
    };
  });

// ---------------------------------------------------------------------------
// Publicação (PRD 3.3)
// ---------------------------------------------------------------------------

const draftSchema = z.object({
  projectId: z.string(),
  accountIds: z.array(z.string()).min(1),
  format: z.enum(["imagem", "carrossel", "video"]),
  caption: z.string().max(63206),
  media: mediaSchema,
});

/** Valida o rascunho contra os limites de cada rede antes de publicar. */
export const validarRascunho = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountIds: z.array(z.string()),
      format: z.enum(["imagem", "carrossel", "video"]),
      caption: z.string(),
      media: mediaSchema,
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = db.accounts.filter((account) => data.accountIds.includes(account.id));
    const issues = validateDraft(
      { format: data.format as PostFormat, caption: data.caption, media: data.media },
      accounts,
    );
    return { issues, bloqueado: hasBlockingIssues(issues) };
  });

export const listarPublicacoes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = accountsOfProject(data.projectId);
    const accountIds = new Set(accounts.map((account) => account.id));
    return {
      posts: db.posts
        .filter((post) => post.accountIds.some((id) => accountIds.has(id)))
        .sort(sortPostsByRecency),
      accounts,
      users: db.users,
    };
  });

export const criarPublicacao = createServerFn({ method: "POST" })
  .inputValidator(
    draftSchema.extend({
      createdBy: z.string(),
      requiresApproval: z.boolean(),
      scheduledFor: z.string().nullable(),
      /** "agora" publica imediatamente; "rascunho" só salva. */
      acao: z.enum(["publicar", "agendar", "rascunho"]),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = db.accounts.filter((account) => data.accountIds.includes(account.id));
    const issues = validateDraft(
      { format: data.format as PostFormat, caption: data.caption, media: data.media },
      accounts,
    );

    // Rascunho pode ficar inválido; publicar ou agendar, não.
    if (data.acao !== "rascunho" && hasBlockingIssues(issues)) {
      return { ok: false as const, issues };
    }

    const now = new Date();
    const status: Post["status"] =
      data.acao === "rascunho"
        ? "rascunho"
        : data.requiresApproval
          ? "aguardando_aprovacao"
          : data.acao === "publicar"
            ? "publicado"
            : "agendado";

    const post: Post = {
      id: nextId("post"),
      projectId: data.projectId,
      accountIds: data.accountIds,
      format: data.format as PostFormat,
      caption: data.caption,
      media: data.media,
      status,
      scheduledFor: data.acao === "agendar" ? data.scheduledFor : null,
      publishedAt: status === "publicado" ? now.toISOString() : null,
      createdBy: data.createdBy,
      approvedBy: null,
      requiresApproval: data.requiresApproval,
      metrics:
        status === "publicado"
          ? { reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0 }
          : null,
      coverGradient: "linear-gradient(135deg, oklch(0.6 0.2 40), oklch(0.38 0.18 290))",
    };

    db.posts.unshift(post);
    return { ok: true as const, post, issues };
  });

export const atualizarPublicacao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      acao: z.enum(["aprovar", "reprovar", "publicar_agora", "excluir"]),
      userId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const index = db.posts.findIndex((post) => post.id === data.postId);
    if (index === -1) throw new Error("Publicação não encontrada.");
    const post = db.posts[index];

    switch (data.acao) {
      case "aprovar":
        post.approvedBy = data.userId ?? null;
        post.status = post.scheduledFor ? "agendado" : "aprovado";
        break;
      case "reprovar":
        post.approvedBy = null;
        post.status = "rascunho";
        break;
      case "publicar_agora": {
        const accounts = db.accounts.filter((account) => post.accountIds.includes(account.id));
        const issues = validateDraft(
          { format: post.format, caption: post.caption, media: post.media },
          accounts,
        );
        if (hasBlockingIssues(issues)) {
          post.status = "falhou";
          post.failureReason = issues.find((issue) => issue.severity === "erro")?.message;
          return { ok: false as const, post, issues };
        }
        post.status = "publicado";
        post.publishedAt = new Date().toISOString();
        post.scheduledFor = null;
        post.metrics = post.metrics ?? {
          reach: 0,
          impressions: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
        };
        break;
      }
      case "excluir":
        db.posts.splice(index, 1);
        return { ok: true as const, post: null, issues: [] };
    }

    return { ok: true as const, post, issues: [] };
  });

/**
 * Republica uma publicação que já foi ao ar (repost).
 *
 * O que nasce daqui é uma publicação nova, não uma cópia disfarçada: id próprio,
 * métricas zeradas e `republicadoDe` apontando para a original. Sem essa
 * separação, o repost herdaria os números do post antigo e o histórico deixaria
 * de dizer a verdade sobre o que cada peça alcançou.
 *
 * A legenda vem editável de propósito — repetir o texto idêntico é o que a rede
 * lê como conteúdo duplicado.
 */
export const republicarPublicacao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      createdBy: z.string(),
      /** Legenda ajustada; em branco reaproveita a original. */
      caption: z.string().optional(),
      /** Subconjunto das contas originais; em branco republica em todas. */
      accountIds: z.array(z.string()).optional(),
      acao: z.enum(["publicar", "agendar", "rascunho"]),
      scheduledFor: z.string().nullable().default(null),
      requiresApproval: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const original = db.posts.find((candidate) => candidate.id === data.postId);
    if (!original) throw new Error("Publicação não encontrada.");
    if (original.status !== "publicado") {
      return {
        ok: false as const,
        issues: [],
        erro: "Só dá para republicar uma publicação que já foi ao ar.",
      };
    }

    const accountIds =
      data.accountIds && data.accountIds.length > 0
        ? original.accountIds.filter((id) => data.accountIds!.includes(id))
        : original.accountIds;
    if (accountIds.length === 0) {
      return { ok: false as const, issues: [], erro: "Escolha ao menos uma conta de destino." };
    }

    const caption = data.caption?.trim() ? data.caption : original.caption;
    const contas = db.accounts.filter((account) => accountIds.includes(account.id));
    const issues = validateDraft(
      { format: original.format, caption, media: original.media },
      contas,
    );
    if (data.acao !== "rascunho" && hasBlockingIssues(issues)) {
      return { ok: false as const, issues, erro: null };
    }

    const agora = new Date();
    const status: Post["status"] =
      data.acao === "rascunho"
        ? "rascunho"
        : data.requiresApproval
          ? "aguardando_aprovacao"
          : data.acao === "publicar"
            ? "publicado"
            : "agendado";

    const post: Post = {
      ...original,
      id: nextId("post"),
      republicadoDe: original.id,
      accountIds,
      caption,
      status,
      scheduledFor: data.acao === "agendar" ? data.scheduledFor : null,
      publishedAt: status === "publicado" ? agora.toISOString() : null,
      createdBy: data.createdBy,
      approvedBy: null,
      requiresApproval: data.requiresApproval,
      failureReason: undefined,
      // Métricas nunca são herdadas: o alcance do repost é dele.
      metrics:
        status === "publicado"
          ? { reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0 }
          : null,
    };

    db.posts.unshift(post);
    return { ok: true as const, post, issues, erro: null };
  });

// ---------------------------------------------------------------------------
// Impulsionamento (PRD 3.4)
// ---------------------------------------------------------------------------

export const listarImpulsionamentos = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = accountsOfProject(data.projectId);
    const accountIds = new Set(accounts.map((account) => account.id));
    const boosts = db.boosts.filter((boost) => accountIds.has(boost.accountId));

    return {
      boosts: boosts.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      accounts,
      /** Só posts publicados em contas com anúncios ativos podem ser impulsionados. */
      elegiveis: db.posts.filter(
        (post) =>
          post.status === "publicado" &&
          post.accountIds.some((id) => {
            const account = accounts.find((candidate) => candidate.id === id);
            return account?.adAccountConnected && NETWORKS[account.networkId].supportsBoost;
          }),
      ),
      posts: db.posts,
    };
  });

export const criarImpulsionamento = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      accountId: z.string(),
      objective: z.enum(["alcance", "engajamento", "trafego", "mensagens"]),
      budgetTotal: z.number().min(6),
      durationDays: z.number().int().min(1).max(90),
      locations: z.array(z.string()).min(1),
      ageMin: z.number().int().min(13).max(65),
      ageMax: z.number().int().min(13).max(65),
      interests: z.array(z.string()),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    const network = NETWORKS[account.networkId];
    if (!network.supportsBoost) {
      return {
        ok: false as const,
        erro: `O ${network.label} ainda não permite impulsionar pela API.`,
      };
    }
    if (!account.adAccountConnected) {
      return {
        ok: false as const,
        erro: `Conecte a conta de anúncios do ${network.label} para impulsionar publicações.`,
      };
    }
    if (account.status !== "ativa") {
      return { ok: false as const, erro: "A conexão desta conta precisa estar ativa." };
    }
    if (data.ageMax < data.ageMin) {
      return { ok: false as const, erro: "A idade máxima precisa ser maior que a mínima." };
    }

    const now = new Date();
    const boost: Boost = {
      id: nextId("boost"),
      postId: data.postId,
      accountId: data.accountId,
      objective: data.objective,
      budgetTotal: data.budgetTotal,
      durationDays: data.durationDays,
      startedAt: toDayKey(now),
      endsAt: toDayKey(new Date(now.getTime() + data.durationDays * 86400000)),
      // A rede ainda precisa revisar o anúncio antes de veicular.
      status: "em_analise",
      audience: {
        locations: data.locations,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        interests: data.interests,
      },
      results: { spend: 0, reach: 0, impressions: 0, engagement: 0, clicks: 0 },
    };

    db.boosts.unshift(boost);
    return { ok: true as const, boost };
  });

export const encerrarImpulsionamento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ boostId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const boost = db.boosts.find((candidate) => candidate.id === data.boostId);
    if (!boost) throw new Error("Impulsionamento não encontrado.");
    boost.status = "encerrado";
    boost.endsAt = toDayKey(new Date());
    return { boost };
  });

// ---------------------------------------------------------------------------
// Caixa de entrada unificada (PRD 3.5)
// ---------------------------------------------------------------------------

export const listarInbox = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().optional(),
      /** Libera novas interações da fila — usado pelo polling da tela. */
      poll: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const novo: InboxItem | null = data.poll ? releaseIncoming() : null;
    const accounts = accountsOfProject(data.projectId);
    const accountIds = new Set(accounts.map((account) => account.id));

    const items = db.inbox
      .filter((item) => accountIds.has(item.accountId))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

    return {
      items,
      accounts,
      users: db.users,
      novoId: novo && accountIds.has(novo.accountId) ? novo.id : null,
      pendentes: items.filter((item) => item.status === "pendente").length,
    };
  });

export const responderInbox = createServerFn({ method: "POST" })
  .inputValidator(z.object({ itemId: z.string(), texto: z.string().min(1), autor: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const item = db.inbox.find((candidate) => candidate.id === data.itemId);
    if (!item) throw new Error("Interação não encontrada.");

    const account = db.accounts.find((candidate) => candidate.id === item.accountId);
    if (account && account.status !== "ativa") {
      return {
        ok: false as const,
        erro: "A conexão desta conta está inativa; reconecte para responder.",
      };
    }
    if (account && item.kind === "mensagem" && !account.messagingApproved) {
      return {
        ok: false as const,
        erro: `As permissões de mensageria do ${NETWORKS[account.networkId].label} ainda não foram aprovadas para esta conta.`,
      };
    }

    item.replies.push({
      id: nextId("reply"),
      author: data.autor,
      text: data.texto,
      sentAt: new Date().toISOString(),
    });
    item.status = "respondido";
    return { ok: true as const, item };
  });

export const atualizarInbox = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      itemId: z.string(),
      status: z.enum(["pendente", "respondido"]).optional(),
      assignedTo: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const item = db.inbox.find((candidate) => candidate.id === data.itemId);
    if (!item) throw new Error("Interação não encontrada.");
    if (data.status) item.status = data.status;
    if (data.assignedTo !== undefined) item.assignedTo = data.assignedTo;
    return { item };
  });

// ---------------------------------------------------------------------------
// Gerenciamento de relacionamento
// ---------------------------------------------------------------------------

/**
 * Responde várias interações de uma vez, personalizando o texto por pessoa.
 *
 * A checagem de quem pode receber acontece *antes* de qualquer envio: comentário
 * público sempre pode; mensagem direta só dentro da janela de 24h da rede e em
 * conta com mensageria aprovada. O que não passa volta como "ignorado", com o
 * motivo — em vez de virar uma tentativa que a rede recusaria.
 */
export const responderEmLote = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      itemIds: z.array(z.string()).min(1).max(200),
      texto: z.string().min(1),
      autor: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const selecionados = db.inbox.filter((item) => data.itemIds.includes(item.id));
    if (selecionados.length === 0) throw new Error("Nenhuma interação encontrada.");

    const contaPorId = new Map(db.accounts.map((account) => [account.id, account]));

    // Conexão inativa é motivo próprio: não adianta olhar janela nem permissão.
    const comConexao: InboxItem[] = [];
    const ignorados: { itemId: string; motivo: string }[] = [];
    for (const item of selecionados) {
      const account = contaPorId.get(item.accountId);
      if (account && account.status !== "ativa") {
        ignorados.push({
          itemId: item.id,
          motivo: `A conexão com ${NETWORKS[account.networkId].label} está ${statusLabel(account.status)}.`,
        });
        continue;
      }
      comConexao.push(item);
    }

    const mensageriaPorConta: Record<string, boolean> = {};
    for (const account of db.accounts) {
      mensageriaPorConta[account.id] = account.messagingApproved;
    }

    const separacao = separarEnviaveis(comConexao, { agoraMs: Date.now(), mensageriaPorConta });
    ignorados.push(...separacao.ignorados);

    const agora = new Date().toISOString();
    const enviados: { itemId: string; texto: string }[] = [];
    for (const item of comConexao) {
      if (!separacao.enviados.includes(item.id)) continue;
      const texto = aplicarModelo(data.texto, {
        nome: item.authorName,
        handle: item.authorHandle,
      });
      item.replies.push({ id: nextId("reply"), author: data.autor, text: texto, sentAt: agora });
      item.status = "respondido";
      enviados.push({ itemId: item.id, texto });
    }

    return { enviados, ignorados };
  });

/**
 * Ajusta à mão o grau de relação de uma pessoa.
 *
 * Vale para todos os itens do mesmo `@handle`: o grau pertence à pessoa, não à
 * mensagem, e o time que conhece a base sabe mais do que a heurística de
 * volume de interações.
 */
export const classificarPessoa = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      handle: z.string().min(1),
      relacao: z.enum(["nao_seguidor", "seguidor", "apoiador", "defensor"]),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const itens = db.inbox.filter((item) => item.authorHandle === data.handle);
    if (itens.length === 0) throw new Error("Pessoa não encontrada.");
    for (const item of itens) item.relacao = data.relacao;
    return { handle: data.handle, relacao: data.relacao, atualizados: itens.length };
  });

// ---------------------------------------------------------------------------
// Relatórios (PRD 3.6)
// ---------------------------------------------------------------------------

export const listarRelatorios = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    return {
      reports: db.reports
        .filter((report) => !data.projectId || report.projectId === data.projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      accounts: accountsOfProject(data.projectId),
    };
  });

export const gerarRelatorio = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      accountIds: z.array(z.string()).min(1),
      title: z.string().min(1),
      period: periodSchema,
      createdBy: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const merged = mergeSeries(
      data.accountIds.map((id) => slicePeriod(db.metrics.get(id) ?? [], data.period as PeriodKey)),
    );

    const report = {
      id: nextId("rep"),
      projectId: data.projectId,
      accountIds: data.accountIds,
      title: data.title,
      periodStart: merged[0]?.date ?? toDayKey(new Date()),
      periodEnd: merged[merged.length - 1]?.date ?? toDayKey(new Date()),
      createdAt: new Date().toISOString(),
      createdBy: data.createdBy,
      shareToken: Math.random().toString(36).slice(2, 12),
      shareEnabled: false,
    };

    db.reports.unshift(report);
    return { report };
  });

export const alternarCompartilhamento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ reportId: z.string(), enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const report = db.reports.find((candidate) => candidate.id === data.reportId);
    if (!report) throw new Error("Relatório não encontrado.");
    report.shareEnabled = data.enabled;
    return { report };
  });

/** Consumido pela página pública somente leitura — não exige sessão. */
export const obterRelatorioPublico = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const report = db.reports.find((candidate) => candidate.shareToken === data.token);
    if (!report || !report.shareEnabled) {
      return { ok: false as const };
    }

    const accounts = db.accounts.filter((account) => report.accountIds.includes(account.id));
    const merged = mergeSeries(
      report.accountIds.map((id) =>
        (db.metrics.get(id) ?? []).filter(
          (metric) => metric.date >= report.periodStart && metric.date <= report.periodEnd,
        ),
      ),
    );

    const posts = db.posts
      .filter(
        (post) =>
          post.status === "publicado" &&
          post.publishedAt !== null &&
          post.accountIds.some((id) => report.accountIds.includes(id)),
      )
      .sort((a, b) => (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0))
      .slice(0, 5);

    return {
      ok: true as const,
      report,
      project: db.projects.find((project) => project.id === report.projectId) ?? null,
      accounts,
      summary: summarize(merged, "tudo"),
      series: buildSeries(merged),
      split: splitOrganicPaid(merged),
      posts,
      boosts: db.boosts.filter((boost) => report.accountIds.includes(boost.accountId)),
    };
  });

// ---------------------------------------------------------------------------
// Conexão real com a Meta — Facebook e Instagram (PRD 3.1)
// ---------------------------------------------------------------------------

/**
 * Diz à interface se a integração oficial está configurada.
 *
 * Sem as variáveis do app da Meta a plataforma continua utilizável em modo
 * demonstração; a tela de contas explica o que falta em vez de oferecer um
 * botão que não funcionaria.
 */
export const situacaoIntegracao = createServerFn({ method: "POST" }).handler(async () => {
  const config = getMetaConfig();
  const faltando: string[] = [];
  if (!config.appId) faltando.push("META_APP_ID");
  if (!config.appSecret) faltando.push("META_APP_SECRET");
  if (!config.redirectUri) faltando.push("META_REDIRECT_URI");
  if (!config.chaveCriptografia) faltando.push("SOCIAL_CRYPTO_KEY");

  return {
    habilitada: config.habilitada && Boolean(config.chaveCriptografia),
    faltando,
    redirectUri: config.redirectUri ?? null,
  };
});

const gruposEscopo = z
  .array(z.enum(["leitura", "publicacao", "atendimento", "anuncios"]))
  .min(1)
  .default(["leitura", "publicacao", "atendimento"]);

/**
 * Passo 1 do "Conectar com Facebook": devolve a URL do diálogo oficial.
 *
 * A pessoa autoriza na página da Meta e volta para `META_REDIRECT_URI`. Nenhuma
 * senha passa pela plataforma — é a própria Meta que autentica.
 */
export const iniciarConexaoMeta = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string(), grupos: gruposEscopo }))
  .handler(async ({ data }) => {
    const config = getMetaConfig();
    if (!config.habilitada || !config.appId || !config.redirectUri) {
      return {
        modo: "demonstracao" as const,
        erro: "A integração com a Meta ainda não foi configurada neste ambiente.",
      };
    }
    if (!config.chaveCriptografia) {
      return {
        modo: "demonstracao" as const,
        erro: "Defina SOCIAL_CRYPTO_KEY antes de conectar contas reais — o token precisa ser cifrado.",
      };
    }

    const escopos = montarEscopos(data.grupos as GrupoEscopo[]);
    const state = gerarState();
    registrarState({ state, projectId: data.projectId, escopos });

    return {
      modo: "oauth" as const,
      url: montarUrlAutorizacao({
        appId: config.appId,
        redirectUri: config.redirectUri,
        state,
        escopos,
        versaoGraph: config.versaoGraph,
      }),
    };
  });

/**
 * Passo 2: a Meta devolveu o `code`. Trocamos por um token de longa duração e
 * listamos as contas que a pessoa administra, para ela escolher quais conectar.
 *
 * Os tokens ficam no servidor: a interface recebe apenas nome, @ e rede.
 */
export const concluirConexaoMeta = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string().min(1), state: z.string().min(1) }))
  .handler(async ({ data }) => {
    const config = getMetaConfig();
    if (!config.habilitada || !config.appId || !config.appSecret || !config.redirectUri) {
      return { ok: false as const, erro: "A integração com a Meta não está configurada." };
    }

    const pedido = consumirState(data.state);
    if (!pedido) {
      return {
        ok: false as const,
        erro: "Este pedido de autorização expirou ou não foi reconhecido. Comece a conexão de novo.",
      };
    }

    const credenciaisMeta = {
      appId: config.appId,
      appSecret: config.appSecret,
      redirectUri: config.redirectUri,
      versaoGraph: config.versaoGraph,
    };

    try {
      const tokenCurto = await trocarCodigoPorToken(credenciaisMeta, data.code);
      const { token, expiraEm } = await obterTokenLongaDuracao(credenciaisMeta, tokenCurto);
      const contas = await descobrirContas(credenciaisMeta, token);

      if (contas.length === 0) {
        return {
          ok: false as const,
          erro:
            "Nenhuma Página encontrada nesta conta. O Instagram precisa ser profissional e estar " +
            "vinculado a uma Página do Facebook que você administre.",
        };
      }

      const db = getDb();
      const descobertaId = nextId("desc");
      guardarDescoberta({
        id: descobertaId,
        projectId: pedido.projectId,
        escopos: pedido.escopos,
        contas: contas.map((conta) => ({
          ...conta,
          // A validade do token de usuário acompanha as contas descobertas.
          accessToken: conta.accessToken,
        })),
      });

      return {
        ok: true as const,
        descobertaId,
        expiraEmSegundos: expiraEm,
        contas: contas.map((conta) => ({
          externalId: conta.externalId,
          networkId: conta.networkId,
          displayName: conta.displayName,
          handle: conta.handle,
          jaConectada: db.accounts.some(
            (existente) =>
              existente.externalId === conta.externalId && existente.projectId === pedido.projectId,
          ),
        })),
      };
    } catch (erro) {
      console.error("Falha ao concluir a conexão com a Meta:", erro);
      return { ok: false as const, erro: explicarErro(erro) };
    }
  });

/** Passo 3: grava as contas escolhidas e guarda cada token cifrado. */
export const conectarContasEscolhidas = createServerFn({ method: "POST" })
  .inputValidator(z.object({ descobertaId: z.string(), externalIds: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    const descoberta = lerDescoberta(data.descobertaId);
    if (!descoberta) {
      return {
        ok: false as const,
        erro: "A escolha expirou. Refaça a conexão para listar as contas de novo.",
      };
    }

    const db = getDb();
    const agora = new Date();
    const conectadas: SocialAccount[] = [];

    for (const externalId of data.externalIds) {
      const conta = descoberta.contas.find((candidata) => candidata.externalId === externalId);
      if (!conta) continue;

      const jaExiste = db.accounts.find(
        (existente) =>
          existente.externalId === externalId && existente.projectId === descoberta.projectId,
      );

      const registro: SocialAccount = jaExiste ?? {
        id: nextId("acc"),
        projectId: descoberta.projectId,
        networkId: conta.networkId,
        handle: conta.handle,
        displayName: conta.displayName,
        status: "ativa",
        origem: "oauth",
        externalId,
        adAccountConnected: descoberta.escopos.includes("ads_management"),
        // Conta nova começa a acompanhar hoje; a sincronização traz o histórico
        // que a rede permitir e a curva cresce a partir daí.
        trackingSince: toDayKey(agora),
        tokenExpiresAt: toDayKey(new Date(agora.getTime() + 60 * 86400000)),
        lastSyncAt: null,
        messagingApproved: descoberta.escopos.includes("pages_messaging"),
        avatarGradient: "linear-gradient(135deg, oklch(0.62 0.2 40), oklch(0.4 0.18 300))",
      };

      // Reconexão: a conta volta a ficar ativa e mantém o histórico já guardado.
      registro.status = "ativa";
      registro.origem = "oauth";
      registro.handle = conta.handle;
      registro.displayName = conta.displayName;
      registro.tokenExpiresAt = toDayKey(new Date(agora.getTime() + 60 * 86400000));

      if (!jaExiste) {
        db.accounts.push(registro);
        db.metrics.set(registro.id, []);
        db.audience.set(registro.id, {
          available: false,
          unavailableReason:
            "Os dados de público aparecem depois da primeira sincronização com a rede.",
          newFollowers: 0,
          unfollows: 0,
          topInteractors: [],
          activityByHour: [],
          topCities: [],
        });
      }

      salvarCredencial({
        accountId: registro.id,
        externalId,
        instagramId: conta.instagramId,
        token: conta.accessToken,
        expiraEm: null,
        escopos: descoberta.escopos,
      });

      conectadas.push(registro);
    }

    descartarDescoberta(data.descobertaId);

    if (conectadas.length === 0) {
      return { ok: false as const, erro: "Nenhuma conta foi selecionada." };
    }
    return { ok: true as const, contas: conectadas };
  });

/**
 * Sincroniza uma conta conectada de verdade com a Graph API.
 *
 * Contas de demonstração não têm credencial e continuam com os dados semeados —
 * a tela avisa em vez de fingir que buscou.
 */
export const sincronizarContaReal = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ accountId: z.string(), dias: z.number().int().min(1).max(30).default(28) }),
  )
  .handler(async ({ data }) => {
    const config = getMetaConfig();
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    if (!temCredencial(account.id) || !config.habilitada || !config.appId || !config.appSecret) {
      return {
        ok: false as const,
        erro: "Esta conta não tem conexão real. Conecte pela Meta para sincronizar dados de verdade.",
      };
    }

    const credencial = lerCredencial(account.id)!;
    const token = revelarToken(account.id);
    if (!token) {
      return { ok: false as const, erro: "Credencial ausente; reconecte a conta." };
    }

    const ate = new Date();
    const desde = new Date(ate.getTime() - data.dias * 86400000);

    try {
      const metricas = await buscarInsights(
        {
          appId: config.appId,
          appSecret: config.appSecret,
          redirectUri: config.redirectUri!,
          versaoGraph: config.versaoGraph,
        },
        {
          externalId: credencial.externalId,
          instagramId: credencial.instagramId,
          accessToken: token,
        },
        { desde: toDayKey(desde), ate: toDayKey(ate) },
      );

      const gravados = mesclarMetricas(account.id, metricas);
      account.lastSyncAt = new Date().toISOString();
      account.status = "ativa";

      return { ok: true as const, dias: gravados, account };
    } catch (erro) {
      console.error(`Falha ao sincronizar ${account.id}:`, erro);
      // Token revogado é estado da conexão, não erro passageiro.
      account.status = String(erro).includes("190") ? "expirada" : account.status;
      return { ok: false as const, erro: explicarErro(erro) };
    }
  });

/** Desconectar remove a credencial, mas preserva o histórico já sincronizado. */
export const desconectarContaReal = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accountId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    removerCredencial(account.id);
    account.status = "desconectada";
    account.tokenExpiresAt = null;
    return { ok: true as const, account };
  });

/**
 * Detalhe de uma publicação: a mídia, o resultado por conta, a curva dos
 * primeiros dias, os impulsionamentos e as interações que ela gerou.
 *
 * Reúne num só lugar o que hoje está espalhado entre listas — é a tela para
 * responder "por que este post foi bem?" sem trocar de aba.
 */
export const obterPublicacao = createServerFn({ method: "POST" })
  .inputValidator(z.object({ postId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const post = db.posts.find((candidate) => candidate.id === data.postId);
    if (!post) return { ok: false as const };

    const contas = db.accounts.filter((account) => post.accountIds.includes(account.id));
    const autor = db.users.find((user) => user.id === post.createdBy) ?? null;
    const aprovador = post.approvedBy
      ? (db.users.find((user) => user.id === post.approvedBy) ?? null)
      : null;

    const porConta = dividirPorConta(post);

    // Linha do tempo do post: o que aconteceu, em ordem.
    const etapas: { rotulo: string; quando: string | null; concluida: boolean }[] = [
      { rotulo: "Criado", quando: null, concluida: true },
      {
        rotulo: post.requiresApproval ? "Aprovado" : "Aprovação dispensada",
        quando: null,
        concluida: post.approvedBy !== null || !post.requiresApproval,
      },
      {
        rotulo: post.scheduledFor ? "Agendado" : "Sem agendamento",
        quando: post.scheduledFor,
        concluida: Boolean(post.scheduledFor),
      },
      { rotulo: "Publicado", quando: post.publishedAt, concluida: post.status === "publicado" },
    ];

    const boosts = db.boosts.filter((boost) => boost.postId === post.id);

    return {
      ok: true as const,
      post,
      contas,
      autor,
      aprovador,
      itensMidia: itensDaMidia(post),
      porConta,
      curva: curvaDoPost(post, 10),
      interacoes: post.metrics ? totalDeInteracoes(post.metrics) : 0,
      taxaEngajamento: post.metrics ? taxaDeEngajamento(post.metrics) : 0,
      etapas,
      boosts,
      /** Comentários e mensagens que citam esta publicação (PRD 3.5). */
      inbox: db.inbox
        .filter((item) => item.postId === post.id)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
      capacidades: contas.map((conta) => ({
        accountId: conta.id,
        rede: NETWORKS[conta.networkId].label,
        limiteLegenda: NETWORKS[conta.networkId].captionMaxLength,
      })),
      /** Se a conta é real, os números vêm da rede; se não, são de demonstração. */
      dadosReais: contas.some((conta) => conta.origem === "oauth"),
      /** A publicação de onde este repost nasceu, quando for o caso. */
      original: post.republicadoDe
        ? (db.posts.find((candidate) => candidate.id === post.republicadoDe) ?? null)
        : null,
      /** Reposts já criados a partir desta publicação. */
      reposts: db.posts
        .filter((candidate) => candidate.republicadoDe === post.id)
        .sort(sortPostsByRecency),
    };
  });

// ---------------------------------------------------------------------------
// Windsor.ai — mídia paga real sem depender da revisão da Meta
// ---------------------------------------------------------------------------

const periodoWindsor = z
  .enum(["last_7d", "last_30d", "last_90d", "last_6m", "last_year", "last_2years"])
  .default("last_90d");

export const situacaoWindsor = createServerFn({ method: "POST" }).handler(async () => {
  const config = getWindsorConfig();
  return {
    habilitada: config.habilitada,
    conectores: Object.entries(CONECTORES_SOCIAIS).map(([id, meta]) => ({ id, ...meta })),
  };
});

/**
 * Campanhas reais de mídia paga, vindas do Windsor.
 *
 * Devolve o que o gestor olha primeiro — investido, alcance, CPM, CPC — sem
 * exigir que a plataforma tenha aprovação da Meta para anúncios.
 */
export const listarCampanhasWindsor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ conector: z.string().default("facebook"), periodo: periodoWindsor }))
  .handler(async ({ data }) => {
    const config = getWindsorConfig();
    if (!config.habilitada || !config.apiKey) {
      return {
        ok: false as const,
        erro: "Defina WINDSOR_API_KEY para ler as contas conectadas no Windsor.ai.",
      };
    }

    try {
      const resultado = await buscarMidiaPaga(
        { apiKey: config.apiKey, baseUrl: config.baseUrl },
        data.conector,
        data.periodo,
      );

      return {
        ok: true as const,
        conector: data.conector,
        periodo: data.periodo,
        campanhas: resultado.campanhas.slice(0, 50),
        totais: resultado.totais,
        contasDeAnuncio: resultado.contasDeAnuncio,
        dias: resultado.dias,
      };
    } catch (erro) {
      console.error("Falha ao ler o Windsor.ai:", erro);
      return { ok: false as const, erro: explicarErroWindsor(erro) };
    }
  });

/**
 * Traz a mídia paga do Windsor para o histórico de uma conta da plataforma.
 *
 * Preenche apenas os campos pagos; o orgânico continua vindo da rede. Manter as
 * duas origens separadas é o que sustenta o comparativo do PRD 3.2.
 */
export const sincronizarPagoWindsor = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountId: z.string(),
      conector: z.string().default("facebook"),
      periodo: periodoWindsor,
    }),
  )
  .handler(async ({ data }) => {
    const config = getWindsorConfig();
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    if (!config.habilitada || !config.apiKey) {
      return { ok: false as const, erro: "WINDSOR_API_KEY não está configurada." };
    }

    try {
      const { dias } = await buscarMidiaPaga(
        { apiKey: config.apiKey, baseUrl: config.baseUrl },
        data.conector,
        data.periodo,
      );

      if (dias.length === 0) {
        return {
          ok: false as const,
          erro: "O Windsor não devolveu veiculação neste período para o conector escolhido.",
        };
      }

      // Mescla preservando o orgânico já guardado em cada dia.
      const atuais = db.metrics.get(account.id) ?? [];
      const porData = new Map(atuais.map((dia) => [dia.date, dia]));

      for (const dia of dias) {
        const existente = porData.get(dia.date);
        if (existente) {
          existente.paidReach = dia.paidReach;
          existente.paidImpressions = dia.paidImpressions;
          existente.adSpend = dia.adSpend;
        } else {
          porData.set(dia.date, dia);
        }
      }

      db.metrics.set(
        account.id,
        [...porData.values()].sort((a, b) => a.date.localeCompare(b.date)),
      );
      account.lastSyncAt = new Date().toISOString();

      return { ok: true as const, dias: dias.length, account };
    } catch (erro) {
      console.error(`Falha ao sincronizar ${account.id} pelo Windsor:`, erro);
      return { ok: false as const, erro: explicarErroWindsor(erro) };
    }
  });

// ---------------------------------------------------------------------------
// Atualização manual dos números
// ---------------------------------------------------------------------------

const valoresSchema = z.object({
  followers: z.number().int().min(0),
  organicReach: z.number().int().min(0),
  paidReach: z.number().int().min(0),
  organicImpressions: z.number().int().min(0),
  paidImpressions: z.number().int().min(0),
  organicEngagement: z.number().int().min(0),
  paidEngagement: z.number().int().min(0),
  adSpend: z.number().min(0),
});

/**
 * O que a tela de atualização precisa saber: contas do projeto, o que já foi
 * registrado hoje e onde os dados estão guardados.
 */
export const situacaoAtualizacao = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), date: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = accountsOfProject(data.projectId);
    const hoje = data.date ?? toDayKey(new Date());

    const porConta = contas.map((conta) => {
      const registros = atualizacoesDoDia(db.atualizacoes, conta.id, hoje);
      const serie = db.metrics.get(conta.id) ?? [];
      const doDia = serie.find((dia) => dia.date === hoje);
      const ultimoDiaAnterior = serie.filter((dia) => dia.date < hoje).at(-1);

      return {
        accountId: conta.id,
        registros,
        progresso: progressoDoDia(registros),
        // Pré-preenche com o que já existe: quem atualiza três vezes por dia só
        // deve digitar o que mudou desde a leitura anterior.
        valores: doDia
          ? valoresDe(doDia)
          : ultimoDiaAnterior
            ? valoresDe(ultimoDiaAnterior)
            : VALORES_ZERADOS,
        temDoDia: Boolean(doDia),
      };
    });

    return {
      contas,
      date: hoje,
      porConta,
      arquivo: caminhoDoArquivo(),
      totalRegistros: db.atualizacoes.length,
    };
  });

/**
 * Registra uma leitura manual.
 *
 * Grava o arquivo em seguida, porque a alternativa é o usuário digitar quinze
 * campos, fechar o navegador e perder tudo — o passo que ele esqueceria é
 * justamente o que não pode depender dele.
 */
export const registrarAtualizacao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD."),
      autor: z.string(),
      valores: valoresSchema,
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const conta = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!conta) throw new Error("Conta não encontrada.");

    const anteriores = atualizacoesDoDia(db.atualizacoes, data.accountId, data.date);
    const anterior = anteriores.at(-1);

    const registro: AtualizacaoManual = {
      id: nextId("atual"),
      accountId: data.accountId,
      date: data.date,
      registradaEm: new Date().toISOString(),
      autor: data.autor,
      valores: data.valores,
    };

    db.atualizacoes.push(registro);
    db.metrics.set(
      data.accountId,
      aplicarValores(db.metrics.get(data.accountId) ?? [], data.date, data.valores),
    );
    conta.lastSyncAt = registro.registradaEm;

    const gravacao = persistir();

    return {
      registro,
      // O que mudou desde a leitura anterior do mesmo dia — é o que dá sentido
      // a atualizar mais de uma vez.
      variacoes: anterior ? variacaoEntre(anterior.valores, data.valores) : [],
      progresso: progressoDoDia([...anteriores, registro]),
      gravacao,
    };
  });

/** Devolve o arquivo inteiro para download — o que vai para o commit. */
export const exportarDados = createServerFn({ method: "POST" }).handler(async () => {
  const db = getDb();
  return { conteudo: serializar(db), nome: nomeDoArquivo() };
});

/** Carrega um arquivo enviado pela tela, substituindo o estado atual. */
export const importarDados = createServerFn({ method: "POST" })
  .inputValidator(z.object({ conteudo: z.string().min(1) }))
  .handler(async ({ data }) => {
    try {
      const estado = desserializar(data.conteudo);
      substituirEstado(estado);
      const gravacao = persistir();
      return {
        ok: true as const,
        contas: estado.accounts.length,
        atualizacoes: estado.atualizacoes.length,
        gravacao,
      };
    } catch (erro) {
      return {
        ok: false as const,
        erro: erro instanceof Error ? erro.message : "Não foi possível ler o arquivo.",
      };
    }
  });

// ---------------------------------------------------------------------------
// Detalhamento de um dia (ou de um grupo de dias) por canal
// ---------------------------------------------------------------------------

/**
 * Abre um ponto do gráfico: o que cada canal fez naquele intervalo.
 *
 * O gráfico agrupa dias quando o período é longo, então a entrada é um
 * intervalo, não um dia. Com `inicio === fim` o resultado é o dia exato; com
 * uma faixa, cada canal vem somado dentro dela — que é o que a barra clicada
 * de fato representa.
 */
export const detalharPeriodo = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().optional(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = accountsOfProject(data.projectId);
    const [inicio, fim] =
      data.inicio <= data.fim ? [data.inicio, data.fim] : [data.fim, data.inicio];
    const dentro = (date: string) => date >= inicio && date <= fim;

    const canais = contas
      .map((conta) => {
        const dias = (db.metrics.get(conta.id) ?? []).filter((dia) => dentro(dia.date));
        const soma = dias.reduce(
          (acumulado, dia) => ({
            organicReach: acumulado.organicReach + dia.organicReach,
            paidReach: acumulado.paidReach + dia.paidReach,
            organicImpressions: acumulado.organicImpressions + dia.organicImpressions,
            paidImpressions: acumulado.paidImpressions + dia.paidImpressions,
            organicEngagement: acumulado.organicEngagement + dia.organicEngagement,
            paidEngagement: acumulado.paidEngagement + dia.paidEngagement,
            adSpend: acumulado.adSpend + dia.adSpend,
            followersGained: acumulado.followersGained + dia.followersGained,
            followersLost: acumulado.followersLost + dia.followersLost,
          }),
          {
            organicReach: 0,
            paidReach: 0,
            organicImpressions: 0,
            paidImpressions: 0,
            organicEngagement: 0,
            paidEngagement: 0,
            adSpend: 0,
            followersGained: 0,
            followersLost: 0,
          },
        );

        const ultimo = dias.at(-1);
        const alcance = soma.organicReach + soma.paidReach;
        const engajamento = soma.organicEngagement + soma.paidEngagement;

        return {
          conta,
          /** Sem linha no intervalo, o canal aparece como "sem dado" em vez de zerado. */
          temDado: dias.length > 0,
          dias,
          soma: { ...soma, adSpend: Math.round(soma.adSpend * 100) / 100 },
          alcance,
          engajamento,
          /** Seguidores no fim do intervalo — é um estoque, não se soma. */
          followers: ultimo?.followers ?? null,
          taxaEngajamento: alcance > 0 ? engajamento / alcance : 0,
          publicacoes: db.posts
            .filter(
              (post) =>
                post.accountIds.includes(conta.id) &&
                post.publishedAt !== null &&
                dentro(post.publishedAt.slice(0, 10)),
            )
            .sort(sortPostsByRecency),
          impulsionamentos: db.boosts.filter(
            (boost) =>
              boost.accountId === conta.id && boost.startedAt <= fim && boost.endsAt >= inicio,
          ),
          interacoes: db.inbox.filter(
            (item) => item.accountId === conta.id && dentro(item.receivedAt.slice(0, 10)),
          ).length,
          /** Leituras manuais do intervalo — mostra de onde vieram os números. */
          leituras: db.atualizacoes
            .filter((registro) => registro.accountId === conta.id && dentro(registro.date))
            .sort((a, b) => a.registradaEm.localeCompare(b.registradaEm)),
        };
      })
      .sort((a, b) => b.alcance - a.alcance);

    const totais = canais.reduce(
      (acumulado, canal) => ({
        alcance: acumulado.alcance + canal.alcance,
        organico: acumulado.organico + canal.soma.organicReach,
        pago: acumulado.pago + canal.soma.paidReach,
        engajamento: acumulado.engajamento + canal.engajamento,
        investido: acumulado.investido + canal.soma.adSpend,
        publicacoes: acumulado.publicacoes + canal.publicacoes.length,
      }),
      { alcance: 0, organico: 0, pago: 0, engajamento: 0, investido: 0, publicacoes: 0 },
    );

    return {
      inicio,
      fim,
      canais,
      totais: { ...totais, investido: Math.round(totais.investido * 100) / 100 },
    };
  });
