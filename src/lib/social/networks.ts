import type { FormatoPublicavel, NetworkId, PostFormat, PostMedia, SocialAccount } from "./types";

/**
 * Capacidades e limites de cada rede. A plataforma valida o conteúdo contra
 * estes limites *antes* de publicar (PRD 3.3, regra de negócio) e usa as
 * flags de capacidade para habilitar/desabilitar módulos por conta.
 *
 * Os valores refletem os limites públicos das APIs oficiais na data do PRD;
 * ao adicionar uma nova rede basta acrescentar uma entrada aqui — nenhum
 * outro módulo precisa mudar (PRD 5, Escalabilidade).
 */
export type NetworkCapabilities = {
  id: NetworkId;
  label: string;
  /** Cor de marca usada em gráficos e chips. */
  color: string;
  gradient: string;
  formats: PostFormat[];
  captionMaxLength: number;
  carousel: { min: number; max: number };
  video: { minSeconds: number; maxSeconds: number; maxFileMb: number };
  image: { maxFileMb: number };
  aspectRatios: PostMedia["aspectRatio"][];
  /** Impulsionamento disponível via API de anúncios. */
  supportsBoost: boolean;
  /** Mensagens diretas na caixa unificada. */
  supportsDirectMessages: boolean;
  supportsComments: boolean;
  /** Dados demográficos/comportamentais do público. */
  supportsAudienceInsights: boolean;
  /** Fase do roadmap em que a rede entra (PRD 7). */
  phase: 1 | 4;
};

/**
 * A mídia com que cada formato nasce.
 *
 * Não é palpite estético: é o que passa na validação da maioria das redes sem
 * ajuste nenhum. Serve a dois lugares — o editor, quando alguém troca o formato
 * no meio da escrita, e o servidor, quando uma pauta da agenda finalmente
 * decide o que vai ser. Os dois precisam concordar, senão a mesma escolha
 * produz peças diferentes dependendo de onde foi feita.
 */
export const MIDIA_PADRAO: Record<FormatoPublicavel, PostMedia> = {
  imagem: { count: 1, aspectRatio: "4:5", fileSizeMb: 2 },
  carrossel: { count: 3, aspectRatio: "4:5", fileSizeMb: 4.5 },
  video: { count: 1, aspectRatio: "9:16", fileSizeMb: 45, durationSeconds: 30 },
  story: { count: 1, aspectRatio: "9:16", fileSizeMb: 2.5 },
};

export const NETWORKS: Record<NetworkId, NetworkCapabilities> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    color: "oklch(0.65 0.22 5)",
    gradient: "linear-gradient(135deg, oklch(0.72 0.2 60), oklch(0.55 0.25 350))",
    formats: ["imagem", "carrossel", "video", "story"],
    captionMaxLength: 2200,
    carousel: { min: 2, max: 10 },
    video: { minSeconds: 3, maxSeconds: 900, maxFileMb: 1024 },
    image: { maxFileMb: 8 },
    aspectRatios: ["1:1", "4:5", "9:16"],
    supportsBoost: true,
    supportsDirectMessages: true,
    supportsComments: true,
    supportsAudienceInsights: true,
    phase: 1,
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    color: "oklch(0.58 0.18 258)",
    gradient: "linear-gradient(135deg, oklch(0.6 0.19 258), oklch(0.4 0.16 265))",
    formats: ["imagem", "carrossel", "video", "story"],
    captionMaxLength: 63206,
    carousel: { min: 2, max: 10 },
    video: { minSeconds: 1, maxSeconds: 14400, maxFileMb: 4096 },
    image: { maxFileMb: 10 },
    aspectRatios: ["1:1", "4:5", "9:16", "16:9"],
    supportsBoost: true,
    supportsDirectMessages: true,
    supportsComments: true,
    supportsAudienceInsights: true,
    phase: 1,
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    color: "oklch(0.78 0.16 190)",
    gradient: "linear-gradient(135deg, oklch(0.8 0.16 190), oklch(0.55 0.2 350))",
    formats: ["imagem", "carrossel", "video"],
    captionMaxLength: 2200,
    carousel: { min: 2, max: 35 },
    video: { minSeconds: 3, maxSeconds: 600, maxFileMb: 4096 },
    image: { maxFileMb: 20 },
    aspectRatios: ["9:16", "1:1"],
    supportsBoost: false,
    supportsDirectMessages: false,
    supportsComments: true,
    supportsAudienceInsights: false,
    phase: 4,
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    color: "oklch(0.62 0.23 25)",
    gradient: "linear-gradient(135deg, oklch(0.65 0.24 25), oklch(0.42 0.2 20))",
    formats: ["video"],
    captionMaxLength: 5000,
    carousel: { min: 0, max: 0 },
    video: { minSeconds: 1, maxSeconds: 43200, maxFileMb: 128000 },
    image: { maxFileMb: 2 },
    aspectRatios: ["16:9", "9:16"],
    supportsBoost: false,
    supportsDirectMessages: false,
    supportsComments: true,
    supportsAudienceInsights: false,
    phase: 4,
  },
  /**
   * Threads é a sexta rede, e a escolha tem um motivo prático.
   *
   * Ela é da Meta: entra pela mesma autorização que Instagram e Facebook já
   * exigem, sem aplicativo novo para aprovar e sem custo de API. O X cobra
   * assinatura para publicar por API, e seria a única rede da lista com conta a
   * pagar — trocar um pelo outro aqui é mudar um bloco deste arquivo.
   *
   * Não aceita story nem impulsionamento próprio, e a API não devolve perfil de
   * público. A plataforma já sabe lidar com isso: o cartão aparece sem
   * investimento e a tela de Público explica a ausência.
   */
  threads: {
    id: "threads",
    label: "Threads",
    color: "oklch(0.35 0.02 260)",
    gradient: "linear-gradient(135deg, oklch(0.45 0.03 260), oklch(0.2 0.02 265))",
    formats: ["imagem", "carrossel", "video"],
    captionMaxLength: 500,
    carousel: { min: 2, max: 20 },
    video: { minSeconds: 1, maxSeconds: 300, maxFileMb: 1024 },
    image: { maxFileMb: 8 },
    aspectRatios: ["1:1", "4:5", "9:16"],
    supportsBoost: false,
    supportsDirectMessages: false,
    supportsComments: true,
    supportsAudienceInsights: false,
    phase: 4,
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    color: "oklch(0.62 0.13 240)",
    gradient: "linear-gradient(135deg, oklch(0.66 0.13 240), oklch(0.42 0.12 250))",
    formats: ["imagem", "carrossel", "video"],
    captionMaxLength: 3000,
    carousel: { min: 2, max: 20 },
    video: { minSeconds: 3, maxSeconds: 900, maxFileMb: 500 },
    image: { maxFileMb: 10 },
    aspectRatios: ["1:1", "4:5", "16:9"],
    supportsBoost: false,
    supportsDirectMessages: true,
    supportsComments: true,
    supportsAudienceInsights: false,
    phase: 4,
  },
};

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

export type ValidationIssue = {
  accountId: string;
  networkId: NetworkId;
  severity: "erro" | "aviso";
  message: string;
};

export type PostDraftInput = {
  format: PostFormat;
  caption: string;
  media: PostMedia;
};

/**
 * Valida um rascunho contra os limites de cada conta de destino.
 * Erros bloqueiam a publicação; avisos apenas alertam o usuário.
 */
export function validateDraft(draft: PostDraftInput, accounts: SocialAccount[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const account of accounts) {
    const net = NETWORKS[account.networkId];
    const push = (severity: ValidationIssue["severity"], message: string) =>
      issues.push({ accountId: account.id, networkId: account.networkId, severity, message });

    if (account.status !== "ativa") {
      push(
        "erro",
        `A conexão com ${net.label} está ${statusLabel(account.status)}. Reconecte a conta antes de publicar.`,
      );
    }

    if (!net.formats.includes(draft.format)) {
      push("erro", `${net.label} não aceita o formato ${draft.format}.`);
    }

    if (draft.caption.length > net.captionMaxLength) {
      push(
        "erro",
        `Legenda com ${draft.caption.length} caracteres excede o limite de ${net.captionMaxLength} do ${net.label}.`,
      );
    }

    if (!net.aspectRatios.includes(draft.media.aspectRatio)) {
      push(
        "erro",
        `Proporção ${draft.media.aspectRatio} não é suportada pelo ${net.label} (aceita ${net.aspectRatios.join(", ")}).`,
      );
    }

    if (draft.format === "story") {
      // Story fora de 9:16 é publicado com barras, o que na prática significa
      // recortado ou com faixa preta — a rede aceita, e quem vê estranha.
      if (draft.media.aspectRatio !== "9:16") {
        push(
          "aviso",
          `Story em ${draft.media.aspectRatio} aparece com bordas no ${net.label}; 9:16 ocupa a tela inteira.`,
        );
      }
      push(
        "aviso",
        `Story expira em 24 horas no ${net.label}. Depois disso os números param de crescer e a peça sai do ar.`,
      );
    }

    if (draft.format === "carrossel") {
      if (draft.media.count < net.carousel.min) {
        push("erro", `Carrossel no ${net.label} precisa de pelo menos ${net.carousel.min} itens.`);
      }
      if (draft.media.count > net.carousel.max) {
        push("erro", `Carrossel no ${net.label} aceita no máximo ${net.carousel.max} itens.`);
      }
    }

    if (draft.format === "video") {
      const duration = draft.media.durationSeconds ?? 0;
      if (duration < net.video.minSeconds) {
        push("erro", `Vídeo precisa de pelo menos ${net.video.minSeconds}s no ${net.label}.`);
      }
      if (duration > net.video.maxSeconds) {
        push(
          "erro",
          `Vídeo de ${formatDuration(duration)} excede o máximo de ${formatDuration(net.video.maxSeconds)} do ${net.label}.`,
        );
      }
      if (draft.media.fileSizeMb > net.video.maxFileMb) {
        push(
          "erro",
          `Arquivo de ${draft.media.fileSizeMb} MB excede o limite de ${net.video.maxFileMb} MB do ${net.label}.`,
        );
      }
    } else if (draft.media.fileSizeMb > net.image.maxFileMb) {
      push(
        "erro",
        `Imagem de ${draft.media.fileSizeMb} MB excede o limite de ${net.image.maxFileMb} MB do ${net.label}.`,
      );
    }

    if (
      draft.format === "video" &&
      account.networkId === "instagram" &&
      draft.media.aspectRatio !== "9:16"
    ) {
      push("aviso", "Vídeos fora de 9:16 no Instagram recebem menos alcance em Reels.");
    }
  }

  return issues;
}

export function hasBlockingIssues(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "erro");
}

export function statusLabel(status: SocialAccount["status"]): string {
  switch (status) {
    case "ativa":
      return "ativa";
    case "expirada":
      return "expirada";
    case "erro_permissao":
      return "com erro de permissão";
    case "desconectada":
      return "desconectada";
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}min` : `${minutes}min ${rest}s`;
}
