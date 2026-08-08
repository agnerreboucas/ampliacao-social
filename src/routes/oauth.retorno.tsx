import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { concluirConexaoMeta, conectarContasEscolhidas } from "@/lib/api/social.functions";
import { InlineError, NetworkChip } from "@/components/social/primitives";
import { SocialSessionProvider } from "@/lib/social/session";
import { cn } from "@/lib/utils";

/**
 * Página de retorno do OAuth da Meta.
 *
 * É para cá que a Meta manda a pessoa depois de autorizar. Recebemos o `code`,
 * trocamos por token no servidor e listamos as contas que ela administra para
 * ela escolher quais entram na plataforma — quem tem cinco Páginas raramente
 * quer as cinco no painel.
 */

const buscaSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const Route = createFileRoute("/oauth/retorno")({
  validateSearch: buscaSchema,
  head: () => ({
    meta: [{ title: "Conectando contas — Social Hub" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <SocialSessionProvider>
      <RetornoOAuth />
    </SocialSessionProvider>
  ),
});

function RetornoOAuth() {
  const { code, state, error, error_description: descricao } = Route.useSearch();
  const navigate = useNavigate();
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const conclusao = useQuery({
    queryKey: ["oauth", "meta", code, state],
    queryFn: () => concluirConexaoMeta({ data: { code: code!, state: state! } }),
    enabled: Boolean(code && state),
    retry: false,
  });

  const conectar = useMutation({
    mutationFn: (descobertaId: string) =>
      conectarContasEscolhidas({ data: { descobertaId, externalIds: escolhidas } }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        setErroLocal(resultado.erro);
        return;
      }
      navigate({ to: "/social/contas" });
    },
    onError: () => setErroLocal("Não foi possível concluir a conexão. Tente novamente."),
  });

  // A pessoa cancelou na tela da Meta, ou a autorização foi negada.
  if (error) {
    return (
      <Moldura titulo="Autorização não concluída">
        <p className="text-sm text-muted-foreground">
          {descricao ?? "A autorização foi cancelada antes de terminar."}
        </p>
        <Voltar />
      </Moldura>
    );
  }

  if (!code || !state) {
    return (
      <Moldura titulo="Endereço incompleto">
        <p className="text-sm text-muted-foreground">
          Esta página só funciona no retorno da autorização da Meta. Comece a conexão pela tela de
          contas.
        </p>
        <Voltar />
      </Moldura>
    );
  }

  if (conclusao.isPending) {
    return (
      <Moldura titulo="Conversando com a Meta">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Validando a autorização e buscando suas contas…
        </p>
      </Moldura>
    );
  }

  if (conclusao.isError || !conclusao.data?.ok) {
    return (
      <Moldura titulo="Não foi possível conectar">
        <InlineError>
          {conclusao.data && !conclusao.data.ok
            ? conclusao.data.erro
            : "A Meta não respondeu como esperado. Tente conectar de novo."}
        </InlineError>
        <Voltar />
      </Moldura>
    );
  }

  // Guardamos em constantes locais: o estreitamento do tipo não sobrevive
  // dentro dos callbacks do JSX.
  const { contas, descobertaId } = conclusao.data;

  return (
    <Moldura titulo="Escolha o que conectar">
      <p className="text-sm text-muted-foreground">
        Encontramos {contas.length} conta(s) que você administra. Marque as que devem entrar na
        plataforma — você pode conectar as outras depois.
      </p>

      <ul className="mt-5 space-y-2">
        {contas.map((conta) => {
          const marcada = escolhidas.includes(conta.externalId);
          return (
            <li key={conta.externalId}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                  marcada ? "border-accent bg-accent/10" : "border-border hover:bg-secondary/60",
                )}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={marcada}
                  onChange={() =>
                    setEscolhidas((atual) =>
                      marcada
                        ? atual.filter((id) => id !== conta.externalId)
                        : [...atual, conta.externalId],
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{conta.displayName}</div>
                  <div className="truncate text-xs text-muted-foreground">{conta.handle}</div>
                </div>
                {conta.jaConectada ? (
                  <span className="text-xs text-muted-foreground">já conectada</span>
                ) : null}
                <NetworkChip networkId={conta.networkId} />
              </label>
            </li>
          );
        })}
      </ul>

      {erroLocal ? (
        <div className="mt-4">{erroLocal ? <InlineError>{erroLocal}</InlineError> : null}</div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={escolhidas.length === 0 || conectar.isPending}
          onClick={() => conectar.mutate(descobertaId)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {conectar.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Conectar {escolhidas.length > 0 ? `${escolhidas.length} conta(s)` : ""}
        </button>
        <Voltar />
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        As permissões concedidas podem ser revogadas a qualquer momento nas configurações da sua
        conta na Meta. A plataforma nunca recebe sua senha.
      </p>
    </Moldura>
  );
}

function Moldura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="surface-card p-6">
          <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Voltar() {
  return (
    <a
      href="/social/contas"
      className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
    >
      Voltar para contas
    </a>
  );
}
