import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Clock, Lightbulb, MapPin, UserRound } from "lucide-react";
import { toast } from "sonner";

import { definirFormatoDaPauta, detalharEvento } from "@/lib/api/social.functions";
import {
  InlineError,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import { NOME_DO_FORMATO } from "@/lib/social/conteudo";
import { FASE_LABELS, TIPO_DE_EVENTO_LABELS, formatDateTime } from "@/lib/social/format";
import type { FormatoPublicavel, Post } from "@/lib/social/types";

/**
 * A tela de um compromisso da campanha.
 *
 * É o destino do clique no calendário. Antes, clicar num evento não levava a
 * lugar nenhum: a informação toda cabia — mal — no cartão do painel do dia, e
 * quem quisesse saber o que já tinha sido produzido para aquela caminhada
 * precisava caçar as peças pelo quadro.
 *
 * A tela responde a três perguntas, nesta ordem, que é a ordem em que elas
 * aparecem na cabeça de quem abre: **o que é**, **onde e quando**, e **o que já
 * saiu daqui**. A terceira é a que justifica a tela existir.
 */
export const Route = createFileRoute("/social/evento/$eventoId")({
  component: EventoPage,
});

const FORMATOS: { id: FormatoPublicavel; rotulo: string; explica: string }[] = [
  { id: "imagem", rotulo: "Post simples", explica: "Uma imagem no feed" },
  { id: "carrossel", rotulo: "Carrossel", explica: "De 2 a 10 imagens" },
  { id: "video", rotulo: "Reels / vídeo", explica: "Vertical, para reels ou feed" },
  { id: "story", rotulo: "Story", explica: "9:16, sai do ar em 24h" },
];

function EventoPage() {
  const { eventoId } = Route.useParams();
  const queryClient = useQueryClient();

  const dados = useQuery({
    queryKey: ["social", "evento", eventoId],
    queryFn: () => detalharEvento({ data: { eventoId } }),
  });

  const escolher = useMutation({
    mutationFn: (entrada: { postId: string; formato: FormatoPublicavel }) =>
      definirFormatoDaPauta({ data: entrada }),
    onSuccess: (resultado) => {
      if (!resultado.ok) {
        toast.error(resultado.erro);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["social"] });
      toast.success("Formato definido. A pauta já pode virar rascunho.");
    },
    onError: () => toast.error("Não foi possível definir o formato."),
  });

  if (dados.isPending) return <LoadingBlock rows={6} />;
  if (dados.isError || !dados.data) {
    return <InlineError>Não foi possível abrir este compromisso.</InlineError>;
  }

  const { evento, pecas, municipio } = dados.data;
  const comeco = new Date(evento.comecaEm);

  return (
    <div className="space-y-6">
      <Link
        to="/social/agenda"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar para a agenda
      </Link>

      <PageHeader
        title={evento.titulo}
        description={evento.descricao ?? "Sem descrição."}
        actions={<StatusPill tone="neutro">{TIPO_DE_EVENTO_LABELS[evento.tipo]}</StatusPill>}
      />

      <SectionCard title="Onde e quando" icon={CalendarDays}>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo icone={Clock} rotulo="Começa">
            {evento.diaInteiro
              ? `${comeco.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })} · dia inteiro`
              : formatDateTime(evento.comecaEm)}
          </Campo>

          <Campo icone={Clock} rotulo="Termina">
            {evento.terminaEm ? formatDateTime(evento.terminaEm) : "Não informado"}
          </Campo>

          <Campo icone={MapPin} rotulo="Local">
            {evento.local ?? "Não informado"}
            {municipio ? (
              // O município sai do texto do local pelo mesmo casamento de nomes
              // que o mapa usa — e por isso dá para ir do compromisso ao
              // território sem ninguém digitar código do IBGE.
              <Link to="/social/mapa" className="mt-1 block text-xs text-accent hover:underline">
                Ver {municipio.nome} no mapa
              </Link>
            ) : null}
          </Campo>

          <Campo icone={UserRound} rotulo="Responsável">
            {evento.responsavel ?? "Ninguém definido"}
          </Campo>
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">
          {evento.origem === "importado"
            ? "Veio da agenda importada do Google."
            : "Cadastrado aqui na plataforma."}
        </p>
      </SectionCard>

      <SectionCard
        title="Conteúdo que sai daqui"
        description="Todo compromisso vira pauta. O que falta em cada uma é decidir o que ela vai ser."
        icon={Lightbulb}
      >
        {pecas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma peça ainda. Compromissos criados a partir de agora já nascem com a pauta no
            quadro.
          </p>
        ) : (
          <ul className="space-y-3">
            {pecas.map((peca) => (
              <CartaoDePauta
                key={peca.id}
                peca={peca}
                ocupado={escolher.isPending && escolher.variables?.postId === peca.id}
                onEscolher={(formato) => escolher.mutate({ postId: peca.id, formato })}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Campo({
  icone: Icone,
  rotulo,
  children,
}: {
  icone: typeof Clock;
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-[0.08em] text-muted-foreground">
        <Icone className="size-3.5" /> {rotulo}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function CartaoDePauta({
  peca,
  ocupado,
  onEscolher,
}: {
  peca: Post;
  ocupado: boolean;
  onEscolher: (formato: FormatoPublicavel) => void;
}) {
  const semFormato = peca.format === "a_definir";

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link
          to="/social/publicacao/$postId"
          params={{ postId: peca.id }}
          className="min-w-0 flex-1 text-sm hover:underline"
        >
          {peca.caption || "(sem legenda)"}
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill tone="neutro">{FASE_LABELS[peca.status]}</StatusPill>
          {semFormato ? null : (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {NOME_DO_FORMATO[peca.format]}
            </span>
          )}
        </div>
      </div>

      {semFormato ? (
        <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/40 p-3">
          <p className="text-xs text-muted-foreground">
            Esta pauta ainda não tem formato. Enquanto não tiver, ela não avança para produção —
            porque uma peça sem formato é recusada pela rede na hora de publicar, que é o pior
            momento para descobrir.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {FORMATOS.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                disabled={ocupado}
                onClick={() => onEscolher(opcao.id)}
                title={opcao.explica}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs transition-colors hover:border-accent/60 hover:bg-secondary disabled:opacity-50"
              >
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}
