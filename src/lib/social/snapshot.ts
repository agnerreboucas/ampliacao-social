import type {
  AtualizacaoManual,
  AudienceInsight,
  Boost,
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
 * O estado da plataforma como um arquivo.
 *
 * Enquanto a leitura automática das redes não sai, os números entram à mão — e
 * dado digitado que vive só na memória do processo é dado que some no próximo
 * restart. O snapshot resolve isso sem banco: um JSON que vai para o Git junto
 * com o código, versionado como qualquer outro arquivo.
 *
 * O efeito colateral é o melhor da ideia: o histórico das atualizações vira
 * histórico do Git. Dá para ver quem mudou qual número, quando, e voltar atrás.
 *
 * Módulo puro de propósito — o mesmo código serializa no servidor e no build
 * estático, onde não existe sistema de arquivos.
 */

/** Sobe quando o formato muda de um jeito que quebra arquivos antigos. */
export const VERSAO_SNAPSHOT = 1;

/**
 * A parte do estado que vale a pena persistir.
 *
 * Fila de interações futuras e marcações de tempo real ficam de fora: são
 * artifícios da demonstração, não dado do cliente.
 */
export type EstadoPersistivel = {
  projects: Project[];
  users: PlatformUser[];
  accounts: SocialAccount[];
  metrics: Map<string, DailyMetric[]>;
  audience: Map<string, AudienceInsight>;
  posts: Post[];
  boosts: Boost[];
  inbox: InboxItem[];
  eventos: Evento[];
  reports: Report[];
  atualizacoes: AtualizacaoManual[];
};

export type Snapshot = {
  versao: number;
  geradoEm: string;
  projects: Project[];
  users: PlatformUser[];
  accounts: SocialAccount[];
  /** `Map` não sobrevive a JSON; vira lista e volta a ser `Map` na leitura. */
  metrics: { accountId: string; dias: DailyMetric[] }[];
  audience: { accountId: string; insight: AudienceInsight }[];
  posts: Post[];
  boosts: Boost[];
  inbox: InboxItem[];
  eventos: Evento[];
  reports: Report[];
  atualizacoes: AtualizacaoManual[];
};

export function paraSnapshot(estado: EstadoPersistivel, geradoEm = new Date()): Snapshot {
  return {
    versao: VERSAO_SNAPSHOT,
    geradoEm: geradoEm.toISOString(),
    projects: estado.projects,
    // O hash da senha fica de fora — deliberadamente.
    //
    // Este arquivo é feito para ir ao Git e para ser baixado como cópia. Hash de
    // frase memorável em repositório é quebrável por dicionário, e repositório
    // privado hoje é repositório compartilhado amanhã. Senha só existe no banco.
    //
    // A consequência é coerente: sem banco, ninguém tem senha, e a plataforma
    // está em modo demonstração — onde não há dado de cliente a proteger.
    users: estado.users.map(({ senhaHash: _senhaHash, ...usuario }) => usuario),
    accounts: estado.accounts,
    metrics: [...estado.metrics.entries()].map(([accountId, dias]) => ({ accountId, dias })),
    audience: [...estado.audience.entries()].map(([accountId, insight]) => ({
      accountId,
      insight,
    })),
    posts: estado.posts,
    boosts: estado.boosts,
    inbox: estado.inbox,
    eventos: estado.eventos,
    reports: estado.reports,
    atualizacoes: estado.atualizacoes,
  };
}

export class SnapshotInvalido extends Error {}

/**
 * Lê um snapshot, recusando o que não dá para confiar.
 *
 * Um arquivo de versão futura é rejeitado em vez de lido pela metade: carregar
 * dado que não se entende é pior do que recomeçar da semente, porque o estrago
 * só aparece depois, no número errado dentro de um relatório.
 */
export function deSnapshot(bruto: unknown): EstadoPersistivel {
  if (typeof bruto !== "object" || bruto === null) {
    throw new SnapshotInvalido("O arquivo não contém um objeto JSON.");
  }

  const dados = bruto as Partial<Snapshot>;

  if (typeof dados.versao !== "number") {
    throw new SnapshotInvalido("O arquivo não tem versão — não parece um backup da plataforma.");
  }
  if (dados.versao > VERSAO_SNAPSHOT) {
    throw new SnapshotInvalido(
      `O arquivo é da versão ${dados.versao} e esta instalação lê até a ${VERSAO_SNAPSHOT}. Atualize a plataforma antes de carregar.`,
    );
  }
  if (!Array.isArray(dados.accounts) || !Array.isArray(dados.metrics)) {
    throw new SnapshotInvalido("O arquivo está incompleto: faltam contas ou métricas.");
  }

  return {
    projects: dados.projects ?? [],
    users: dados.users ?? [],
    accounts: dados.accounts,
    metrics: new Map(dados.metrics.map((entrada) => [entrada.accountId, entrada.dias])),
    audience: new Map(
      (dados.audience ?? []).map((entrada) => [entrada.accountId, entrada.insight]),
    ),
    posts: dados.posts ?? [],
    boosts: dados.boosts ?? [],
    inbox: dados.inbox ?? [],
    // Arquivo gravado antes de a agenda existir volta sem o campo. Vazio é a
    // leitura certa: a campanha não tinha compromissos cadastrados ainda.
    eventos: dados.eventos ?? [],
    reports: dados.reports ?? [],
    atualizacoes: dados.atualizacoes ?? [],
  };
}

/** Texto pronto para gravar em arquivo — indentado porque o diff do Git precisa ser legível. */
export function serializar(estado: EstadoPersistivel, geradoEm?: Date): string {
  return `${JSON.stringify(paraSnapshot(estado, geradoEm), null, 2)}\n`;
}

export function desserializar(texto: string): EstadoPersistivel {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new SnapshotInvalido("O arquivo não é um JSON válido.");
  }
  return deSnapshot(bruto);
}

/** Nome sugerido para o arquivo baixado pela tela. */
export function nomeDoArquivo(agora = new Date()): string {
  const dia = agora.toISOString().slice(0, 10);
  const hora = `${agora.getHours()}`.padStart(2, "0") + `${agora.getMinutes()}`.padStart(2, "0");
  return `plataforma-${dia}-${hora}.json`;
}
