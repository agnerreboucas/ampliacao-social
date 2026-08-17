import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CirclePlay,
  Images,
  Image as ImageIcon,
  LoaderCircle,
  Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { criarPublicacao, validarRascunho } from "@/lib/api/social.functions";
import { AccountAvatar, InlineError, NetworkChip } from "@/components/social/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MIDIA_PADRAO, NETWORKS } from "@/lib/social/networks";
import type { FormatoPublicavel, PostMedia, SocialAccount } from "@/lib/social/types";
import { cn } from "@/lib/utils";

const FORMAT_OPTIONS: {
  id: FormatoPublicavel;
  label: string;
  icon: typeof ImageIcon;
  hint: string;
}[] = [
  { id: "imagem", label: "Imagem única", icon: ImageIcon, hint: "1 arquivo" },
  { id: "carrossel", label: "Carrossel", icon: Images, hint: "2 a 10 imagens" },
  { id: "video", label: "Vídeo", icon: Video, hint: "Reels ou feed" },
  { id: "story", label: "Story", icon: CirclePlay, hint: "9:16, sai do ar em 24h" },
];

const ASPECT_OPTIONS: PostMedia["aspectRatio"][] = ["1:1", "4:5", "9:16", "16:9"];

export function PostEditorDialog({
  open,
  onOpenChange,
  accounts,
  projectId,
  userId,
  onCreated,
  diaSugerido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: SocialAccount[];
  projectId: string;
  userId: string;
  onCreated: () => void;
  /**
   * O dia que já estava escolhido quando o editor abriu — vem do calendário.
   *
   * Chega como `AAAA-MM-DD` e vira `AAAA-MM-DDT09:00`. A hora é um palpite, e é
   * de propósito: quem clicou num dia escolheu o dia, não o horário, e um campo
   * de agendamento vazio obrigaria a redigitar a data que a pessoa acabou de
   * apontar com o dedo. Nove da manhã é editável em dois cliques.
   */
  diaSugerido?: string;
}) {
  const [format, setFormat] = useState<FormatoPublicavel>("imagem");
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<PostMedia>(MIDIA_PADRAO.imagem);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [scheduledFor, setScheduledFor] = useState(diaSugerido ? `${diaSugerido}T09:00` : "");
  const [erro, setErro] = useState<string | null>(null);

  const selectedAccounts = accounts.filter((account) => accountIds.includes(account.id));

  // Limite de legenda mais restrito entre as redes escolhidas.
  const captionLimit = useMemo(() => {
    if (selectedAccounts.length === 0) return 2200;
    return Math.min(
      ...selectedAccounts.map((account) => NETWORKS[account.networkId].captionMaxLength),
    );
  }, [selectedAccounts]);

  const validacao = useQuery({
    queryKey: ["social", "validacao", accountIds, format, caption.length, media],
    queryFn: () => validarRascunho({ data: { accountIds, format, caption, media } }),
    enabled: open && accountIds.length > 0,
  });

  const criar = useMutation({
    mutationFn: (acao: "publicar" | "agendar" | "rascunho") =>
      criarPublicacao({
        data: {
          projectId,
          accountIds,
          format,
          caption,
          media,
          createdBy: userId,
          requiresApproval,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
          acao,
        },
      }),
    onSuccess: (result, acao) => {
      if (!result.ok) {
        setErro("Corrija os erros de formato antes de publicar.");
        return;
      }
      onCreated();
      onOpenChange(false);
      reset();
      toast.success(
        acao === "rascunho"
          ? "Rascunho salvo."
          : result.post.status === "aguardando_aprovacao"
            ? "Publicação enviada para aprovação."
            : acao === "agendar"
              ? "Publicação agendada."
              : "Publicação enviada às redes.",
      );
    },
    onError: () => setErro("Não foi possível salvar a publicação."),
  });

  function reset() {
    setFormat("imagem");
    setCaption("");
    setMedia(MIDIA_PADRAO.imagem);
    setAccountIds([]);
    setScheduledFor("");
    setErro(null);
  }

  function changeFormat(next: FormatoPublicavel) {
    setFormat(next);
    setMedia(MIDIA_PADRAO[next]);
  }

  const issues = validacao.data?.issues ?? [];
  // Sem uma validação bem-sucedida não liberamos publicar nem agendar.
  const bloqueado = validacao.data?.bloqueado ?? validacao.isError;
  const semContas = accountIds.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova publicação</DialogTitle>
          <DialogDescription>
            Escolha o formato, escreva a legenda e selecione as contas de destino. Os limites de
            cada rede são validados antes do envio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <span className="text-sm font-medium">Formato</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => changeFormat(option.id)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                    format === option.id
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-secondary/60",
                  )}
                >
                  <option.icon className="mt-0.5 size-4" />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="caption" className="text-sm font-medium">
                Legenda
              </label>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  caption.length > captionLimit ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {caption.length} / {captionLimit}
              </span>
            </div>
            <textarea
              id="caption"
              rows={4}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Escreva a legenda da publicação…"
              className="w-full resize-y rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {format === "carrossel" ? (
              <NumberField
                label="Itens no carrossel"
                value={media.count}
                min={2}
                max={35}
                onChange={(count) => setMedia({ ...media, count })}
              />
            ) : null}
            {format === "video" ? (
              <NumberField
                label="Duração (s)"
                value={media.durationSeconds ?? 0}
                min={1}
                max={14400}
                onChange={(durationSeconds) => setMedia({ ...media, durationSeconds })}
              />
            ) : null}
            <NumberField
              label="Tamanho do arquivo (MB)"
              value={media.fileSizeMb}
              min={0.1}
              max={5000}
              step={0.1}
              onChange={(fileSizeMb) => setMedia({ ...media, fileSizeMb })}
            />
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Proporção</span>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_OPTIONS.map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setMedia({ ...media, aspectRatio: ratio })}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs",
                      media.aspectRatio === ratio
                        ? "border-accent bg-accent/10"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Publicar em</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {accounts.map((account) => {
                const checked = accountIds.includes(account.id);
                return (
                  <label
                    key={account.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                      checked
                        ? "border-accent bg-accent/10"
                        : "border-border hover:bg-secondary/60",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() =>
                        setAccountIds((current) =>
                          checked
                            ? current.filter((id) => id !== account.id)
                            : [...current, account.id],
                        )
                      }
                    />
                    <AccountAvatar
                      gradient={account.avatarGradient}
                      label={account.displayName}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{account.displayName}</div>
                      <div className="truncate text-xs text-muted-foreground">{account.handle}</div>
                    </div>
                    <NetworkChip networkId={account.networkId} />
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="scheduledFor" className="text-sm font-medium">
                Agendar para
              </label>
              <input
                id="scheduledFor"
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(event) => setRequiresApproval(event.target.checked)}
                className="size-4 accent-[var(--color-accent)]"
              />
              <span className="text-sm">
                Exigir aprovação antes de publicar
                <span className="block text-xs text-muted-foreground">
                  O post entra na fila como “aguardando aprovação”.
                </span>
              </span>
            </label>
          </div>

          {semContas ? (
            <p className="text-sm text-muted-foreground">
              Selecione pelo menos uma conta para validar o conteúdo.
            </p>
          ) : validacao.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> Validando limites das redes…
            </p>
          ) : validacao.isError ? (
            <InlineError>
              Não foi possível validar o conteúdo agora. Revise os campos de mídia e tente de novo.
            </InlineError>
          ) : issues.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="size-4" /> Conteúdo compatível com todas as contas
              selecionadas.
            </p>
          ) : (
            <ul className="space-y-2">
              {issues.map((issue, index) => (
                <li
                  key={`${issue.accountId}-${index}`}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                    issue.severity === "erro"
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400",
                  )}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}

          {erro ? <InlineError>{erro}</InlineError> : null}
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => criar.mutate("rascunho")}
            disabled={criar.isPending || semContas}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60"
          >
            Salvar rascunho
          </button>
          <button
            type="button"
            onClick={() => criar.mutate("agendar")}
            disabled={criar.isPending || semContas || bloqueado || !scheduledFor}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary disabled:opacity-60"
          >
            Agendar
          </button>
          <button
            type="button"
            onClick={() => criar.mutate("publicar")}
            disabled={criar.isPending || semContas || bloqueado}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {criar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {requiresApproval ? "Enviar para aprovação" : "Publicar agora"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
