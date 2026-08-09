import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { NETWORKS, statusLabel } from "@/lib/social/networks";
import { PERIOD_KEYS, PERIOD_LABELS, formatSignedPercent } from "@/lib/social/format";
import type { ConnectionStatus, NetworkId, PeriodKey } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("surface-card min-w-0 p-5 md:p-6", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
              <Icon className="size-4" />
            </span>
          ) : null}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: number;
  hint?: string;
  icon?: LucideIcon;
}) {
  const showDelta = typeof delta === "number" && Number.isFinite(delta) && delta !== 0;
  const positive = (delta ?? 0) > 0;

  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {showDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
            )}
          >
            {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {formatSignedPercent(delta!)}
          </span>
        ) : null}
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

export function NetworkChip({
  networkId,
  className,
}: {
  networkId: NetworkId;
  className?: string;
}) {
  const network = NETWORKS[networkId];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      <span className="size-2 rounded-full" style={{ background: network.gradient }} />
      {network.label}
    </span>
  );
}

export function AccountAvatar({
  gradient,
  label,
  size = 40,
}: {
  gradient: string;
  label: string;
  size?: number;
}) {
  const initials = label
    .replace(/[@/]/g, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ background: gradient, width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

const CONNECTION_TONES: Record<ConnectionStatus, string> = {
  ativa: "bg-success/15 text-success",
  expirada: "bg-amber-500/15 text-amber-400",
  erro_permissao: "bg-destructive/15 text-destructive",
  desconectada: "bg-muted text-muted-foreground",
};

export function ConnectionPill({ status }: { status: ConnectionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize",
        CONNECTION_TONES[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}

export type PillTone = "neutro" | "positivo" | "atencao" | "erro" | "destaque";

const PILL_TONES: Record<PillTone, string> = {
  neutro: "bg-secondary text-muted-foreground",
  positivo: "bg-success/15 text-success",
  atencao: "bg-warning/15 text-warning",
  erro: "bg-destructive/15 text-destructive",
  destaque: "bg-accent/15 text-accent",
};

export function StatusPill({
  tone = "neutro",
  children,
  className,
}: {
  tone?: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (period: PeriodKey) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-border bg-card/60 p-1">
      {PERIOD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            value === key
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {PERIOD_LABELS[key]}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-secondary text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-14 animate-pulse rounded-xl bg-secondary/60" />
      ))}
    </div>
  );
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}
