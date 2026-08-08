import type { DailyMetric, MetricSummary, OrganicPaidSplit, PeriodKey } from "./types";

export const PERIOD_DAYS: Record<PeriodKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
  tudo: null,
};

/** Recorta a série ao período pedido, respeitando o início do acompanhamento. */
export function slicePeriod(metrics: DailyMetric[], period: PeriodKey): DailyMetric[] {
  const days = PERIOD_DAYS[period];
  if (days === null || metrics.length <= days) return metrics;
  return metrics.slice(-days);
}

function sum(metrics: DailyMetric[], key: keyof DailyMetric): number {
  return metrics.reduce((total, metric) => total + (metric[key] as number), 0);
}

/**
 * Resumo do período com variação contra o período imediatamente anterior de
 * mesma duração. Quando não há histórico anterior suficiente, a variação é 0 —
 * a plataforma nunca extrapola dado que não existe.
 */
export function summarize(metrics: DailyMetric[], period: PeriodKey): MetricSummary {
  const current = slicePeriod(metrics, period);
  if (current.length === 0) {
    return {
      followers: 0,
      followersDelta: 0,
      followersDeltaPct: 0,
      reach: 0,
      reachDelta: 0,
      engagement: 0,
      engagementDelta: 0,
      engagementRate: 0,
      adSpend: 0,
    };
  }

  const windowSize = current.length;
  const previousStart = Math.max(0, metrics.length - windowSize * 2);
  const previous = metrics.slice(previousStart, metrics.length - windowSize);

  const followers = current[current.length - 1].followers;
  const followersAtStart =
    previous.length > 0 ? previous[previous.length - 1].followers : current[0].followers;
  const followersDelta = followers - followersAtStart;

  const reach = sum(current, "organicReach") + sum(current, "paidReach");
  const previousReach = sum(previous, "organicReach") + sum(previous, "paidReach");
  const engagement = sum(current, "organicEngagement") + sum(current, "paidEngagement");
  const previousEngagement = sum(previous, "organicEngagement") + sum(previous, "paidEngagement");

  return {
    followers,
    followersDelta,
    followersDeltaPct: followersAtStart > 0 ? (followersDelta / followersAtStart) * 100 : 0,
    reach,
    reachDelta: previousReach > 0 ? ((reach - previousReach) / previousReach) * 100 : 0,
    engagement,
    engagementDelta:
      previousEngagement > 0 ? ((engagement - previousEngagement) / previousEngagement) * 100 : 0,
    engagementRate: reach > 0 ? (engagement / reach) * 100 : 0,
    adSpend: sum(current, "adSpend"),
  };
}

export function splitOrganicPaid(metrics: DailyMetric[]): OrganicPaidSplit {
  return {
    organic: {
      reach: sum(metrics, "organicReach"),
      impressions: sum(metrics, "organicImpressions"),
      engagement: sum(metrics, "organicEngagement"),
    },
    paid: {
      reach: sum(metrics, "paidReach"),
      impressions: sum(metrics, "paidImpressions"),
      engagement: sum(metrics, "paidEngagement"),
      spend: sum(metrics, "adSpend"),
    },
  };
}

export type SeriesPoint = {
  date: string;
  /**
   * Primeiro dia representado pelo ponto.
   *
   * Em períodos longos um ponto agrupa vários dias; sem saber onde o grupo
   * começa, clicar no gráfico abriria o detalhamento de um dia só — justamente
   * o que a barra *não* representa.
   */
  inicio: string;
  /** Quantos dias o ponto agrupa. 1 na maioria dos períodos. */
  dias: number;
  followers: number;
  organicReach: number;
  paidReach: number;
  organicEngagement: number;
  paidEngagement: number;
  adSpend: number;
};

/**
 * Reduz a série a no máximo `maxPoints` agrupando dias em buckets. Períodos
 * longos ("desde o início") viram uma curva legível sem trafegar 400 pontos.
 */
export function buildSeries(metrics: DailyMetric[], maxPoints = 90): SeriesPoint[] {
  if (metrics.length === 0) return [];
  const bucketSize = Math.max(1, Math.ceil(metrics.length / maxPoints));
  const points: SeriesPoint[] = [];

  for (let i = 0; i < metrics.length; i += bucketSize) {
    const bucket = metrics.slice(i, i + bucketSize);
    const last = bucket[bucket.length - 1];
    points.push({
      date: last.date,
      inicio: bucket[0].date,
      dias: bucket.length,
      followers: last.followers,
      organicReach: sum(bucket, "organicReach"),
      paidReach: sum(bucket, "paidReach"),
      organicEngagement: sum(bucket, "organicEngagement"),
      paidEngagement: sum(bucket, "paidEngagement"),
      adSpend: Math.round(sum(bucket, "adSpend") * 100) / 100,
    });
  }

  return points;
}

/** Soma dia a dia as séries de várias contas, alinhando pelas datas presentes. */
export function mergeSeries(seriesList: DailyMetric[][]): DailyMetric[] {
  const byDate = new Map<string, DailyMetric>();

  for (const series of seriesList) {
    for (const metric of series) {
      const existing = byDate.get(metric.date);
      if (!existing) {
        byDate.set(metric.date, { ...metric });
        continue;
      }
      existing.followers += metric.followers;
      existing.followersGained += metric.followersGained;
      existing.followersLost += metric.followersLost;
      existing.organicReach += metric.organicReach;
      existing.paidReach += metric.paidReach;
      existing.organicImpressions += metric.organicImpressions;
      existing.paidImpressions += metric.paidImpressions;
      existing.organicEngagement += metric.organicEngagement;
      existing.paidEngagement += metric.paidEngagement;
      existing.adSpend += metric.adSpend;
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
