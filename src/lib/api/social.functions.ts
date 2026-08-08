import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  buildSeries,
  mergeSeries,
  slicePeriod,
  splitOrganicPaid,
  summarize,
} from "@/lib/social/analytics";
import { getMetaConfig } from "@/lib/config.server";
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
import { NETWORKS, hasBlockingIssues, validateDraft } from "@/lib/social/networks";
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
  releaseIncoming,
  sortPostsByRecency,
  toDayKey,
} from "@/lib/social/store.server";
import type {
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
      networkId: z.enum(["instagram", "facebook", "tiktok", "linkedin"]),
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
