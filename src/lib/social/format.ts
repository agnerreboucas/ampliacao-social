import type {
  BoostObjective,
  BoostStatus,
  PeriodKey,
  PostStatus,
  TipoDeEvento,
  UserRole,
} from "./types";

const numberFormatter = new Intl.NumberFormat("pt-BR");
const compactFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
const longDateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatNumber = (value: number) => numberFormatter.format(Math.round(value));
export const formatCompact = (value: number) => compactFormatter.format(Math.round(value));
export const formatCurrency = (value: number) => currencyFormatter.format(value);

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

export function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPercent(value)}`;
}

/** Datas do domínio chegam como "YYYY-MM-DD"; evita o shift de fuso do parse ISO. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export const formatDay = (day: string) => dateFormatter.format(parseDay(day));
export const formatLongDay = (day: string) => longDateFormatter.format(parseDay(day));
export const formatDateTime = (iso: string) => dateTimeFormatter.format(new Date(iso));

export function formatRelative(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return formatDateTime(iso);
}

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  "12m": "12 meses",
  tudo: "Desde o início",
};

export const PERIOD_KEYS = Object.keys(PERIOD_LABELS) as PeriodKey[];

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  ideia: "Ideia",
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  agendado: "Agendado",
  publicado: "Publicado",
  falhou: "Falhou",
};

/**
 * O objetivo do anúncio escrito como se lê.
 *
 * O valor guardado é um identificador sem acento, e `capitalize` no CSS
 * transformava "trafego" em "Trafego" na tela — errado em português e visível
 * para qualquer pessoa que ler.
 */
/** As colunas do quadro, com o nome do trabalho e não o do estado. */
export const FASE_LABELS: Record<PostStatus, string> = {
  ideia: "Ideia",
  rascunho: "Em produção",
  aguardando_aprovacao: "Em revisão",
  aprovado: "Aprovado",
  agendado: "Agendado",
  publicado: "Publicado",
  falhou: "Falhou",
};

export const TIPO_DE_EVENTO_LABELS: Record<TipoDeEvento, string> = {
  agenda: "Agenda pública",
  gravacao: "Gravação",
  prazo: "Prazo",
  interno: "Interno",
};

export const BOOST_OBJECTIVE_LABELS: Record<BoostObjective, string> = {
  alcance: "Alcance",
  engajamento: "Engajamento",
  trafego: "Tráfego",
  mensagens: "Mensagens",
};

export const BOOST_STATUS_LABELS: Record<BoostStatus, string> = {
  em_analise: "Em análise",
  ativo: "Ativo",
  encerrado: "Encerrado",
  rejeitado: "Rejeitado",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  editor: "Editor",
  atendimento: "Atendimento",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  administrador: "Acesso total, incluindo usuários, projetos e conexões.",
  gestor: "Métricas, publicação, impulsionamento e relatórios do próprio projeto.",
  editor: "Cria e agenda publicações; depende de aprovação para publicar.",
  atendimento: "Somente caixa de entrada: responde comentários e mensagens.",
};
