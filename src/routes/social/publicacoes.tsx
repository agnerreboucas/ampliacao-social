import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckCircle2,
  CirclePlay,
  Images,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  Plus,
  Send,
  Trash2,
  Undo2,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { atualizarPublicacao, listarPublicacoes } from "@/lib/api/social.functions";
import { PostEditorDialog } from "@/components/social/post-editor";
import { NOME_DO_FORMATO } from "@/lib/social/conteudo";
import {
  AccountAvatar,
  EmptyState,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusPill,
  type PillTone,
} from "@/components/social/primitives";
import { POST_STATUS_LABELS, formatCompact, formatDateTime } from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { Post, PostStatus, SocialAccount } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/publicacoes")({
  component: PublicacoesPage,
});

const STATUS_TONES: Record<PostStatus, PillTone> = {
  ideia: "neutro",
  rascunho: "neutro",
  aguardando_aprovacao: "atencao",
  aprovado: "destaque",
  agendado: "destaque",
  publicado: "positivo",
  falhou: "erro",
};

const FORMAT_ICONS = {
  a_definir: Lightbulb,
  imagem: ImageIcon,
  carrossel: Images,
  video: Video,
  story: CirclePlay,
} as const;

const FILTERS: { id: "fila" | "publicado" | "todos"; label: string }[] = [
  { id: "fila", label: "Fila de produção" },
  { id: "publicado", label: "Publicados" },
  { id: "todos", label: "Todos" },
];

function PublicacoesPage() {
  const { projectId, session } = useSocialSession();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [filter, setFilter] = useState<"fila" | "publicado" | "todos">("fila");

  const publicacoes = useQuery({
    queryKey: ["social", "publicacoes", projectId],
    queryFn: () => listarPublicacoes({ data: { projectId: projectId ?? undefined } }),
    enabled: Boolean(projectId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["social"] });

  const acao = useMutation({
    mutationFn: (input: {
      postId: string;
      acao: "aprovar" | "reprovar" | "publicar_agora" | "excluir";
      userId?: string;
    }) => atualizarPublicacao({ data: input }),
    onSuccess: (result, input) => {
      invalidate();
      if (!result.ok) {
        toast.error(result.issues[0]?.message ?? "A publicação falhou.");
        return;
      }
      const mensagens = {
        aprovar: "Publicação aprovada.",
        reprovar: "Publicação devolvida para ajustes.",
        publicar_agora: "Publicação enviada às redes.",
        excluir: "Publicação excluída.",
      };
      toast.success(mensagens[input.acao]);
    },
    onError: () => toast.error("Não foi possível concluir a ação."),
  });

  const posts = useMemo(() => publicacoes.data?.posts ?? [], [publicacoes.data]);
  const accounts = publicacoes.data?.accounts ?? [];

  const visible = useMemo(() => {
    if (filter === "publicado") return posts.filter((post) => post.status === "publicado");
    if (filter === "fila") return posts.filter((post) => post.status !== "publicado");
    return posts;
  }, [posts, filter]);

  const scheduled = posts.filter(
    (post) =>
      post.scheduledFor && (post.status === "agendado" || post.status === "aguardando_aprovacao"),
  );

  const canApprove = session?.user.role === "administrador" || session?.user.role === "gestor";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publicações"
        description="Editor, calendário de conteúdo e fluxo de aprovação das contas do projeto."
        actions={
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            <Plus className="size-4" /> Nova publicação
          </button>
        }
      />

      <SectionCard
        title="Calendário de conteúdo"
        description="Próximas quatro semanas — agendados e itens aguardando aprovação."
        icon={CalendarDays}
      >
        <ContentCalendar posts={scheduled} accounts={accounts} />
      </SectionCard>

      <SectionCard
        title="Fila de publicação"
        icon={ListChecks}
        actions={
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === option.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      >
        {publicacoes.isPending ? (
          <LoadingBlock rows={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Send}
            title="Nada por aqui"
            description="Crie uma publicação para começar a alimentar o calendário do projeto."
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                accounts={accounts}
                canApprove={canApprove}
                busy={acao.isPending && acao.variables?.postId === post.id}
                onAction={(next) =>
                  acao.mutate({ postId: post.id, acao: next, userId: session?.user.id })
                }
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {projectId && session ? (
        <PostEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          accounts={accounts}
          projectId={projectId}
          userId={session.user.id}
          onCreated={invalidate}
        />
      ) : null}
    </div>
  );
}

function PostRow({
  post,
  accounts,
  canApprove,
  busy,
  onAction,
}: {
  post: Post;
  accounts: SocialAccount[];
  canApprove: boolean;
  busy: boolean;
  onAction: (acao: "aprovar" | "reprovar" | "publicar_agora" | "excluir") => void;
}) {
  const Icon = FORMAT_ICONS[post.format];
  const targets = accounts.filter((account) => post.accountIds.includes(account.id));

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start gap-4">
        <Link
          to="/social/publicacao/$postId"
          params={{ postId: post.id }}
          className="grid size-12 shrink-0 place-items-center rounded-lg text-white transition-opacity hover:opacity-80"
          style={{ background: post.coverGradient }}
          aria-label="Abrir detalhe da publicação"
        >
          <Icon className="size-5" />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            to="/social/publicacao/$postId"
            params={{ postId: post.id }}
            className="line-clamp-2 text-sm hover:text-accent"
          >
            {post.caption || "Sem legenda"}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusPill tone={STATUS_TONES[post.status]}>
              {POST_STATUS_LABELS[post.status]}
            </StatusPill>
            <span>{NOME_DO_FORMATO[post.format]}</span>
            {post.format === "carrossel" ? <span>· {post.media.count} itens</span> : null}
            {post.format === "video" ? <span>· {post.media.durationSeconds}s</span> : null}
            <span>· {post.media.aspectRatio}</span>
            {post.scheduledFor ? (
              <span>· agendado para {formatDateTime(post.scheduledFor)}</span>
            ) : null}
            {post.publishedAt ? (
              <span>· publicado em {formatDateTime(post.publishedAt)}</span>
            ) : null}
          </div>
          {post.failureReason ? (
            <p className="mt-2 text-xs text-destructive">{post.failureReason}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {targets.map((account) => (
              <span
                key={account.id}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <AccountAvatar
                  gradient={account.avatarGradient}
                  label={account.displayName}
                  size={20}
                />
                {account.handle}
              </span>
            ))}
          </div>
        </div>

        {post.metrics ? (
          // Alcance sozinho não diz se a peça funcionou: mil pessoas alcançadas
          // com duas curtidas e mil com duzentas são resultados opostos, e a
          // diferença só aparecia se alguém abrisse o detalhe.
          <div className="grid shrink-0 grid-cols-3 gap-3 text-right text-sm tabular-nums">
            <Numero rotulo="alcance" valor={formatCompact(post.metrics.reach)} destaque />
            <Numero rotulo="curtidas" valor={formatCompact(post.metrics.likes)} />
            <Numero rotulo="coment." valor={formatCompact(post.metrics.comments)} />
          </div>
        ) : null}
      </div>

      {post.status !== "publicado" ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          {post.status === "aguardando_aprovacao" && canApprove ? (
            <>
              <RowButton
                onClick={() => onAction("aprovar")}
                busy={busy}
                icon={CheckCircle2}
                primary
              >
                Aprovar
              </RowButton>
              <RowButton onClick={() => onAction("reprovar")} busy={busy} icon={Undo2}>
                Devolver
              </RowButton>
            </>
          ) : null}
          {post.status !== "aguardando_aprovacao" ? (
            <RowButton onClick={() => onAction("publicar_agora")} busy={busy} icon={Send} primary>
              Publicar agora
            </RowButton>
          ) : null}
          <RowButton onClick={() => onAction("excluir")} busy={busy} icon={Trash2}>
            Excluir
          </RowButton>
        </div>
      ) : null}
    </li>
  );
}

function Numero({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div>
      <div className={destaque ? "font-semibold" : ""}>{valor}</div>
      <div className="text-xs text-muted-foreground">{rotulo}</div>
    </div>
  );
}

function RowButton({
  onClick,
  busy,
  icon: Icon,
  primary,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  icon: typeof Send;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={
        primary
          ? "inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          : "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary disabled:opacity-60"
      }
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  );
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Grade de 4 semanas a partir da segunda-feira da semana atual. */
function ContentCalendar({ posts, accounts }: { posts: Post[]; accounts: SocialAccount[] }) {
  const days = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // getDay(): 0 = domingo. Ajusta para a semana começar na segunda.
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);

    return Array.from({ length: 28 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of posts) {
      if (!post.scheduledFor) continue;
      const key = new Date(post.scheduledFor).toDateString();
      map.set(key, [...(map.get(key) ?? []), post]);
    }
    return map;
  }, [posts]);

  const todayKey = new Date().toDateString();

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday}>{weekday}</div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {days.map((date) => {
          const key = date.toDateString();
          const dayPosts = byDay.get(key) ?? [];
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={cn(
                "min-h-20 rounded-lg border p-1.5 text-left",
                isToday ? "border-accent/60 bg-accent/5" : "border-border",
              )}
            >
              <div
                className={cn(
                  "text-xs tabular-nums",
                  isToday ? "text-accent" : "text-muted-foreground",
                )}
              >
                {date.getDate()}
              </div>
              <div className="mt-1 space-y-1">
                {dayPosts.map((post) => {
                  const account = accounts.find((candidate) =>
                    post.accountIds.includes(candidate.id),
                  );
                  return (
                    <div
                      key={post.id}
                      title={post.caption}
                      className="truncate rounded px-1.5 py-1 text-[11px] leading-tight text-white"
                      style={{ background: account?.avatarGradient ?? post.coverGradient }}
                    >
                      {new Date(post.scheduledFor!).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      {post.format}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
