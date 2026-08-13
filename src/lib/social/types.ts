// Domínio da plataforma de gestão e métricas de redes sociais.
// Escopo restrito à camada social (orgânico + pago). Nada de e-commerce,
// catálogo, carrinho ou pedidos — ver docs/prd-plataforma-social.md, seção 1.4.

export type NetworkId = "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube";

/** Estado da conexão OAuth de um perfil social (PRD 3.1). */
export type ConnectionStatus = "ativa" | "expirada" | "erro_permissao" | "desconectada";

/** Cliente/projeto — unidade de isolamento de dados (PRD 5, Segurança). */
export type Project = {
  id: string;
  name: string;
  client: string;
};

export type SocialAccount = {
  id: string;
  projectId: string;
  networkId: NetworkId;
  handle: string;
  displayName: string;
  status: ConnectionStatus;
  /**
   * Como a conta entrou na plataforma: `oauth` é conexão real autorizada pela
   * rede; `demonstracao` são as contas semeadas, que não falam com a API.
   */
  origem: "oauth" | "demonstracao";
  /** ID da conta na rede (Página do Facebook ou perfil profissional do Instagram). */
  externalId?: string;
  /** Conta de anúncios conectada — pré-requisito do impulsionamento (PRD 3.4). */
  adAccountConnected: boolean;
  /** Início do acompanhamento: origem da linha do tempo de evolução (PRD 3.2). */
  trackingSince: string; // ISO date
  tokenExpiresAt: string | null; // ISO date
  lastSyncAt: string | null; // ISO datetime
  /** Permissão de mensageria aprovada pela rede (PRD 3.5). */
  messagingApproved: boolean;
  avatarGradient: string;
};

/** Ponto diário do histórico sincronizado. Preservado mesmo com conta desconectada. */
export type DailyMetric = {
  date: string; // YYYY-MM-DD
  followers: number;
  followersGained: number;
  followersLost: number;
  organicReach: number;
  paidReach: number;
  organicImpressions: number;
  paidImpressions: number;
  organicEngagement: number;
  paidEngagement: number;
  adSpend: number; // BRL
};

/**
 * Os números que uma pessoa digita quando a atualização é manual.
 *
 * São os mesmos campos de `DailyMetric`, menos os que a plataforma consegue
 * derivar sozinha (`followersGained` e `followersLost` saem da diferença para o
 * dia anterior — ninguém lê isso de cabeça no painel da rede).
 */
export type ValoresManuais = {
  followers: number;
  organicReach: number;
  paidReach: number;
  organicImpressions: number;
  paidImpressions: number;
  organicEngagement: number;
  paidEngagement: number;
  adSpend: number;
};

/**
 * Um registro manual de números.
 *
 * Vários registros podem apontar para o mesmo `date`: atualizar três vezes no
 * mesmo dia gera três registros, e o mais recente é o que vale para o histórico.
 * Guardar todos permite mostrar o que mudou entre uma atualização e a seguinte.
 */
export type AtualizacaoManual = {
  id: string;
  accountId: string;
  /** Dia a que os números se referem. */
  date: string; // YYYY-MM-DD
  /** Quando o registro foi feito — é isto que distingue as três do dia. */
  registradaEm: string; // ISO datetime
  autor: string;
  valores: ValoresManuais;
};

export type PeriodKey = "7d" | "30d" | "90d" | "12m" | "tudo";

export type MetricSummary = {
  followers: number;
  followersDelta: number;
  followersDeltaPct: number;
  reach: number;
  reachDelta: number;
  engagement: number;
  engagementDelta: number;
  engagementRate: number;
  adSpend: number;
};

export type OrganicPaidSplit = {
  organic: { reach: number; impressions: number; engagement: number };
  paid: { reach: number; impressions: number; engagement: number; spend: number };
};

/** PRD 3.2 — disponível apenas quando a API da rede expõe o dado. */
/**
 * As faixas etárias como a Meta as devolve.
 *
 * São exatamente estas — não é escolha de projeto. Reagrupar ("18 a 35") pareceria
 * mais limpo e impediria comparar com o painel da própria rede, que é onde a
 * pessoa vai conferir se o número bate.
 */
export type FaixaEtaria = "13-17" | "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+";

export const FAIXAS_ETARIAS: FaixaEtaria[] = [
  "13-17",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
];

/**
 * O gênero como a rede o informa.
 *
 * `nao_informado` é uma fatia de verdade, e não um resto a ser distribuído: a
 * rede devolve `U` para quem não declarou. Diluir esses perfis entre os outros
 * dois inflaria os dois e apagaria a informação de que uma parte do público
 * simplesmente não disse.
 */
export type Genero = "feminino" | "masculino" | "nao_informado";

/** Uma célula do cruzamento gênero × faixa etária, como a rede a entrega. */
export type CelulaDemografica = {
  genero: Genero;
  faixa: FaixaEtaria;
  /** Seguidores nesta célula. Estimativa agregada da rede. */
  pessoas: number;
};

export type AudienceInsight = {
  available: boolean;
  unavailableReason?: string;
  newFollowers: number;
  unfollows: number;
  /**
   * Distribuição dos seguidores por gênero e faixa etária.
   *
   * Vem do perfil de público da rede — é sobre **seguidores**, não sobre quem
   * foi alcançado, e a rede só a devolve acima de cem seguidores. Vazio quando
   * a conta não atinge o mínimo ou a rede não expõe o dado.
   */
  demografia: CelulaDemografica[];
  topInteractors: {
    handle: string;
    name: string;
    interactions: number;
    avatarGradient: string;
  }[];
  activityByHour: { hour: number; activity: number }[];
  /** Participação de cada cidade nos seguidores, **em porcentagem** (0 a 100). */
  topCities: { city: string; share: number }[];
};

/**
 * Os formatos que a plataforma acompanha.
 *
 * `story` é diferente dos outros três em duas coisas que aparecem em toda
 * análise: ele expira em 24 horas, e a rede não devolve curtidas nem
 * salvamentos para ele — devolve respostas, toques e saídas. Comparar a taxa de
 * um story com a de um post de feed sem dizer isso faz o story parecer o pior
 * formato da conta quando ele pode ser o melhor.
 */
export type PostFormat = "imagem" | "carrossel" | "video" | "story";

/** Formatos cujas métricas de interação são comparáveis entre si. */
export const FORMATOS_DE_FEED: PostFormat[] = ["imagem", "carrossel", "video"];

export type PostStatus =
  | "rascunho"
  | "aguardando_aprovacao"
  | "aprovado"
  | "agendado"
  | "publicado"
  | "falhou";

export type PostMedia = {
  /** Quantidade de itens — 1 para imagem/vídeo, 2..n para carrossel. */
  count: number;
  aspectRatio: "1:1" | "4:5" | "9:16" | "16:9";
  fileSizeMb: number;
  /** Somente para vídeo. */
  durationSeconds?: number;
};

export type Post = {
  id: string;
  projectId: string;
  /** Quando esta publicação nasceu de um repost, aponta para a original. */
  republicadoDe?: string;
  accountIds: string[];
  format: PostFormat;
  caption: string;
  media: PostMedia;
  status: PostStatus;
  scheduledFor: string | null; // ISO datetime
  publishedAt: string | null; // ISO datetime
  createdBy: string;
  approvedBy: string | null;
  /** Exige aprovação antes de publicar (PRD 3.3, fluxo opcional). */
  requiresApproval: boolean;
  failureReason?: string;
  metrics: PostMetrics | null;
  coverGradient: string;
};

export type PostMetrics = {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
};

export type BoostObjective = "alcance" | "engajamento" | "trafego" | "mensagens";
export type BoostStatus = "em_analise" | "ativo" | "encerrado" | "rejeitado";

export type Boost = {
  id: string;
  postId: string;
  accountId: string;
  objective: BoostObjective;
  budgetTotal: number; // BRL
  durationDays: number;
  startedAt: string; // ISO date
  endsAt: string; // ISO date
  status: BoostStatus;
  audience: {
    locations: string[];
    ageMin: number;
    ageMax: number;
    interests: string[];
  };
  results: {
    spend: number;
    reach: number;
    impressions: number;
    engagement: number;
    clicks: number;
  };
};

/**
 * Grau de relação da pessoa com o projeto (área de Relacionamento).
 *
 * A escada existe porque tratar todo mundo igual desperdiça quem já está do
 * lado: um defensor merece um convite para amplificar, um não seguidor merece
 * uma resposta que o aproxime.
 */
export type RelacaoPessoa = "nao_seguidor" | "seguidor" | "apoiador" | "defensor";

export type InboxKind = "comentario" | "mensagem";
export type InboxStatus = "pendente" | "respondido";

export type InboxReply = {
  id: string;
  author: string;
  text: string;
  sentAt: string; // ISO datetime
};

export type InboxItem = {
  id: string;
  accountId: string;
  kind: InboxKind;
  authorHandle: string;
  authorName: string;
  avatarGradient: string;
  text: string;
  postId: string | null;
  receivedAt: string; // ISO datetime
  status: InboxStatus;
  assignedTo: string | null;
  replies: InboxReply[];
  /** Classificação da pessoa; ajustável à mão na tela de Relacionamento. */
  relacao: RelacaoPessoa;
  /** Quantas vezes essa pessoa já interagiu com o projeto. */
  interacoes: number;
};

export type UserRole = "administrador" | "gestor" | "editor" | "atendimento";

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /**
   * Derivação da senha (scrypt com sal). Nunca a senha.
   *
   * Ausente significa "ainda não definiu senha" — e sem ela não se entra,
   * exceto no modo demonstração, onde não existe dado de cliente para proteger.
   */
  senhaHash?: string;
  projectIds: string[];
  lastActiveAt: string; // ISO datetime
  avatarGradient: string;
};

export type Report = {
  id: string;
  projectId: string;
  accountIds: string[];
  title: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  createdAt: string; // ISO datetime
  createdBy: string;
  /** Token do link público somente leitura (PRD 3.6). */
  shareToken: string;
  shareEnabled: boolean;
};

/** Sessão do usuário autenticado na plataforma (PRD 3.1). */
export type Session = {
  user: PlatformUser;
  projects: Project[];
};
