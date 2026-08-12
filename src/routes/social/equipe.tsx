import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, LoaderCircle, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  atualizarUsuario,
  convidarUsuario,
  definirSenha,
  listarUsuarios,
} from "@/lib/api/social.functions";
import {
  AccountAvatar,
  InlineError,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, formatRelative } from "@/lib/social/format";
import { Restrito } from "@/components/social/restrito";
import { useSocialSession } from "@/lib/social/session";
import type { Project, UserRole } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/equipe")({
  component: () => (
    <Restrito ability="admin" titulo="A tela de Equipe é restrita a administradores">
      <EquipePage />
    </Restrito>
  ),
});

const ROLES = Object.keys(ROLE_LABELS) as UserRole[];

function EquipePage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const dados = useQuery({
    queryKey: ["social", "usuarios"],
    queryFn: () => listarUsuarios(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["social", "usuarios"] });

  const atualizar = useMutation({
    mutationFn: (input: { userId: string; role?: UserRole; projectIds?: string[] }) =>
      atualizarUsuario({ data: input }),
    onSuccess: () => {
      invalidate();
      toast.success("Permissões atualizadas.");
    },
    onError: () => toast.error("Não foi possível atualizar o usuário."),
  });

  const users = dados.data?.users ?? [];
  const projects = dados.data?.projects ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Equipe e permissões"
        description="Quem acessa a plataforma, com qual papel e em quais projetos."
        actions={
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="size-4" /> Convidar
          </button>
        }
      />

      <SectionCard title="Usuários" icon={Users}>
        {dados.isPending ? (
          <LoadingBlock rows={4} />
        ) : (
          <ul className="space-y-3">
            {users.map((user) => (
              <li key={user.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <AccountAvatar gradient={user.avatarGradient} label={user.name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Ativo {formatRelative(user.lastActiveAt)}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Papel
                    </label>
                    <select
                      value={user.role}
                      onChange={(event) =>
                        atualizar.mutate({ userId: user.id, role: event.target.value as UserRole })
                      }
                      className="w-44 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <SenhaDoUsuario email={user.email} onSalvo={invalidate} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Projetos
                  </span>
                  {projects.map((project) => {
                    const checked = user.projectIds.includes(project.id);
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() =>
                          atualizar.mutate({
                            userId: user.id,
                            projectIds: checked
                              ? user.projectIds.filter((id) => id !== project.id)
                              : [...user.projectIds, project.id],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          checked
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {project.name}
                      </button>
                    );
                  })}
                  <p className="ml-auto text-xs text-muted-foreground">
                    {ROLE_DESCRIPTIONS[user.role]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="O que cada papel enxerga"
        description="O isolamento por projeto vale para métricas, publicações, impulsionamentos e relacionamento."
        icon={ShieldCheck}
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {ROLES.map((role) => (
            <li key={role} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <StatusPill tone="destaque">{ROLE_LABELS[role]}</StatusPill>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <ConvidarDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projects={projects}
        onInvited={invalidate}
      />
    </div>
  );
}

function ConvidarDialog({
  open,
  onOpenChange,
  projects,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("editor");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const convidar = useMutation({
    mutationFn: () => convidarUsuario({ data: { name, email, role, projectIds } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setErro(result.erro);
        return;
      }
      onInvited();
      onOpenChange(false);
      setName("");
      setEmail("");
      setProjectIds([]);
      toast.success("Convite enviado.");
    },
    onError: () => setErro("Não foi possível enviar o convite."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            Defina o papel e os projetos que a pessoa poderá acessar.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setErro(null);
            if (projectIds.length === 0) {
              setErro("Selecione ao menos um projeto.");
              return;
            }
            convidar.mutate();
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="nome" className="text-sm font-medium">
              Nome
            </label>
            <input
              id="nome"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="emailConvite" className="text-sm font-medium">
              E-mail
            </label>
            <input
              id="emailConvite"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="papel" className="text-sm font-medium">
              Papel
            </label>
            <select
              id="papel"
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm"
            >
              {ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Projetos</span>
            <div className="flex flex-wrap gap-2">
              {projects.map((project) => {
                const checked = projectIds.includes(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() =>
                      setProjectIds((current) =>
                        checked
                          ? current.filter((id) => id !== project.id)
                          : [...current, project.id],
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      checked
                        ? "border-accent bg-accent/10"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {project.name}
                  </button>
                );
              })}
            </div>
          </div>

          {erro ? <InlineError>{erro}</InlineError> : null}

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={convidar.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {convidar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Enviar convite
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Define a senha de alguém do time.
 *
 * Existe porque o script de linha de comando resolve só o primeiro acesso: ele
 * grava no banco, e a aplicação já no ar continua com o estado que leu na
 * subida. Feito por aqui, a troca vale na hora — memória e banco juntos.
 */
function SenhaDoUsuario({ email, onSalvo }: { email: string; onSalvo: () => void }) {
  const { session } = useSocialSession();
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () =>
      // Quem está pedindo vem da sessão do servidor, não daqui.
      definirSenha({ data: { email, senhaNova: senha } }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setSenha("");
      setErro(null);
      setAberto(false);
      onSalvo();
      toast.success(`Senha de ${email} definida.`);
    },
    onError: () => setErro("Não foi possível definir a senha."),
  });

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
      >
        <KeyRound className="size-3.5" />
        Definir senha
      </button>
    );
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <label
        htmlFor={`senha-${email}`}
        className="text-xs uppercase tracking-[0.14em] text-muted-foreground"
      >
        Senha nova
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`senha-${email}`}
          type="password"
          value={senha}
          autoComplete="new-password"
          onChange={(event) => setSenha(event.target.value)}
          placeholder="pelo menos 8 caracteres"
          className="w-52 rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending || senha.length < 8}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setSenha("");
            setErro(null);
          }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-secondary"
        >
          Cancelar
        </button>
      </div>
      {erro ? <InlineError>{erro}</InlineError> : null}
    </div>
  );
}
