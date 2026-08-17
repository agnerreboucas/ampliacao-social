import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  FileBarChart,
  History,
  LayoutDashboard,
  Link2,
  LogOut,
  // O apelido não é estilo: importar `Map` sem ele sombreia o `Map` do
  // JavaScript no módulo inteiro — inclusive no código que o empacotador
  // injeta aqui. O preâmbulo de HMR do router faz `new Map()`, e a plataforma
  // inteira morria em "Map is not a constructor" antes de carregar a sessão.
  Map as MapaIcone,
  MapPin,
  MessagesSquare,
  PencilLine,
  Rocket,
  Send,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { useEffect } from "react";

import { listarInbox } from "@/lib/api/social.functions";
import { AccountAvatar } from "@/components/social/primitives";
import { SeletorTema } from "@/components/social/seletor-tema";
import { Toaster } from "@/components/ui/sonner";
import { ROLE_LABELS } from "@/lib/social/format";
import { can } from "@/lib/social/permissions";
import { SocialSessionProvider, useSocialSession } from "@/lib/social/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social")({
  head: () => ({
    meta: [
      { title: "Plataforma Social — Ampliação" },
      {
        name: "description",
        content:
          "Gestão e métricas de redes sociais: crescimento, publicação, impulsionamento e relacionamento unificado.",
      },
    ],
  }),
  component: SocialLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  ability: string;
  badge?: number;
};

function SocialLayout() {
  return (
    <SocialSessionProvider>
      <SocialShell />
      <Toaster position="top-right" />
    </SocialSessionProvider>
  );
}

function SocialShell() {
  const { ready, session, projectId, setProjectId, signOut } = useSocialSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Sem sessão o usuário vai para a tela de login; a checagem só roda depois da
  // hidratação porque a sessão vive no storage do navegador.
  useEffect(() => {
    if (ready && !session) {
      navigate({ to: "/social/entrar", replace: true });
    }
  }, [ready, session, navigate]);

  const inboxQuery = useQuery({
    queryKey: ["social", "inbox-badge", projectId],
    queryFn: () => listarInbox({ data: { projectId: projectId ?? undefined, poll: false } }),
    enabled: Boolean(session && projectId),
    refetchInterval: 30_000,
  });

  if (!ready || !session) {
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="text-sm text-muted-foreground">Carregando sua sessão…</div>
      </div>
    );
  }

  const role = session.user.role;
  const items: NavItem[] = [
    { to: "/social", label: "Painel", icon: LayoutDashboard, ability: "metricas" },
    { to: "/social/agenda", label: "Agenda", icon: CalendarDays, ability: "agenda" },
    { to: "/social/contas", label: "Contas", icon: Link2, ability: "metricas" },
    { to: "/social/atualizar", label: "Atualizar números", icon: PencilLine, ability: "metricas" },
    { to: "/social/importar", label: "Importar histórico", icon: Upload, ability: "metricas" },
    { to: "/social/conteudo", label: "Conteúdo", icon: Sparkles, ability: "metricas" },
    { to: "/social/publico", label: "Público", icon: MapPin, ability: "metricas" },
    { to: "/social/mapa", label: "Mapa de SP", icon: MapaIcone, ability: "metricas" },
    { to: "/social/publicacoes", label: "Publicações", icon: Send, ability: "publicar" },
    { to: "/social/impulsionamentos", label: "Impulsionar", icon: Rocket, ability: "impulsionar" },
    {
      to: "/social/relacionamento",
      label: "Relacionamento",
      icon: MessagesSquare,
      ability: "inbox",
      badge: inboxQuery.data?.pendentes,
    },
    { to: "/social/relatorios", label: "Relatórios", icon: FileBarChart, ability: "relatorios" },
    { to: "/social/equipe", label: "Equipe", icon: Users, ability: "admin" },
    { to: "/social/historico", label: "Histórico", icon: History, ability: "admin" },
  ].filter((item) => can(role, item.ability));

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-border bg-card/40 backdrop-blur lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center gap-3 px-5 py-5">
          <div
            className="grid size-10 place-items-center rounded-xl"
            style={{ background: "var(--gradient-brand)" }}
          >
            <BarChart3 className="size-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Ampliação
            </div>
            <div className="text-base font-semibold">
              Social <span className="text-accent">Hub</span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-4">
          <label className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Projeto
          </label>
          <div className="relative mt-1.5">
            <select
              value={projectId ?? ""}
              onChange={(event) => setProjectId(event.target.value)}
              className="w-full appearance-none rounded-lg border border-border bg-secondary px-3 py-2 pr-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {session.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 size-4 text-muted-foreground" />
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col lg:overflow-visible">
          {items.map((item) => {
            const active =
              item.to === "/social" ? pathname === "/social" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
                {item.badge ? (
                  <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Tema
          </span>
          <SeletorTema />
        </div>

        <div className="hidden items-center gap-3 border-t border-border px-5 py-4 lg:flex">
          {/* O bloco de quem está logado é o lugar onde toda plataforma põe o
              acesso ao próprio perfil — procurar em outro canto seria inventar
              uma convenção só nossa. */}
          <Link
            to="/social/perfil"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 -m-1 transition-colors hover:bg-secondary"
          >
            <AccountAvatar
              gradient={session.user.avatarGradient}
              label={session.user.name}
              size={34}
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">{session.user.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => {
              signOut();
              navigate({ to: "/social/entrar", replace: true });
            }}
            className="ml-auto rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Sair"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-6 md:px-8 lg:h-screen lg:overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
