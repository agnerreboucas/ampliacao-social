import { NETWORKS } from "./networks";
import type {
  AudienceInsight,
  Boost,
  DailyMetric,
  InboxItem,
  PlatformUser,
  Post,
  Project,
  Report,
  SocialAccount,
} from "./types";

/**
 * Camada de persistência da plataforma social.
 *
 * Hoje é um store em memória com dados semeados de forma determinística: não há
 * banco nem credenciais das APIs oficiais neste ambiente. Toda leitura e escrita
 * do produto passa por este módulo, então trocá-lo por um banco real (ou pelos
 * conectores OAuth de cada rede) não exige mudança nas rotas nem nos componentes.
 *
 * O sufixo `.server.ts` garante que nada daqui vaze para o bundle do cliente.
 */

export type SocialDatabase = {
  projects: Project[];
  users: PlatformUser[];
  accounts: SocialAccount[];
  /** Histórico diário por conta, preservado mesmo com a conta desconectada. */
  metrics: Map<string, DailyMetric[]>;
  audience: Map<string, AudienceInsight>;
  posts: Post[];
  boosts: Boost[];
  inbox: InboxItem[];
  reports: Report[];
  /** Fila de interações que ainda vão "chegar" — alimenta o tempo real da inbox. */
  incomingQueue: InboxItem[];
  lastIncomingAt: number;
};

const GRADIENTS = [
  "linear-gradient(135deg, oklch(0.55 0.22 30), oklch(0.35 0.18 280))",
  "linear-gradient(135deg, oklch(0.45 0.2 260), oklch(0.72 0.18 200))",
  "linear-gradient(135deg, oklch(0.65 0.2 80), oklch(0.4 0.22 320))",
  "linear-gradient(135deg, oklch(0.7 0.2 150), oklch(0.3 0.15 250))",
  "linear-gradient(135deg, oklch(0.6 0.21 15), oklch(0.45 0.19 320))",
  "linear-gradient(135deg, oklch(0.68 0.17 200), oklch(0.38 0.16 265))",
];

/** PRNG determinístico: o mesmo seed devolve sempre a mesma série histórica. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const PROJECTS: Project[] = [
  { id: "proj-mercadinho", name: "Mercadinho Perfeito", client: "Mercadinho Perfeito Ltda." },
  { id: "proj-studio", name: "Studio Aurora", client: "Aurora Estética" },
];

const USERS: PlatformUser[] = [
  {
    id: "user-ana",
    name: "Ana Ribeiro",
    email: "ana@ampliacao.com.br",
    role: "administrador",
    projectIds: ["proj-mercadinho", "proj-studio"],
    lastActiveAt: new Date().toISOString(),
    avatarGradient: GRADIENTS[0],
  },
  {
    id: "user-bruno",
    name: "Bruno Tavares",
    email: "bruno@ampliacao.com.br",
    role: "gestor",
    projectIds: ["proj-mercadinho"],
    lastActiveAt: new Date(Date.now() - 3600_000).toISOString(),
    avatarGradient: GRADIENTS[1],
  },
  {
    id: "user-carla",
    name: "Carla Menezes",
    email: "carla@ampliacao.com.br",
    role: "editor",
    projectIds: ["proj-mercadinho", "proj-studio"],
    lastActiveAt: new Date(Date.now() - 7200_000).toISOString(),
    avatarGradient: GRADIENTS[2],
  },
  {
    id: "user-diego",
    name: "Diego Lopes",
    email: "diego@ampliacao.com.br",
    role: "atendimento",
    projectIds: ["proj-mercadinho"],
    lastActiveAt: new Date(Date.now() - 900_000).toISOString(),
    avatarGradient: GRADIENTS[3],
  },
];

type AccountSeed = Omit<SocialAccount, "lastSyncAt"> & {
  baseFollowers: number;
  dailyGrowth: number;
  paidShare: number;
};

function buildAccountSeeds(today: Date): AccountSeed[] {
  return [
    {
      id: "acc-ig-mercadinho",
      projectId: "proj-mercadinho",
      networkId: "instagram",
      handle: "@mercadinhoperfeito",
      displayName: "Mercadinho Perfeito",
      status: "ativa",
      origem: "demonstracao",
      adAccountConnected: true,
      trackingSince: toDayKey(addDays(today, -430)),
      tokenExpiresAt: toDayKey(addDays(today, 41)),
      messagingApproved: true,
      avatarGradient: GRADIENTS[0],
      baseFollowers: 4820,
      dailyGrowth: 11,
      paidShare: 0.32,
    },
    {
      id: "acc-fb-mercadinho",
      projectId: "proj-mercadinho",
      networkId: "facebook",
      handle: "/mercadinhoperfeito",
      displayName: "Mercadinho Perfeito",
      status: "ativa",
      origem: "demonstracao",
      adAccountConnected: true,
      trackingSince: toDayKey(addDays(today, -430)),
      tokenExpiresAt: toDayKey(addDays(today, 41)),
      messagingApproved: true,
      avatarGradient: GRADIENTS[1],
      baseFollowers: 9140,
      dailyGrowth: 6,
      paidShare: 0.44,
    },
    {
      id: "acc-ig-studio",
      projectId: "proj-studio",
      networkId: "instagram",
      handle: "@studioaurora",
      displayName: "Studio Aurora",
      status: "ativa",
      origem: "demonstracao",
      adAccountConnected: false,
      trackingSince: toDayKey(addDays(today, -260)),
      tokenExpiresAt: toDayKey(addDays(today, 12)),
      messagingApproved: false,
      avatarGradient: GRADIENTS[2],
      baseFollowers: 2310,
      dailyGrowth: 8,
      paidShare: 0.18,
    },
    {
      id: "acc-fb-studio",
      projectId: "proj-studio",
      networkId: "facebook",
      handle: "/studioaurora",
      displayName: "Studio Aurora",
      status: "expirada",
      origem: "demonstracao",
      adAccountConnected: false,
      trackingSince: toDayKey(addDays(today, -260)),
      tokenExpiresAt: toDayKey(addDays(today, -6)),
      messagingApproved: false,
      avatarGradient: GRADIENTS[4],
      baseFollowers: 3170,
      dailyGrowth: 2,
      paidShare: 0.1,
    },
    {
      id: "acc-tt-mercadinho",
      projectId: "proj-mercadinho",
      networkId: "tiktok",
      handle: "@mercadinhoperfeito",
      displayName: "Mercadinho Perfeito",
      status: "erro_permissao",
      origem: "demonstracao",
      adAccountConnected: false,
      trackingSince: toDayKey(addDays(today, -95)),
      tokenExpiresAt: toDayKey(addDays(today, 20)),
      messagingApproved: false,
      avatarGradient: GRADIENTS[5],
      baseFollowers: 1180,
      dailyGrowth: 14,
      paidShare: 0,
    },
  ];
}

/**
 * Série diária de uma conta, do início do acompanhamento até hoje.
 * A curva combina tendência, sazonalidade semanal e picos de campanha paga.
 */
function buildMetrics(seed: AccountSeed, today: Date): DailyMetric[] {
  const rand = mulberry32(hashSeed(seed.id));
  const start = new Date(`${seed.trackingSince}T00:00:00`);
  const total = daysBetween(start, today);
  const metrics: DailyMetric[] = [];
  let followers = seed.baseFollowers;

  for (let i = 0; i <= total; i += 1) {
    const date = addDays(start, i);
    const weekday = date.getDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.18 : 1;
    // Campanhas rodam em janelas — fora delas a conta cresce só no orgânico.
    const inPaidWindow = seed.paidShare > 0 && Math.floor(i / 9) % 3 !== 2;

    const noise = 0.75 + rand() * 0.55;
    const gained = Math.max(
      0,
      Math.round(seed.dailyGrowth * noise * weekendBoost * (inPaidWindow ? 1.45 : 1)),
    );
    const lost = Math.round(gained * (0.18 + rand() * 0.22));
    followers += gained - lost;

    const organicReach = Math.round(followers * (0.28 + rand() * 0.22) * weekendBoost);
    const paidReach = inPaidWindow
      ? Math.round(organicReach * (seed.paidShare * (0.7 + rand() * 0.9)))
      : 0;
    const organicImpressions = Math.round(organicReach * (1.25 + rand() * 0.4));
    const paidImpressions = Math.round(paidReach * (1.6 + rand() * 0.6));
    const organicEngagement = Math.round(organicReach * (0.035 + rand() * 0.03));
    const paidEngagement = Math.round(paidReach * (0.02 + rand() * 0.025));
    const adSpend = paidReach > 0 ? Math.round(paidReach * (0.012 + rand() * 0.01) * 100) / 100 : 0;

    metrics.push({
      date: toDayKey(date),
      followers,
      followersGained: gained,
      followersLost: lost,
      organicReach,
      paidReach,
      organicImpressions,
      paidImpressions,
      organicEngagement,
      paidEngagement,
      adSpend,
    });
  }

  return metrics;
}

const FOLLOWER_NAMES = [
  ["@marina.costa", "Marina Costa"],
  ["@joao_almeida", "João Almeida"],
  ["@lu.pereira", "Luciana Pereira"],
  ["@rafa.mendes", "Rafael Mendes"],
  ["@bia.santos", "Beatriz Santos"],
  ["@thiago.rocha", "Thiago Rocha"],
  ["@camila.ferraz", "Camila Ferraz"],
  ["@paulo.hs", "Paulo Henrique"],
];

function buildAudience(seed: AccountSeed, metrics: DailyMetric[]): AudienceInsight {
  const net = NETWORKS[seed.networkId];
  const rand = mulberry32(hashSeed(`${seed.id}-audience`));
  const last30 = metrics.slice(-30);

  if (!net.supportsAudienceInsights) {
    return {
      available: false,
      unavailableReason: `A API do ${net.label} não expõe dados de perfil do público para esta conta.`,
      newFollowers: last30.reduce((sum, m) => sum + m.followersGained, 0),
      unfollows: last30.reduce((sum, m) => sum + m.followersLost, 0),
      topInteractors: [],
      activityByHour: [],
      topCities: [],
    };
  }

  const topInteractors = FOLLOWER_NAMES.slice(0, 6)
    .map(([handle, name], index) => ({
      handle,
      name,
      interactions: Math.round(120 - index * 14 + rand() * 25),
      avatarGradient: GRADIENTS[index % GRADIENTS.length],
    }))
    .sort((a, b) => b.interactions - a.interactions);

  // Dois picos por dia: intervalo do almoço e fim da tarde/noite.
  const activityByHour = Array.from({ length: 24 }, (_, hour) => {
    const lunch = Math.exp(-((hour - 12.5) ** 2) / 4);
    const evening = Math.exp(-((hour - 20) ** 2) / 6);
    const base = lunch * 0.75 + evening;
    return { hour, activity: Math.round(base * 100 * (0.85 + rand() * 0.3)) };
  });

  const cityShares = [38, 21, 14, 9, 7];
  const topCities = ["São Paulo", "Guarulhos", "Osasco", "Santo André", "Campinas"].map(
    (city, index) => ({ city, share: cityShares[index] }),
  );

  return {
    available: true,
    newFollowers: last30.reduce((sum, m) => sum + m.followersGained, 0),
    unfollows: last30.reduce((sum, m) => sum + m.followersLost, 0),
    topInteractors,
    activityByHour,
    topCities,
  };
}

const CAPTIONS = [
  "Chegou a feira da semana 🍅 Confira as ofertas de hortifrúti válidas até domingo.",
  "Carrossel: 5 receitas rápidas com o que já tem na despensa.",
  "Bastidores do nosso açougue — corte na hora, do jeito que você pede.",
  "Aberto no feriado! Das 8h às 20h, com estacionamento liberado.",
  "Semana do café: grãos especiais com 20% no cartão da loja.",
  "Clientes contando por que voltam toda semana ❤️",
  "Novidade no setor de padaria: pão de fermentação natural todos os dias.",
  "Retrospectiva do mês: as ofertas que vocês mais levaram.",
];

function buildPosts(accounts: AccountSeed[], today: Date): Post[] {
  const rand = mulberry32(hashSeed("posts"));
  const posts: Post[] = [];
  const formats = ["imagem", "carrossel", "video"] as const;

  // Publicados: 10 posts distribuídos nas últimas semanas.
  for (let i = 0; i < 10; i += 1) {
    const account = accounts[i % 2 === 0 ? 0 : 1];
    const format = formats[i % 3];
    const publishedAt = addDays(today, -(3 + i * 4));
    const reach = Math.round(1500 + rand() * 5200);
    posts.push({
      id: `post-${i + 1}`,
      projectId: account.projectId,
      accountIds: i % 4 === 0 ? ["acc-ig-mercadinho", "acc-fb-mercadinho"] : [account.id],
      format,
      caption: CAPTIONS[i % CAPTIONS.length],
      media: buildMedia(format, rand),
      status: "publicado",
      scheduledFor: null,
      publishedAt: publishedAt.toISOString(),
      createdBy: i % 3 === 0 ? "user-carla" : "user-bruno",
      approvedBy: "user-ana",
      requiresApproval: true,
      metrics: {
        reach,
        impressions: Math.round(reach * (1.3 + rand() * 0.5)),
        likes: Math.round(reach * (0.04 + rand() * 0.03)),
        comments: Math.round(reach * (0.004 + rand() * 0.004)),
        shares: Math.round(reach * (0.002 + rand() * 0.003)),
        saves: Math.round(reach * (0.006 + rand() * 0.006)),
      },
      coverGradient: GRADIENTS[i % GRADIENTS.length],
    });
  }

  // Agendados, em aprovação e rascunhos — alimentam o calendário e a fila.
  const pipeline: Array<Pick<Post, "status" | "scheduledFor" | "approvedBy" | "requiresApproval">> =
    [
      {
        status: "agendado",
        scheduledFor: atHour(addDays(today, 1), 11),
        approvedBy: "user-ana",
        requiresApproval: true,
      },
      {
        status: "agendado",
        scheduledFor: atHour(addDays(today, 3), 19),
        approvedBy: "user-ana",
        requiresApproval: true,
      },
      {
        status: "aguardando_aprovacao",
        scheduledFor: atHour(addDays(today, 2), 9),
        approvedBy: null,
        requiresApproval: true,
      },
      {
        status: "aguardando_aprovacao",
        scheduledFor: atHour(addDays(today, 5), 18),
        approvedBy: null,
        requiresApproval: true,
      },
      { status: "rascunho", scheduledFor: null, approvedBy: null, requiresApproval: false },
    ];

  pipeline.forEach((entry, index) => {
    const format = formats[index % 3];
    posts.push({
      id: `post-p${index + 1}`,
      projectId: "proj-mercadinho",
      accountIds:
        index % 2 === 0 ? ["acc-ig-mercadinho"] : ["acc-ig-mercadinho", "acc-fb-mercadinho"],
      format,
      caption: CAPTIONS[(index + 3) % CAPTIONS.length],
      media: buildMedia(format, rand),
      publishedAt: null,
      createdBy: "user-carla",
      metrics: null,
      coverGradient: GRADIENTS[(index + 2) % GRADIENTS.length],
      ...entry,
    });
  });

  return posts.sort(sortPostsByRecency);
}

function buildMedia(format: Post["format"], rand: () => number): Post["media"] {
  if (format === "carrossel") {
    return { count: 3 + Math.floor(rand() * 5), aspectRatio: "4:5", fileSizeMb: 4.2 };
  }
  if (format === "video") {
    return {
      count: 1,
      aspectRatio: "9:16",
      fileSizeMb: 38 + Math.round(rand() * 40),
      durationSeconds: 18 + Math.floor(rand() * 45),
    };
  }
  return { count: 1, aspectRatio: "4:5", fileSizeMb: 2.1 };
}

function atHour(date: Date, hour: number): string {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next.toISOString();
}

export function sortPostsByRecency(a: Post, b: Post): number {
  const aTime = new Date(a.publishedAt ?? a.scheduledFor ?? 0).getTime();
  const bTime = new Date(b.publishedAt ?? b.scheduledFor ?? 0).getTime();
  return bTime - aTime;
}

function buildBoosts(posts: Post[], today: Date): Boost[] {
  const rand = mulberry32(hashSeed("boosts"));
  const published = posts.filter((post) => post.status === "publicado");
  const objectives = ["alcance", "engajamento", "trafego", "mensagens"] as const;

  return published.slice(0, 4).map((post, index) => {
    const durationDays = [7, 5, 10, 14][index];
    const startedAt = addDays(new Date(post.publishedAt!), 1);
    const endsAt = addDays(startedAt, durationDays);
    const active = endsAt.getTime() > today.getTime();
    const budgetTotal = [180, 250, 400, 600][index];
    const elapsed = Math.min(durationDays, Math.max(1, daysBetween(startedAt, today)));
    const spend = Math.round((budgetTotal / durationDays) * elapsed * 100) / 100;
    const reach = Math.round(spend * (28 + rand() * 16));

    return {
      id: `boost-${index + 1}`,
      postId: post.id,
      accountId: post.accountIds[0],
      objective: objectives[index % objectives.length],
      budgetTotal,
      durationDays,
      startedAt: toDayKey(startedAt),
      endsAt: toDayKey(endsAt),
      status: active ? "ativo" : "encerrado",
      audience: {
        locations: ["São Paulo (+10 km)"],
        ageMin: 25,
        ageMax: 54,
        interests: pick(rand, [
          ["Supermercados", "Culinária"],
          ["Ofertas", "Economia doméstica"],
          ["Gastronomia", "Receitas"],
        ]),
      },
      results: {
        spend,
        reach,
        impressions: Math.round(reach * (1.5 + rand() * 0.6)),
        engagement: Math.round(reach * (0.02 + rand() * 0.02)),
        clicks: Math.round(reach * (0.012 + rand() * 0.01)),
      },
    };
  });
}

const INBOX_SEED: Array<{
  accountId: string;
  kind: InboxItem["kind"];
  handle: string;
  name: string;
  text: string;
  minutesAgo: number;
  status: InboxItem["status"];
  postId?: string;
  assignedTo?: string;
}> = [
  {
    accountId: "acc-ig-mercadinho",
    kind: "comentario",
    handle: "@marina.costa",
    name: "Marina Costa",
    text: "A oferta do tomate vale também na loja do centro?",
    minutesAgo: 6,
    status: "pendente",
    postId: "post-1",
  },
  {
    accountId: "acc-ig-mercadinho",
    kind: "mensagem",
    handle: "@joao_almeida",
    name: "João Almeida",
    text: "Boa tarde! Vocês entregam em Osasco?",
    minutesAgo: 18,
    status: "pendente",
  },
  {
    accountId: "acc-fb-mercadinho",
    kind: "comentario",
    handle: "@lu.pereira",
    name: "Luciana Pereira",
    text: "Que horas abre no feriado?",
    minutesAgo: 42,
    status: "pendente",
    postId: "post-4",
  },
  {
    accountId: "acc-fb-mercadinho",
    kind: "mensagem",
    handle: "@rafa.mendes",
    name: "Rafael Mendes",
    text: "Consegui o café especial que vocês postaram? Ainda tem estoque?",
    minutesAgo: 95,
    status: "pendente",
    assignedTo: "user-diego",
  },
  {
    accountId: "acc-ig-mercadinho",
    kind: "comentario",
    handle: "@bia.santos",
    name: "Beatriz Santos",
    text: "Amei o pão de fermentação natural 👏",
    minutesAgo: 180,
    status: "respondido",
    postId: "post-7",
  },
  {
    accountId: "acc-ig-studio",
    kind: "mensagem",
    handle: "@camila.ferraz",
    name: "Camila Ferraz",
    text: "Tem horário disponível na quinta à tarde?",
    minutesAgo: 240,
    status: "pendente",
  },
  {
    accountId: "acc-ig-mercadinho",
    kind: "comentario",
    handle: "@thiago.rocha",
    name: "Thiago Rocha",
    text: "O estacionamento é gratuito por quanto tempo?",
    minutesAgo: 320,
    status: "respondido",
    postId: "post-2",
  },
];

function buildInbox(now: Date): InboxItem[] {
  return INBOX_SEED.map((entry, index) => {
    const receivedAt = new Date(now.getTime() - entry.minutesAgo * 60000);
    return {
      id: `inbox-${index + 1}`,
      accountId: entry.accountId,
      kind: entry.kind,
      authorHandle: entry.handle,
      authorName: entry.name,
      avatarGradient: GRADIENTS[index % GRADIENTS.length],
      text: entry.text,
      postId: entry.postId ?? null,
      receivedAt: receivedAt.toISOString(),
      status: entry.status,
      assignedTo: entry.assignedTo ?? null,
      replies:
        entry.status === "respondido"
          ? [
              {
                id: `reply-${index + 1}`,
                author: "Diego Lopes",
                text: "Obrigado pelo contato! Já respondemos por aqui 😊",
                sentAt: new Date(receivedAt.getTime() + 12 * 60000).toISOString(),
              },
            ]
          : [],
    };
  });
}

/** Interações que ainda vão chegar — demonstram a inbox em tempo real. */
const INCOMING_SEED: Array<Omit<InboxItem, "id" | "receivedAt">> = [
  {
    accountId: "acc-ig-mercadinho",
    kind: "comentario",
    authorHandle: "@paulo.hs",
    authorName: "Paulo Henrique",
    avatarGradient: GRADIENTS[3],
    text: "Vocês têm a versão sem lactose desse produto?",
    postId: "post-1",
    status: "pendente",
    assignedTo: null,
    replies: [],
  },
  {
    accountId: "acc-fb-mercadinho",
    kind: "mensagem",
    authorHandle: "@camila.ferraz",
    authorName: "Camila Ferraz",
    avatarGradient: GRADIENTS[2],
    text: "Bom dia! Qual o prazo de entrega para o bairro Jardim?",
    postId: null,
    status: "pendente",
    assignedTo: null,
    replies: [],
  },
  {
    accountId: "acc-ig-mercadinho",
    kind: "comentario",
    authorHandle: "@marina.costa",
    authorName: "Marina Costa",
    avatarGradient: GRADIENTS[0],
    text: "Comprei ontem e chegou tudo certinho, obrigada!",
    postId: "post-4",
    status: "pendente",
    assignedTo: null,
    replies: [],
  },
];

function buildReports(today: Date): Report[] {
  const start = addDays(today, -30);
  return [
    {
      id: "rep-1",
      projectId: "proj-mercadinho",
      accountIds: ["acc-ig-mercadinho", "acc-fb-mercadinho"],
      title: "Mercadinho Perfeito — últimos 30 dias",
      periodStart: toDayKey(start),
      periodEnd: toDayKey(today),
      createdAt: addDays(today, -2).toISOString(),
      createdBy: "user-bruno",
      shareToken: "mp30d2026",
      shareEnabled: true,
    },
  ];
}

function createDatabase(): SocialDatabase {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const seeds = buildAccountSeeds(today);

  const accounts: SocialAccount[] = [];
  const metrics = new Map<string, DailyMetric[]>();
  const audience = new Map<string, AudienceInsight>();

  for (const seed of seeds) {
    const series = buildMetrics(seed, today);
    metrics.set(seed.id, series);
    audience.set(seed.id, buildAudience(seed, series));
    const { baseFollowers: _b, dailyGrowth: _g, paidShare: _p, ...account } = seed;
    accounts.push({
      ...account,
      lastSyncAt:
        seed.status === "ativa"
          ? new Date(now.getTime() - 22 * 60000).toISOString()
          : new Date(now.getTime() - 3 * 86400000).toISOString(),
    });
  }

  const posts = buildPosts(seeds, today);

  return {
    projects: PROJECTS,
    users: USERS,
    accounts,
    metrics,
    audience,
    posts,
    boosts: buildBoosts(posts, today),
    inbox: buildInbox(now),
    reports: buildReports(today),
    incomingQueue: INCOMING_SEED.map((item, index) => ({
      ...item,
      id: `inbox-live-${index + 1}`,
      receivedAt: "",
    })),
    lastIncomingAt: now.getTime(),
  };
}

// O store vive no módulo para sobreviver entre requisições do mesmo processo.
// `globalThis` evita perder o estado no hot reload do Vite em desenvolvimento.
const globalStore = globalThis as typeof globalThis & { __socialDb?: SocialDatabase };

export function getDb(): SocialDatabase {
  if (!globalStore.__socialDb) {
    globalStore.__socialDb = createDatabase();
  }
  return globalStore.__socialDb;
}

/** Libera a próxima interação da fila quando o intervalo já passou. */
export function releaseIncoming(intervalMs = 45000): InboxItem | null {
  const db = getDb();
  const now = Date.now();
  if (db.incomingQueue.length === 0 || now - db.lastIncomingAt < intervalMs) return null;

  const next = db.incomingQueue.shift()!;
  const item: InboxItem = { ...next, receivedAt: new Date().toISOString() };
  db.inbox.unshift(item);
  db.lastIncomingAt = now;
  return item;
}

/**
 * Junta os dias vindos da rede ao histórico já guardado.
 *
 * Sincronizar é acumulativo: um dia que a API devolveu de novo é atualizado, e
 * dias fora da janela sincronizada continuam intactos — é o que sustenta
 * "histórico preservado mesmo com a conta desconectada" (PRD 3.2).
 */
export function mesclarMetricas(accountId: string, dias: DailyMetric[]): number {
  const db = getDb();
  const atuais = db.metrics.get(accountId) ?? [];
  const porData = new Map(atuais.map((dia) => [dia.date, dia]));

  for (const dia of dias) {
    porData.set(dia.date, dia);
  }

  const mescladas = [...porData.values()].sort((a, b) => a.date.localeCompare(b.date));
  db.metrics.set(accountId, mescladas);
  return dias.length;
}

export function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
