import { NETWORKS } from "./networks";
import { classificarPorInteracoes } from "./relacionamento";
import { carregarEstadoInicial, gravarEstado, usandoBanco } from "./snapshot.server";
import type { EstadoPersistivel } from "./snapshot";
import type { ResultadoGravacao } from "./snapshot.server";
import { FAIXAS_ETARIAS } from "./types";
import type {
  AtualizacaoManual,
  AudienceInsight,
  Boost,
  CelulaDemografica,
  DailyMetric,
  Evento,
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
  /** Compromissos da campanha no calendário. */
  eventos: Evento[];
  reports: Report[];
  /** Registros de atualização manual, incluindo os vários do mesmo dia. */
  atualizacoes: AtualizacaoManual[];
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
  // O projeto real vem primeiro: é onde se entra para trabalhar. Começa sem
  // contas de propósito — elas entram em Contas, e os números em Atualizar.
  { id: "proj-campanha", name: "Campanha Neon Cunha", client: "Campanha Neon Cunha" },
  { id: "proj-mercadinho", name: "Mercadinho Perfeito", client: "Mercadinho Perfeito Ltda." },
  { id: "proj-studio", name: "Studio Aurora", client: "Aurora Estética" },
];

const TODOS_OS_PROJETOS = PROJECTS.map((projeto) => projeto.id);

const USERS: PlatformUser[] = [
  {
    id: "user-campanha",
    name: "Campanha Neon Cunha",
    email: "campanha.neoncunha@gmail.com",
    role: "administrador",
    projectIds: TODOS_OS_PROJETOS,
    lastActiveAt: new Date().toISOString(),
    avatarGradient: GRADIENTS[4],
  },
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
    {
      id: "acc-yt-mercadinho",
      projectId: "proj-mercadinho",
      networkId: "youtube",
      handle: "@mercadinhoperfeito",
      displayName: "Mercadinho Perfeito",
      status: "ativa",
      origem: "demonstracao",
      adAccountConnected: false,
      trackingSince: toDayKey(addDays(today, -140)),
      tokenExpiresAt: toDayKey(addDays(today, 55)),
      messagingApproved: false,
      avatarGradient: GRADIENTS[6 % GRADIENTS.length],
      baseFollowers: 860,
      dailyGrowth: 5,
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

/**
 * Distribuição de seguidores por faixa etária, por rede.
 *
 * Os pesos não são iguais entre as redes de propósito: a base do Facebook é
 * mais velha que a do Instagram, e é exatamente isso que faz alguém decidir
 * onde publicar o quê. Uma semente com a mesma curva nas duas redes esconderia
 * a única conclusão que essa tela existe para produzir.
 */
const PESOS_POR_FAIXA: Record<"instagram" | "facebook", number[]> = {
  //          13-17 18-24 25-34 35-44 45-54 55-64  65+
  instagram: [0.04, 0.23, 0.34, 0.21, 0.11, 0.05, 0.02],
  facebook: [0.01, 0.09, 0.22, 0.26, 0.21, 0.14, 0.07],
};

function buildDemografia(seed: AccountSeed, rand: () => number): CelulaDemografica[] {
  const pesos = PESOS_POR_FAIXA[seed.networkId === "facebook" ? "facebook" : "instagram"];
  // Um público majoritariamente feminino, como é comum em conta de varejo local
  // e em campanha de base comunitária — mas não o mesmo em toda faixa.
  const fatiaFeminina = [0.52, 0.58, 0.61, 0.59, 0.55, 0.5, 0.46];

  return FAIXAS_ETARIAS.flatMap((faixa, indice) => {
    const naFaixa = Math.round(seed.baseFollowers * pesos[indice] * (0.92 + rand() * 0.16));
    // A rede devolve "U" para quem não declarou gênero; são poucos, e a fatia
    // aparece na tela em vez de ser diluída nos outros dois.
    const naoInformado = Math.round(naFaixa * (0.01 + rand() * 0.02));
    const restante = naFaixa - naoInformado;
    const feminino = Math.round(restante * fatiaFeminina[indice]);

    return [
      { genero: "feminino" as const, faixa, pessoas: feminino },
      { genero: "masculino" as const, faixa, pessoas: restante - feminino },
      { genero: "nao_informado" as const, faixa, pessoas: naoInformado },
    ].filter((celula) => celula.pessoas > 0);
  });
}

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
      demografia: [],
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

  const demografia = buildDemografia(seed, rand);

  return {
    available: true,
    newFollowers: last30.reduce((sum, m) => sum + m.followersGained, 0),
    unfollows: last30.reduce((sum, m) => sum + m.followersLost, 0),
    topInteractors,
    activityByHour,
    topCities,
    demografia,
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

/** Horários das peças publicadas, espalhados como uma pauta real espalha. */
const HORAS_DE_PUBLICACAO = [19, 12, 8, 20, 18, 11, 21, 9, 19, 13];

const LEGENDAS_DE_STORY = [
  "Chegou caminhão de hortifruti — corre que hoje tem tudo fresquinho 🍅",
  "Enquete: qual sabor de pão vocês querem na próxima semana?",
  "Últimas horas da oferta do café ☕ passa aqui",
  "Bastidor da padaria às 5h da manhã",
];

/**
 * A agenda semeada.
 *
 * Cobre os três casos que a tela precisa saber desenhar: o compromisso que já
 * passou e gerou peça, o de hoje que ainda vai gerar, e o futuro que existe só
 * como data. Sem o terceiro, ninguém enxerga que o calendário serve para
 * planejar e não só para registrar.
 */
function buildEventos(posts: Post[], today: Date): Evento[] {
  const publicadas = posts.filter((post) => post.status === "publicado").map((post) => post.id);

  const base = (
    id: string,
    titulo: string,
    tipo: Evento["tipo"],
    dias: number,
    hora: number,
    local: string | null,
    postIds: string[] = [],
  ): Evento => ({
    id,
    projectId: "proj-mercadinho",
    titulo,
    descricao: null,
    tipo,
    comecaEm: atHour(addDays(today, dias), hora),
    terminaEm: null,
    diaInteiro: false,
    local,
    municipioCodigo: null,
    responsavel: null,
    postIds,
    origem: "manual",
    criadoPor: "user-ana",
    criadoEm: addDays(today, -30).toISOString(),
  });

  return [
    base(
      "ev-1",
      "Feira da semana na loja do centro",
      "agenda",
      -4,
      8,
      "Loja do Centro",
      publicadas.slice(0, 2),
    ),
    base("ev-2", "Gravação do vídeo da padaria", "gravacao", -1, 14, "Padaria"),
    base("ev-3", "Reunião de pauta da semana", "interno", 0, 10, null),
    base("ev-4", "Prazo do material do feriado", "prazo", 2, 18, null),
    base("ev-5", "Ação de degustação no hortifrúti", "agenda", 5, 9, "Setor de hortifrúti"),
  ];
}

function buildPosts(accounts: AccountSeed[], today: Date): Post[] {
  const rand = mulberry32(hashSeed("posts"));
  const posts: Post[] = [];
  const formats = ["imagem", "carrossel", "video"] as const;

  // Publicados: 10 posts distribuídos nas últimas semanas.
  for (let i = 0; i < 10; i += 1) {
    const account = accounts[i % 2 === 0 ? 0 : 1];
    const format = formats[i % 3];
    // A hora precisa variar. `today` é meia-noite, e sem isto as dez peças
    // nasciam às 00h — o que faz a análise por faixa de horário concluir que o
    // melhor horário para publicar é a madrugada, sobre um dado que só diz
    // como a semente foi escrita.
    const publishedAt = new Date(atHour(addDays(today, -(3 + i * 4)), HORAS_DE_PUBLICACAO[i]));
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

  // Stories, publicados só no Instagram e com os números que a rede devolve
  // para eles: alcance menor porque só chega a quem abre stories, respostas em
  // vez de comentários, e nada de curtida ou salvamento.
  for (let i = 0; i < 4; i += 1) {
    const publishedAt = atHour(addDays(today, -(2 + i * 5)), 9 + i * 3);
    const reach = Math.round(600 + rand() * 1400);
    posts.push({
      id: `post-s${i + 1}`,
      projectId: "proj-mercadinho",
      accountIds: ["acc-ig-mercadinho"],
      format: "story",
      caption: LEGENDAS_DE_STORY[i % LEGENDAS_DE_STORY.length],
      media: buildMedia("story", rand),
      status: "publicado",
      scheduledFor: null,
      publishedAt,
      createdBy: "user-carla",
      approvedBy: null,
      requiresApproval: false,
      metrics: {
        reach,
        impressions: Math.round(reach * (1.05 + rand() * 0.15)),
        likes: 0,
        comments: Math.round(reach * (0.01 + rand() * 0.015)),
        shares: Math.round(reach * (0.003 + rand() * 0.004)),
        saves: 0,
      },
      coverGradient: GRADIENTS[(i + 5) % GRADIENTS.length],
    });
  }

  return posts.sort(sortPostsByRecency);
}

function buildMedia(format: Post["format"], rand: () => number): Post["media"] {
  if (format === "story") {
    return { count: 1, aspectRatio: "9:16", fileSizeMb: 1.4 + Math.round(rand() * 20) / 10 };
  }
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
        // Segmentação por município, com os nomes como o Gerenciador de
        // Anúncios os escreve. É daqui que sai o alcance por cidade do mapa —
        // e é por isso que a lista varia entre os impulsionamentos: uma
        // campanha real não mira sempre os mesmos lugares, e o mapa precisa
        // mostrar tanto a concentração quanto os vazios.
        locations: [
          ["São Paulo (+10 km)"],
          ["São Paulo (+10 km)", "Guarulhos", "Osasco"],
          ["Campinas", "Santo André", "São Bernardo do Campo"],
          ["São Paulo (+10 km)", "Sorocaba", "Mauá", "Diadema"],
        ][index],
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
  /** Interações acumuladas — é delas que sai a classificação da pessoa. */
  interacoes: number;
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
    interacoes: 3,
  },
  {
    accountId: "acc-ig-mercadinho",
    kind: "mensagem",
    handle: "@joao_almeida",
    name: "João Almeida",
    text: "Boa tarde! Vocês entregam em Osasco?",
    minutesAgo: 18,
    status: "pendente",
    interacoes: 0,
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
    interacoes: 7,
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
    interacoes: 12,
  },
  {
    accountId: "acc-ig-mercadinho",
    kind: "comentario",
    handle: "@bia.santos",
    name: "Beatriz Santos",
    text: "Amei o pão de fermentação natural 👏 já indiquei pra todo mundo aqui de casa",
    minutesAgo: 180,
    status: "respondido",
    postId: "post-7",
    interacoes: 24,
  },
  {
    accountId: "acc-yt-mercadinho",
    kind: "comentario",
    handle: "@canal.doleo",
    name: "Leonardo Prado",
    text: "Compartilhei esse vídeo em três grupos. Precisando de mais gente pra divulgar, é só falar.",
    minutesAgo: 210,
    status: "pendente",
    postId: "post-2",
    interacoes: 31,
  },
  {
    accountId: "acc-ig-studio",
    kind: "mensagem",
    handle: "@camila.ferraz",
    name: "Camila Ferraz",
    text: "Tem horário disponível na quinta à tarde?",
    minutesAgo: 240,
    status: "pendente",
    interacoes: 2,
  },
  {
    accountId: "acc-tt-mercadinho",
    kind: "comentario",
    handle: "@duda.oliveira",
    name: "Eduarda Oliveira",
    text: "Esse vídeo merecia muito mais visualizações, gente. Salvem e mandem pros amigos!",
    minutesAgo: 275,
    status: "pendente",
    postId: "post-4",
    interacoes: 18,
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
    interacoes: 5,
  },
  {
    accountId: "acc-yt-mercadinho",
    kind: "comentario",
    handle: "@sergio.andrade",
    name: "Sérgio Andrade",
    text: "Primeiro vídeo de vocês que eu vejo. Vim parar aqui pelo YouTube mesmo.",
    minutesAgo: 400,
    status: "pendente",
    interacoes: 0,
  },
  {
    accountId: "acc-tt-mercadinho",
    kind: "comentario",
    handle: "@nanda.lima",
    name: "Fernanda Lima",
    text: "Faz mais conteúdo assim! Eu comento em todos 🙌",
    minutesAgo: 520,
    status: "pendente",
    postId: "post-7",
    interacoes: 41,
  },
  {
    accountId: "acc-fb-mercadinho",
    kind: "comentario",
    handle: "@marcos.vinicius",
    name: "Marcos Vinícius",
    text: "Passei aqui pela primeira vez hoje, gostei da proposta.",
    minutesAgo: 610,
    status: "pendente",
    postId: "post-1",
    interacoes: 1,
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
      relacao: classificarPorInteracoes(entry.interacoes),
      interacoes: entry.interacoes,
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
    relacao: "seguidor",
    interacoes: 4,
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
    relacao: "seguidor",
    interacoes: 2,
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
    relacao: "seguidor",
    interacoes: 4,
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
    eventos: buildEventos(posts, today),
    reports: buildReports(today),
    atualizacoes: [],
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

/**
 * O estado guardado, lido uma única vez antes de a aplicação atender qualquer
 * requisição.
 *
 * `await` no topo do módulo é deliberado. Ler do Postgres é assíncrono, e
 * `getDb()` é chamado de forma síncrona por quarenta funções de servidor —
 * transformar todas em assíncronas por causa da origem dos dados seria espalhar
 * uma decisão de infraestrutura pela aplicação inteira. Resolvendo a promessa
 * aqui, o módulo só termina de carregar quando o estado está pronto, e ninguém
 * mais precisa saber de onde ele veio.
 *
 * Falha de conexão não derruba a aplicação: ela sobe com a semente e registra o
 * erro. Uma tela que abre com aviso é melhor do que um processo que não sobe.
 */
const estadoGuardado: EstadoPersistivel | null = await carregarEstadoInicial().catch((erro) => {
  console.error("Não foi possível carregar o estado guardado; usando a semente.", erro);
  return null;
});

/**
 * O estado que uma instalação de produção recebe no primeiro dia.
 *
 * **Um projeto e um administrador. Mais nada.**
 *
 * A semente de demonstração tem três projetos — um mercadinho, um estúdio e a
 * campanha — e cinco pessoas fictícias. Ela existe para desenvolver e para
 * mostrar a plataforma funcionando. Gravá-la no banco de um cliente real seria
 * entregar a plataforma com dados de mentira dentro, e alguém teria de apagar
 * um por um antes de começar a usar — no dia em que a pressa é maior.
 *
 * Os dois valores vêm do ambiente porque são a única coisa que muda entre uma
 * instalação e outra. O usuário nasce sem senha: ela é definida pelo
 * `npm run senha`, que grava um hash e nunca põe a senha no repositório.
 */
function estadoDeEstreia(): EstadoPersistivel {
  const email = process.env.ADMIN_EMAIL ?? "";
  const nomeDoProjeto = process.env.PROJETO_INICIAL ?? "Campanha";

  const projeto: Project = { id: "proj-1", name: nomeDoProjeto, client: nomeDoProjeto };
  const administrador: PlatformUser = {
    id: "user-1",
    name: process.env.ADMIN_NOME ?? (email.split("@")[0] || "Administrador"),
    email,
    role: "administrador",
    projectIds: [projeto.id],
    lastActiveAt: new Date().toISOString(),
    avatarGradient: GRADIENTS[0],
  };

  return {
    projects: [projeto],
    users: [administrador],
    accounts: [],
    metrics: new Map(),
    audience: new Map(),
    posts: [],
    boosts: [],
    inbox: [],
    eventos: [],
    reports: [],
    atualizacoes: [],
  };
}

/**
 * Primeira subida com banco vazio.
 *
 * Sem isto, a plataforma abriria mostrando usuários e projetos que não existem
 * em tabela nenhuma — e definir a senha de alguém falharia com "usuário não
 * encontrado", que é confuso justamente no primeiro minuto de uso.
 *
 * O que é gravado depende do ambiente: em produção, a estreia limpa; fora
 * dela, a semente de demonstração, que é o que faz a plataforma abrir cheia
 * para quem está desenvolvendo ou apresentando.
 */
if (estadoGuardado === null && usandoBanco()) {
  const emProducao = process.env.NODE_ENV === "production";

  if (emProducao) {
    if (!process.env.ADMIN_EMAIL) {
      throw new Error(
        "Banco vazio em produção e ADMIN_EMAIL não definida. " +
          "Defina o e-mail de quem vai administrar a plataforma — é a conta que vai receber a primeira senha.",
      );
    }
    substituirEstado(estadoDeEstreia());
    console.log(`Banco vazio: instalação nova para ${process.env.ADMIN_EMAIL}.`);
  }

  const resultado = await gravarEstado(getDb());
  if (resultado.gravado) {
    console.log(`Banco vazio: estado inicial gravado em ${resultado.destino}.`);
  } else {
    console.error("Não foi possível gravar o estado inicial no banco.", resultado.erro);
  }
}

export function getDb(): SocialDatabase {
  if (!globalStore.__socialDb) {
    globalStore.__socialDb = criarOuRestaurar();
  }
  return globalStore.__socialDb;
}

/**
 * Restaura o estado gravado em disco; se não houver, recomeça da semente.
 *
 * O que veio do arquivo vence a semente por completo — carregar metade de cada
 * lado produziria uma base que não corresponde a nada que alguém digitou.
 */
function criarOuRestaurar(): SocialDatabase {
  const salvo = estadoGuardado;
  const base = createDatabase();
  if (!salvo) return base;

  return {
    ...base,
    projects: salvo.projects.length > 0 ? salvo.projects : base.projects,
    users: salvo.users.length > 0 ? salvo.users : base.users,
    accounts: salvo.accounts,
    metrics: salvo.metrics,
    // Sem fallback para a semente: o público é indexado por conta, e as contas
    // vêm inteiras do estado carregado. Completar com o público da demonstração
    // produziria demografia de contas que não existem — o banco recusa a
    // gravação com violação de chave estrangeira, e no melhor caso a tela
    // mostraria números de um perfil fictício.
    audience: salvo.audience,
    posts: salvo.posts,
    boosts: salvo.boosts,
    inbox: salvo.inbox,
    eventos: salvo.eventos,
    reports: salvo.reports,
    atualizacoes: salvo.atualizacoes,
  };
}

/** Grava o estado atual no arquivo que vai para o Git. */
export function persistir(): Promise<ResultadoGravacao> {
  return gravarEstado(getDb());
}

/** Substitui o estado inteiro — usado ao carregar um arquivo enviado pela tela. */
export function substituirEstado(estado: EstadoPersistivel | null): void {
  if (!estado) return;
  const base = getDb();
  globalStore.__socialDb = {
    ...base,
    projects: estado.projects.length > 0 ? estado.projects : base.projects,
    users: estado.users.length > 0 ? estado.users : base.users,
    accounts: estado.accounts,
    metrics: estado.metrics,
    // Ver `criarOuRestaurar`: o público acompanha as contas, sem mistura.
    audience: estado.audience,
    posts: estado.posts,
    boosts: estado.boosts,
    inbox: estado.inbox,
    eventos: estado.eventos,
    reports: estado.reports,
    atualizacoes: estado.atualizacoes,
  };
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
