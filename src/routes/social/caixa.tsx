import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AtSign,
  CheckCheck,
  Inbox,
  LoaderCircle,
  MessageCircle,
  Radio,
  Send,
  UserCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { atualizarInbox, listarInbox, responderInbox } from "@/lib/api/social.functions";
import {
  AccountAvatar,
  EmptyState,
  InlineError,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  StatusPill,
} from "@/components/social/primitives";
import { formatDateTime, formatRelative } from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { InboxItem, PlatformUser, SocialAccount } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/caixa")({
  component: CaixaPage,
});

type Filtro = "pendentes" | "respondidos" | "todos";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "pendentes", label: "Pendentes" },
  { id: "respondidos", label: "Respondidos" },
  { id: "todos", label: "Todos" },
];

function CaixaPage() {
  const { projectId, session } = useSocialSession();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const notifiedRef = useRef<string | null>(null);

  // Polling: as redes entregam comentários e mensagens por webhook; aqui a tela
  // consulta o servidor em intervalo curto para refletir novas interações.
  const inbox = useQuery({
    queryKey: ["social", "inbox", projectId],
    queryFn: () => listarInbox({ data: { projectId: projectId ?? undefined, poll: true } }),
    enabled: Boolean(projectId),
    refetchInterval: 15_000,
  });

  const items = inbox.data?.items ?? [];
  const accounts = inbox.data?.accounts ?? [];
  const users = inbox.data?.users ?? [];

  // Notifica quando uma interação nova entra na caixa (PRD 3.5).
  useEffect(() => {
    const novoId = inbox.data?.novoId;
    if (!novoId || notifiedRef.current === novoId) return;
    notifiedRef.current = novoId;
    const item = inbox.data?.items.find((candidate) => candidate.id === novoId);
    if (item) {
      toast(`Nova ${item.kind} de ${item.authorName}`, { description: item.text });
    }
  }, [inbox.data]);

  const filtrados = items.filter((item) =>
    filtro === "todos"
      ? true
      : filtro === "pendentes"
        ? item.status === "pendente"
        : item.status === "respondido",
  );

  // A conversa aberta continua visível mesmo quando muda de status e sai do
  // filtro atual — responder não deve fazer o item sumir da tela.
  const selected = items.find((item) => item.id === selectedId) ?? filtrados[0] ?? null;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["social"] });

  const responder = useMutation({
    mutationFn: (input: { itemId: string; texto: string; autor: string }) =>
      responderInbox({ data: input }),
    onSuccess: (result) => {
      if (!result.ok) {
        setErro(result.erro);
        return;
      }
      setTexto("");
      setErro(null);
      invalidate();
      toast.success("Resposta enviada para a rede de origem.");
    },
    onError: () => setErro("Não foi possível enviar a resposta."),
  });

  const atualizar = useMutation({
    mutationFn: (input: {
      itemId: string;
      status?: "pendente" | "respondido";
      assignedTo?: string | null;
    }) => atualizarInbox({ data: input }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caixa de entrada"
        description="Comentários e mensagens diretas de todas as contas conectadas, em um só lugar."
        actions={
          <StatusPill tone="destaque">
            <Radio className="size-3 live-dot" /> Atualizando a cada 15s
          </StatusPill>
        }
      />

      {inbox.isPending ? (
        <LoadingBlock rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Caixa vazia"
          description="Assim que chegar um comentário ou mensagem nas contas conectadas, ele aparece aqui."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
          <div className="surface-card flex max-h-[70vh] flex-col overflow-hidden">
            <div className="flex items-center gap-1 border-b border-border p-3">
              {FILTROS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFiltro(option.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    filtro === option.id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                  {option.id === "pendentes" && inbox.data?.pendentes
                    ? ` (${inbox.data.pendentes})`
                    : ""}
                </button>
              ))}
            </div>

            <ul className="flex-1 divide-y divide-border overflow-y-auto">
              {filtrados.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(item.id);
                      setErro(null);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 p-3 text-left transition-colors",
                      selected?.id === item.id ? "bg-secondary/70" : "hover:bg-secondary/40",
                    )}
                  >
                    <AccountAvatar
                      gradient={item.avatarGradient}
                      label={item.authorName}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{item.authorName}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {formatRelative(item.receivedAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.text}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <KindPill kind={item.kind} />
                        {item.status === "pendente" ? (
                          <StatusPill tone="atencao">pendente</StatusPill>
                        ) : (
                          <StatusPill tone="positivo">respondido</StatusPill>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
              {filtrados.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma interação neste filtro.
                </li>
              ) : null}
            </ul>
          </div>

          {selected ? (
            <ConversationPanel
              item={selected}
              account={accounts.find((account) => account.id === selected.accountId)}
              users={users}
              texto={texto}
              onTexto={setTexto}
              erro={erro}
              enviando={responder.isPending}
              onEnviar={() => {
                setSelectedId(selected.id);
                responder.mutate({
                  itemId: selected.id,
                  texto,
                  autor: session?.user.name ?? "Equipe",
                });
              }}
              onAtribuir={(userId) =>
                atualizar.mutate({ itemId: selected.id, assignedTo: userId || null })
              }
              onStatus={(status) => atualizar.mutate({ itemId: selected.id, status })}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function KindPill({ kind }: { kind: InboxItem["kind"] }) {
  return (
    <StatusPill tone="neutro">
      {kind === "comentario" ? <AtSign className="size-3" /> : <MessageCircle className="size-3" />}
      {kind === "comentario" ? "comentário" : "mensagem"}
    </StatusPill>
  );
}

function ConversationPanel({
  item,
  account,
  users,
  texto,
  onTexto,
  erro,
  enviando,
  onEnviar,
  onAtribuir,
  onStatus,
}: {
  item: InboxItem;
  account?: SocialAccount;
  users: PlatformUser[];
  texto: string;
  onTexto: (value: string) => void;
  erro: string | null;
  enviando: boolean;
  onEnviar: () => void;
  onAtribuir: (userId: string) => void;
  onStatus: (status: "pendente" | "respondido") => void;
}) {
  return (
    <div className="surface-card flex max-h-[70vh] flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <AccountAvatar gradient={item.avatarGradient} label={item.authorName} size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{item.authorName}</span>
            <span className="text-sm text-muted-foreground">{item.authorHandle}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <KindPill kind={item.kind} />
            {account ? <NetworkChip networkId={account.networkId} /> : null}
            {account ? <span>{account.handle}</span> : null}
            {item.postId ? <span>· na publicação {item.postId}</span> : null}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="responsavel">
            Responsável
          </label>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5">
            <UserCheck className="size-3.5 text-muted-foreground" />
            <select
              id="responsavel"
              value={item.assignedTo ?? ""}
              onChange={(event) => onAtribuir(event.target.value)}
              className="bg-transparent text-xs outline-none"
            >
              <option value="">Sem responsável</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => onStatus(item.status === "pendente" ? "respondido" : "pendente")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-secondary"
          >
            <CheckCheck className="size-3.5" />
            {item.status === "pendente" ? "Marcar como respondido" : "Reabrir"}
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-secondary/50 px-4 py-3">
          <p className="text-sm">{item.text}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {formatDateTime(item.receivedAt)}
          </p>
        </div>

        {item.replies.map((reply) => (
          <div
            key={reply.id}
            className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary/20 px-4 py-3"
          >
            <p className="text-sm">{reply.text}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {reply.author} · {formatDateTime(reply.sentAt)}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border p-4">
        {erro ? <InlineError>{erro}</InlineError> : null}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={texto}
            onChange={(event) => onTexto(event.target.value)}
            placeholder={`Responder ${item.kind === "comentario" ? "no comentário" : "na conversa"}…`}
            className="min-h-11 flex-1 resize-y rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={onEnviar}
            disabled={enviando || texto.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {enviando ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Enviar
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          A resposta é publicada na rede de origem. Mensagens diretas dependem das permissões de
          mensageria aprovadas para a conta.
        </p>
      </div>
    </div>
  );
}
