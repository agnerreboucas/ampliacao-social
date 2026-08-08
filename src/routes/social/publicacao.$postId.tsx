import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  AtSign,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Heart,
  Images,
  Image as ImageIcon,
  MessageCircle,
  Rocket,
  Share2,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { useState } from "react";

import { obterPublicacao } from "@/lib/api/social.functions";
import { PostPerformanceChart } from "@/components/social/charts";
import {
  AccountAvatar,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  SectionCard,
  StatCard,
  StatusPill,
  type PillTone,
} from "@/components/social/primitives";
import {
  BOOST_STATUS_LABELS,
  POST_STATUS_LABELS,
  formatCompact,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
} from "@/lib/social/format";
import type { PostStatus } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/publicacao/$postId")({
  component: PublicacaoPage,
});

const TONS_STATUS: Record<PostStatus, PillTone> = {
  rascunho: "neutro",
  aguardando_aprovacao: "atencao",
  aprovado: "destaque",
  agendado: "destaque",
  publicado: "positivo",
  falhou: "erro",
};

const PROPORCOES: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};

function PublicacaoPage() {
  const { postId } = Route.useParams();

  const detalhe = useQuery({
    queryKey: ["social", "publicacao", postId],
    queryFn: () => obterPublicacao({ data: { postId } }),
  });

  if (detalhe.isPending) return <LoadingBlock rows={5} />;

  if (!detalhe.data?.ok) {
    return (
      <div className="space-y-4">
        <PageHeader title="Publicação não encontrada" />
        <p className="text-sm text-muted-foreground">
          Ela pode ter sido excluída. Volte para a lista para ver o que existe hoje.
        </p>
        <Link
          to="/social/publicacoes"
          className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
        >
          <ArrowLeft className="size-4" /> Publicações
        </Link>
      </div>
    );
  }

  const {
    post,
    contas,
    autor,
    aprovador,
    itensMidia,
    porConta,
    curva,
    interacoes,
    taxaEngajamento,
    etapas,
    boosts,
    inbox,
    dadosReais,
  } = detalhe.data;

  return (
    <div className="space-y-6">
      <Link
        to="/social/publicacoes"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Publicações
      </Link>

      <PageHeader
        title={post.publishedAt ? `Publicado em ${formatDateTime(post.publishedAt)}` : "Publicação"}
        description={
          post.scheduledFor && !post.publishedAt
            ? `Agendado para ${formatDateTime(post.scheduledFor)}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={TONS_STATUS[post.status]}>
              {POST_STATUS_LABELS[post.status]}
            </StatusPill>
            {!dadosReais ? <StatusPill tone="neutro">números de demonstração</StatusPill> : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start">
        <VisualizadorDeMidia
          formato={post.format}
          itens={itensMidia}
          proporcao={post.media.aspectRatio}
          gradiente={post.coverGradient}
          tamanhoMb={post.media.fileSizeMb}
          duracao={post.media.durationSeconds}
        />

        <div className="space-y-4">
          <SectionCard title="Legenda" icon={AtSign}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {post.caption || "Sem legenda."}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">{post.caption.length} caracteres</p>
          </SectionCard>

          <SectionCard title="Onde foi publicado" icon={Users}>
            <ul className="space-y-2">
              {contas.map((conta) => (
                <li key={conta.id}>
                  <Link
                    to="/social/conta/$accountId"
                    params={{ accountId: conta.id }}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-secondary/50"
                  >
                    <AccountAvatar
                      gradient={conta.avatarGradient}
                      label={conta.displayName}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{conta.displayName}</div>
                      <div className="truncate text-xs text-muted-foreground">{conta.handle}</div>
                    </div>
                    <NetworkChip networkId={conta.networkId} />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Andamento" icon={Clock}>
            <ol className="space-y-3">
              {etapas.map((etapa) => (
                <li key={etapa.rotulo} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      etapa.concluida ? "bg-success" : "bg-muted",
                    )}
                  />
                  <div className="min-w-0">
                    <div className={cn("text-sm", etapa.concluida ? "" : "text-muted-foreground")}>
                      {etapa.rotulo}
                    </div>
                    {etapa.quando ? (
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(etapa.quando)}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              Criado por {autor?.name ?? "—"}
              {aprovador ? ` · aprovado por ${aprovador.name}` : ""}
            </p>
          </SectionCard>
        </div>
      </div>

      {post.metrics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Alcance" value={formatNumber(post.metrics.reach)} icon={Eye} />
            <StatCard
              label="Impressões"
              value={formatNumber(post.metrics.impressions)}
              hint={
                post.metrics.reach > 0
                  ? `${(post.metrics.impressions / post.metrics.reach).toFixed(2)}x por pessoa`
                  : undefined
              }
              icon={TrendingUp}
            />
            <StatCard
              label="Interações"
              value={formatNumber(interacoes)}
              hint={`Taxa de ${formatPercent(taxaEngajamento)}`}
              icon={Heart}
            />
            <StatCard
              label="Salvamentos"
              value={formatNumber(post.metrics.saves)}
              hint="sinal de conteúdo que a pessoa quer reencontrar"
              icon={Bookmark}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <SectionCard
              title="Desempenho dia a dia"
              description="Publicação em rede social tem vida curta: a curva mostra quando ela parou de render."
              icon={TrendingUp}
            >
              {curva.length > 0 ? (
                <PostPerformanceChart data={curva} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  A curva aparece depois da publicação.
                </p>
              )}
            </SectionCard>

            <SectionCard
              title="Resultado por conta"
              description="Como cada rede recebeu o mesmo conteúdo."
              icon={Users}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="pb-2 font-medium">Conta</th>
                      <th className="pb-2 text-right font-medium">Alcance</th>
                      <th className="pb-2 text-right font-medium">Interações</th>
                      <th className="pb-2 text-right font-medium">Taxa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {contas.map((conta) => {
                      const parcela = porConta[conta.id];
                      if (!parcela) return null;
                      const interacoesConta =
                        parcela.likes + parcela.comments + parcela.shares + parcela.saves;
                      const taxa = parcela.reach > 0 ? (interacoesConta / parcela.reach) * 100 : 0;
                      return (
                        <tr key={conta.id}>
                          <td className="py-2">
                            <span className="flex items-center gap-2">
                              <NetworkChip networkId={conta.networkId} />
                            </span>
                          </td>
                          <td className="py-2 text-right">{formatNumber(parcela.reach)}</td>
                          <td className="py-2 text-right">{formatNumber(interacoesConta)}</td>
                          <td className="py-2 text-right text-muted-foreground">
                            {formatPercent(taxa)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Detalhe icone={Heart} rotulo="Curtidas" valor={post.metrics.likes} />
                <Detalhe icone={MessageCircle} rotulo="Comentários" valor={post.metrics.comments} />
                <Detalhe icone={Share2} rotulo="Compartilhamentos" valor={post.metrics.shares} />
                <Detalhe icone={Bookmark} rotulo="Salvamentos" valor={post.metrics.saves} />
              </dl>
            </SectionCard>
          </div>
        </>
      ) : (
        <SectionCard title="Resultados" icon={TrendingUp}>
          <p className="text-sm text-muted-foreground">
            Esta publicação ainda não foi publicada, então não há resultado para mostrar. Os números
            aparecem aqui depois da primeira sincronização.
          </p>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SectionCard title="Impulsionamentos desta publicação" icon={Rocket}>
          {boosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nunca impulsionada. Publicações com boa taxa orgânica costumam render mais em mídia
              paga.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {boosts.map((boost) => (
                <li key={boost.id} className="flex flex-wrap items-center gap-3 py-3">
                  <StatusPill tone={boost.status === "ativo" ? "positivo" : "neutro"}>
                    {BOOST_STATUS_LABELS[boost.status]}
                  </StatusPill>
                  <span className="text-sm capitalize">{boost.objective}</span>
                  <span className="ml-auto text-right text-sm tabular-nums">
                    <span className="block">{formatCurrency(boost.results.spend)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatCompact(boost.results.reach)} de alcance
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Interações recebidas"
          description="Comentários e mensagens ligados a esta publicação."
          icon={MessageCircle}
        >
          {inbox.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum comentário ou mensagem citando esta publicação.
            </p>
          ) : (
            <ul className="space-y-3">
              {inbox.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <AccountAvatar gradient={item.avatarGradient} label={item.authorName} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{item.authorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelative(item.receivedAt)}
                      </span>
                      <StatusPill tone={item.status === "pendente" ? "atencao" : "positivo"}>
                        {item.status}
                      </StatusPill>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/social/caixa" className="mt-4 inline-flex text-sm text-accent hover:underline">
            Abrir caixa de entrada
          </Link>
        </SectionCard>
      </div>
    </div>
  );
}

function Detalhe({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: typeof Heart;
  rotulo: string;
  valor: number;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icone className="size-3.5" /> {rotulo}
      </dt>
      <dd className="mt-0.5 font-medium tabular-nums">{formatNumber(valor)}</dd>
    </div>
  );
}

/**
 * Visualizador da mídia.
 *
 * Sem upload ainda, o quadro mostra a proporção real que será publicada e
 * permite navegar item por item no carrossel — é o que dá para conferir antes de
 * a mídia de verdade existir. O enquadramento é fiel: o que aparece aqui é a
 * área que a rede vai exibir.
 */
function VisualizadorDeMidia({
  formato,
  itens,
  proporcao,
  gradiente,
  tamanhoMb,
  duracao,
}: {
  formato: "imagem" | "carrossel" | "video";
  itens: string[];
  proporcao: string;
  gradiente: string;
  tamanhoMb: number;
  duracao?: number;
}) {
  const [atual, setAtual] = useState(0);
  const Icone = formato === "video" ? Video : formato === "carrossel" ? Images : ImageIcon;

  return (
    <SectionCard title="Mídia" icon={Icone}>
      <div
        className={cn(
          "relative grid w-full place-items-center overflow-hidden rounded-xl",
          PROPORCOES[proporcao] ?? "aspect-square",
        )}
        style={{ background: gradiente }}
      >
        <div className="text-center text-white/90">
          <Icone className="mx-auto size-8" />
          <div className="mt-2 text-sm font-medium">{itens[atual]}</div>
          <div className="text-xs text-white/70">{proporcao}</div>
        </div>

        {itens.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => setAtual((i) => (i === 0 ? itens.length - 1 : i - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur transition-colors hover:bg-black/60"
              aria-label="Item anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setAtual((i) => (i === itens.length - 1 ? 0 : i + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur transition-colors hover:bg-black/60"
              aria-label="Próximo item"
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="absolute bottom-3 flex gap-1.5">
              {itens.map((item, indice) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAtual(indice)}
                  aria-label={`Ir para ${item}`}
                  className={cn(
                    "size-1.5 rounded-full transition-colors",
                    indice === atual ? "bg-white" : "bg-white/40",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Formato</dt>
          <dd className="capitalize">{formato}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Itens</dt>
          <dd className="tabular-nums">{itens.length}</dd>
        </div>
        {duracao ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Duração</dt>
            <dd className="tabular-nums">{duracao}s</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Arquivo</dt>
          <dd className="tabular-nums">{tamanhoMb} MB</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        O upload de arquivo ainda não existe: o quadro acima mostra o enquadramento que a rede vai
        usar, com base no formato e na proporção escolhidos.
      </p>
    </SectionCard>
  );
}
