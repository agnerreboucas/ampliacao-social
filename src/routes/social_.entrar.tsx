import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BarChart3, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { autenticar, situacaoAcesso } from "@/lib/api/social.functions";
import { InlineError } from "@/components/social/primitives";
import { SeletorTema } from "@/components/social/seletor-tema";
import { ROLE_LABELS } from "@/lib/social/format";
import { SocialSessionProvider, useSocialSession } from "@/lib/social/session";
import { cn } from "@/lib/utils";

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
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) {
      navigate({ to: "/social", replace: true });
    }
  }, [ready, session, navigate]);

  // Saber se há banco muda o que a tela promete a quem vai digitar.
  const acesso = useQuery({ queryKey: ["social", "acesso"], queryFn: () => situacaoAcesso() });
  // `useMemo` porque a lista entra nas dependências de um efeito: recriar o
  // array vazio a cada render faria o efeito rodar sempre.
  const usuariosDemo = useMemo(() => acesso.data?.usuarios ?? [], [acesso.data]);

  /**
   * Em demonstração, o primeiro usuário já vem preenchido.
   *
   * Quem abre o arquivo quer ver a plataforma, não descobrir uma credencial. E
   * o preenchimento vem dos dados carregados — antes era um e-mail escrito na
   * tela, que ficou apontando para um usuário inexistente no dia em que os
   * dados mudaram.
   */
  useEffect(() => {
    if (email === "" && usuariosDemo.length > 0) {
      setEmail(usuariosDemo[0].email);
      setSenha("demonstracao");
    }
  }, [email, usuariosDemo]);

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

        <div className="surface-card mt-7 p-6">
          <h1 className="text-2xl font-semibold">Entrar na plataforma</h1>
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
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5 text-sm outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="senha" className="text-sm font-medium">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                className="w-full rounded-xl border border-border bg-secondary/60 px-3.5 py-2.5 text-sm outline-none transition-shadow focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15"
              />
            </div>

            {erro ? <InlineError>{erro}</InlineError> : null}

            <button
              type="submit"
              disabled={login.isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.985] disabled:opacity-60 disabled:active:scale-100"
            >
              {login.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Entrar
            </button>
          </form>
        </div>

        <p className="mt-5 px-1 text-xs leading-relaxed text-muted-foreground">
          {acesso.data?.demonstracao === false ? (
            <>
              Use o e-mail e a senha da sua conta. Se ainda não tem senha definida, peça a um
              administrador — ela é definida pela tela de{" "}
              <span className="text-foreground">Equipe</span>.
            </>
          ) : (
            <>
              Ambiente de demonstração: <strong className="text-foreground">qualquer senha</strong>{" "}
              entra. Cada usuário tem um papel diferente e vê um conjunto distinto de módulos —
              toque em um para preencher.
            </>
          )}
        </p>

        {usuariosDemo.length > 0 ? (
          <ul className="mt-2.5 space-y-1.5">
            {usuariosDemo.map((usuario) => (
              <li key={usuario.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(usuario.email);
                    setSenha("demonstracao");
                    setErro(null);
                  }}
                  className={cn(
                    "flex w-full items-baseline gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                    email === usuario.email
                      ? "border-accent bg-accent/5"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{usuario.email}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {ROLE_LABELS[usuario.papel]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 flex justify-center">
          <SeletorTema />
        </div>
      </div>
    </div>
  );
}
