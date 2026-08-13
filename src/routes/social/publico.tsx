import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Clock, Info, MapPin, Megaphone, Users, UsersRound, X } from "lucide-react";
import { useState } from "react";

import { analisarPublico, detalharCidade } from "@/lib/api/social.functions";
import {
  AccountAvatar,
  EmptyState,
  LoadingBlock,
  NetworkChip,
  PageHeader,
  PeriodFilter,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import { PiramideEtaria } from "@/components/social/piramide-etaria";
import { NOME_DO_FORMATO } from "@/lib/social/conteudo";
import { EXPLICACAO_DA_ORIGEM, ROTULO_DA_RELACAO, type OrigemDoDado } from "@/lib/social/publico";
import { NETWORKS } from "@/lib/social/networks";
import {
  formatCompact,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import type { PeriodKey } from "@/lib/social/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/publico")({
  component: PublicoPage,
});

const ROTULO_DA_ORIGEM: Record<OrigemDoDado, string> = {
  segmentacao: "anúncio",
  perfil_da_rede: "estimativa da rede",
  leitura_manual: "digitado",
};

/**
 * Quem é o público e onde ele está.
 *
 * Esta é a tela onde a honestidade sobre a origem do dado importa mais que em
 * qualquer outra. Um painel que mostra "42% do público é de Recife" com a mesma
 * tipografia de "alcance: 12.000" sugere que os dois têm o mesmo lastro — e não
 * têm. Por isso cada cidade carrega uma etiqueta dizendo de onde o número veio,
 * e o aviso do topo explica o que a plataforma não sabe.
 */
function PublicoPage() {
  const { projectId } = useSocialSession();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [cidadeAberta, setCidadeAberta] = useState<string | null>(null);

  const dados = useQuery({
    queryKey: ["social", "publico", projectId, period],
    queryFn: () => analisarPublico({ data: { projectId: projectId ?? undefined, period } }),
    enabled: Boolean(projectId),
  });

  const dado = dados.data;
  const contasSemDado = (dado?.demografia.semDado ?? []).reduce(
    (total, linha) => total + linha.contas,
    0,
  );
  const maiorAlcance = Math.max(...(dado?.cidades.map((c) => c.alcancePago) ?? [0]), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Público"
        description="Quem interage, onde está e a que horas aparece."
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {dados.isPending || !dado ? (
        <LoadingBlock rows={4} />
      ) : (
        <>
          {/* O aviso vem antes dos números, não depois. Quem lê os números
              primeiro e a ressalva depois já decidiu. */}
          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <p className="font-medium">De onde vêm estes números</p>
              <p className="mt-1 text-muted-foreground">
                Cidade com etiqueta <strong>anúncio</strong> é alcance contratado: aquelas pessoas
                foram atingidas ali, está no contrato da campanha.{" "}
                <strong>Estimativa da rede</strong> é a distribuição de seguidores que o Instagram e
                o Facebook informam, em agregado — é palpite deles, sobre seguidores, não sobre quem
                foi alcançado.
              </p>
              <p className="mt-1.5 text-muted-foreground">
                O que nenhuma rede entrega é a cidade de quem comentou. Por isso a plataforma não
                cruza assunto com cidade — seria inventar, e decisão de campanha tomada sobre número
                inventado sai cara.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador rotulo="Pessoas que interagiram" valor={formatNumber(dado.perfil.pessoas)} />
            <Indicador
              rotulo="Interações por pessoa"
              valor={dado.perfil.interacoesPorPessoa.toFixed(1)}
              nota="quanto maior, mais fiel a base"
            />
            <Indicador
              rotulo="Hora de pico"
              valor={dado.perfil.horaDePico === null ? "—" : `${dado.perfil.horaDePico}h`}
              nota="quando mais gente fala"
            />
            <Indicador
              rotulo="Cidades alcançadas"
              valor={formatNumber(dado.cidades.length)}
              nota="com dado de alguma origem"
            />
          </div>

          <SectionCard
            title="Quem são: gênero e idade"
            description="Distribuição dos seguidores segundo o perfil de público da rede. É sobre quem segue — não sobre quem foi alcançado pelos anúncios."
            icon={UsersRound}
            actions={
              dado.demografia.faixaDominante ? (
                <StatusPill tone="destaque">
                  maior faixa: {dado.demografia.faixaDominante} anos
                </StatusPill>
              ) : null
            }
          >
            {dado.demografia.pessoas === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Nenhuma conta deste projeto tem o recorte por gênero e idade.</p>
                {dado.demografia.semDado.map((linha) => (
                  <p key={linha.motivo} className="text-xs">
                    · {linha.motivo}
                    {linha.contas > 1 ? ` (${linha.contas} contas)` : ""}
                  </p>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <PiramideEtaria demografia={dado.demografia} />
                <p className="text-xs text-muted-foreground">
                  Soma de {formatNumber(dado.demografia.pessoas)} perfis em {dado.demografia.contas}{" "}
                  {dado.demografia.contas === 1 ? "conta" : "contas"}. Quem segue em mais de uma
                  rede é contado uma vez por rede — nenhuma delas informa que é a mesma pessoa.
                  {contasSemDado > 0
                    ? ` ${contasSemDado} ${
                        contasSemDado === 1 ? "conta ficou" : "contas ficaram"
                      } de fora por não ter o dado.`
                    : ""}
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Cidades"
            description="Ordenado por alcance de anúncio, que é o número mais firme. Clique numa cidade para ver o que chegou lá."
            icon={MapPin}
          >
            {dado.cidades.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma cidade com dado ainda. O alcance por cidade aparece quando houver
                impulsionamento segmentado, ou quando o perfil de público da rede for sincronizado.
              </p>
            ) : (
              <ul className="space-y-2">
                {dado.cidades.map((cidade) => (
                  <li key={cidade.cidade}>
                    <button
                      type="button"
                      onClick={() =>
                        setCidadeAberta(cidadeAberta === cidade.cidade ? null : cidade.cidade)
                      }
                      className={cn(
                        "w-full min-w-0 rounded-xl border p-3 text-left transition-colors",
                        cidadeAberta === cidade.cidade
                          ? "border-accent bg-accent/5"
                          : "border-border hover:bg-secondary/50",
                      )}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="min-w-0 truncate font-medium">{cidade.cidade}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {cidade.origens.map((origem) => (
                            <StatusPill
                              key={origem}
                              tone={origem === "segmentacao" ? "destaque" : "neutro"}
                            >
                              {ROTULO_DA_ORIGEM[origem]}
                            </StatusPill>
                          ))}
                        </div>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.max((cidade.alcancePago / maiorAlcance) * 100, 2)}%`,
                          }}
                        />
                      </div>

                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {cidade.alcancePago > 0 ? (
                          <span>
                            <strong className="text-foreground">
                              {formatNumber(cidade.alcancePago)}
                            </strong>{" "}
                            pessoas alcançadas por anúncio
                          </span>
                        ) : null}
                        {cidade.investido > 0 ? (
                          <span>{formatCurrency(cidade.investido)} investidos</span>
                        ) : null}
                        {cidade.fatiaDeSeguidores > 0 ? (
                          <span>
                            {formatPercent(cidade.fatiaDeSeguidores * 100)} dos seguidores
                            {cidade.seguidoresEstimados > 0
                              ? ` (~${formatNumber(cidade.seguidoresEstimados)})`
                              : ""}
                          </span>
                        ) : null}
                      </p>
                    </button>

                    {cidadeAberta === cidade.cidade ? (
                      <DetalheDaCidade
                        cidade={cidade.cidade}
                        projectId={projectId}
                        onFechar={() => setCidadeAberta(null)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {dado.redesSemPerfil.length > 0 ? (
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                {dado.redesSemPerfil.map((rede) => NETWORKS[rede].label).join(", ")} não expõe(m)
                perfil de público pela API — o que aparecer dessas redes virá de anúncio ou de
                leitura manual.
              </p>
            ) : null}
          </SectionCard>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <SectionCard
              title="Grau de relação"
              description="Como cada pessoa que interage está classificada."
              icon={Users}
            >
              {dado.perfil.porRelacao.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguém interagiu ainda.</p>
              ) : (
                <ul className="space-y-3">
                  {dado.perfil.porRelacao.map((linha) => {
                    const fatia = dado.perfil.pessoas > 0 ? linha.pessoas / dado.perfil.pessoas : 0;
                    return (
                      <li key={linha.relacao}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span>{ROTULO_DA_RELACAO[linha.relacao]}</span>
                          <span className="tabular-nums">
                            {formatNumber(linha.pessoas)} ({formatPercent(fatia * 100, 0)})
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${Math.max(fatia * 100, 2)}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatNumber(linha.interacoes)} interação(ões)
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link
                to="/social/relacionamento"
                className="mt-4 inline-block text-xs text-accent hover:underline"
              >
                Reclassificar pessoas no Relacionamento →
              </Link>
            </SectionCard>

            <SectionCard
              title="A que horas seu público fala"
              description="Quando as interações chegaram, hora a hora."
              icon={Clock}
            >
              <HorasDoDia horas={dado.perfil.porHora} pico={dado.perfil.horaDePico} />
            </SectionCard>
          </div>

          <SectionCard
            title="Quem mais interage"
            description="As pessoas que mais falam com o projeto. Clique para ver a conversa."
            icon={Megaphone}
          >
            {dado.perfil.maisAtivas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém interagiu ainda.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {dado.perfil.maisAtivas.map((pessoa) => (
                  <li
                    key={pessoa.handle}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <AccountAvatar gradient={pessoa.avatarGradient} label={pessoa.nome} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{pessoa.nome}</span>
                        <StatusPill tone={pessoa.relacao === "defensor" ? "positivo" : "neutro"}>
                          {ROTULO_DA_RELACAO[pessoa.relacao].replace(/e?s$/, "")}
                        </StatusPill>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {pessoa.handle} · última em {formatDateTime(pessoa.ultimaEm)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {pessoa.interacoes}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}

function Indicador({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="surface-card min-w-0 p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums">{valor}</div>
      {nota ? <div className="mt-0.5 text-xs text-muted-foreground">{nota}</div> : null}
    </div>
  );
}

/** As vinte e quatro horas como barras, com o pico marcado. */
function HorasDoDia({
  horas,
  pico,
}: {
  horas: { hora: number; interacoes: number }[];
  pico: number | null;
}) {
  const maior = Math.max(...horas.map((hora) => hora.interacoes), 1);

  if (horas.every((hora) => hora.interacoes === 0)) {
    return <p className="text-sm text-muted-foreground">Sem interações registradas no período.</p>;
  }

  return (
    <div>
      <div className="flex h-28 items-end gap-0.5">
        {horas.map((hora) => (
          <div
            key={hora.hora}
            className="group relative flex-1"
            title={`${hora.hora}h — ${hora.interacoes} interação(ões)`}
          >
            <div
              className={cn(
                "w-full rounded-t transition-colors",
                hora.hora === pico ? "bg-accent" : "bg-secondary group-hover:bg-accent/50",
              )}
              style={{ height: `${Math.max((hora.interacoes / maior) * 100, 3)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
      {pico !== null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          O pico é às <strong className="text-foreground">{pico}h</strong>. Publicar um pouco antes
          costuma pegar a janela em que mais gente está por perto.
        </p>
      ) : null}
    </div>
  );
}

/**
 * O que chegou numa cidade, e por qual peça.
 *
 * É a rastreabilidade do lado do público: da cidade até a publicação, com
 * formato e dia — e não só até o número.
 */
function DetalheDaCidade({
  cidade,
  projectId,
  onFechar,
}: {
  cidade: string;
  projectId: string | null;
  onFechar: () => void;
}) {
  const detalhe = useQuery({
    queryKey: ["social", "cidade", cidade, projectId],
    queryFn: () => detalharCidade({ data: { cidade, projectId: projectId ?? undefined } }),
    enabled: Boolean(projectId),
  });

  return (
    <div className="mt-2 rounded-xl border border-border bg-secondary/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-medium">O que chegou em {cidade}</h4>
        <button
          type="button"
          onClick={onFechar}
          className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-secondary"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {detalhe.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Abrindo…</p>
      ) : !detalhe.data || detalhe.data.publicacoes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma publicação foi impulsionada especificamente para esta cidade. O que se sabe dela
          vem da estimativa de seguidores da rede, que não aponta para peças.
        </p>
      ) : (
        <>
          {detalhe.data.cidade ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {EXPLICACAO_DA_ORIGEM.segmentacao}
              {detalhe.data.publicacoes.length > 1
                ? " Quando um anúncio mira mais de uma cidade, o alcance é dividido igualmente entre elas — a rede não devolve a quebra por cidade."
                : ""}
            </p>
          ) : null}

          <ul className="mt-3 space-y-2">
            {detalhe.data.publicacoes.map(({ post, boost, conta }) => (
              <li key={boost.id}>
                <Link
                  to="/social/publicacao/$postId"
                  params={{ postId: post.id }}
                  className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card/50 p-2.5 transition-colors hover:bg-secondary/60"
                >
                  <span
                    aria-hidden
                    className="size-9 shrink-0 rounded-md"
                    style={{ background: post.coverGradient }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{post.caption || "Sem legenda"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <NetworkChip networkId={conta.networkId} />
                      <span>{NOME_DO_FORMATO[post.format]}</span>
                      {post.publishedAt ? <span>· {formatDateTime(post.publishedAt)}</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-[11px]">
                    <div className="font-semibold tabular-nums">
                      {formatCompact(boost.results.reach)}
                    </div>
                    <div className="text-muted-foreground">alcance do anúncio</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
