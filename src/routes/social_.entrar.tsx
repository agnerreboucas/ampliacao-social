import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BarChart3, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { autenticar } from "@/lib/api/social.functions";
import { InlineError } from "@/components/social/primitives";
import { SocialSessionProvider, useSocialSession } from "@/lib/social/session";

export const Route = createFileRoute("/social_/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar — Social Hub" },
      {
        name: "description",
        content: "Acesse a plataforma de gestão e métricas de redes sociais.",
      },
    ],
  }),
  component: () => (
    <SocialSessionProvider>
      <LoginScreen />
    </SocialSessionProvider>
  ),
});

function LoginScreen() {
  const navigate = useNavigate();
  const { ready, session, signIn } = useSocialSession();
  const [email, setEmail] = useState("ana@ampliacao.com.br");
  const [senha, setSenha] = useState("ampliacao");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) {
      navigate({ to: "/social", replace: true });
    }
  }, [ready, session, navigate]);

  const login = useMutation({
    mutationFn: (input: { email: string; senha: string }) => autenticar({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        setErro(result.erro);
        return;
      }
      signIn(result.session);
      navigate({ to: "/social" });
    },
    onError: () => setErro("Não foi possível entrar agora. Tente novamente."),
  });

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3">
          <div
            className="grid size-11 place-items-center rounded-xl"
            style={{ background: "var(--gradient-brand)" }}
          >
            <BarChart3 className="size-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Ampliação Marketing Digital
            </div>
            <div className="text-lg font-semibold">
              Social <span className="text-accent">Hub</span>
            </div>
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Entrar na plataforma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestão, métricas e atendimento das suas redes sociais em um só painel.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setErro(null);
            login.mutate({ email, senha });
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="senha" className="text-sm font-medium">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {erro ? <InlineError>{erro}</InlineError> : null}

          <button
            type="submit"
            disabled={login.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {login.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Entrar
          </button>
        </form>

        <p className="mt-6 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-xs text-muted-foreground">
          Ambiente de demonstração: entre com um dos usuários cadastrados (
          <span className="text-foreground">ana@</span>,{" "}
          <span className="text-foreground">bruno@</span>,{" "}
          <span className="text-foreground">carla@</span> ou{" "}
          <span className="text-foreground">diego@</span>
          ampliacao.com.br) e qualquer senha. Cada usuário tem um papel diferente e vê um conjunto
          distinto de módulos.
        </p>
      </div>
    </div>
  );
}
