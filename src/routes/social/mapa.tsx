import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Info, Map as MapaIcone, Target, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { obterMapaSP } from "@/lib/api/social.functions";
import { MapaDeSaoPaulo, type Visao } from "@/components/social/mapa-sp";
import { LoadingBlock, PageHeader, SectionCard, StatusPill } from "@/components/social/primitives";
import { formatCompact, formatCurrency, formatNumber, formatPercent } from "@/lib/social/format";
import { useSocialSession } from "@/lib/social/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/social/mapa")({
  component: MapaPage,
});

const QUANTOS_PRIORITARIOS = [25, 50, 100] as const;

/**
 * O estado de São Paulo, com o que a campanha alcançou nele.
 *
 * A tela existe para responder uma pergunta de campanha estadual: **estou
 * chegando onde precisa?** Um ranking de cidades atingidas responde metade
 * disso; o mapa mostra também os vazios, e é o vazio que muda a segmentação.
 *
 * As duas visões são o eixo da tela. Prioridade mostra onde deveria estar;
 * alcance mostra onde está. Alternar entre elas no mesmo desenho é o que faz o
 * buraco aparecer.
 */
function MapaPage() {
  const { projectId } = useSocialSession();
  const [visao, setVisao] = useState<Visao>("prioridade");
  const [prioritarios, setPrioritarios] = useState<number>(50);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const dados = useQuery({
    queryKey: ["social", "mapa", projectId, prioritarios],
    queryFn: () => obterMapaSP({ data: { projectId: projectId ?? undefined, prioritarios } }),
    enabled: Boolean(projectId),
  });

  const dado = dados.data;
  const escolhido = dado?.pontos.find((ponto) => ponto.municipio.codigo === selecionado) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mapa de São Paulo"
        description="Os 645 municípios do estado, e onde a campanha está chegando."
        actions={
          <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
            {(["prioridade", "alcance"] as const).map((opcao) => (
              <button
                key={opcao}
                type="button"
                onClick={() => setVisao(opcao)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                  visao === opcao
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opcao}
              </button>
            ))}
          </div>
        }
      />

      {dados.isPending || !dado ? (
        <LoadingBlock rows={5} />
      ) : (
        <>
          {dado.pontos.every((ponto) => ponto.alcance === 0) ? (
            // Sem entrega, os quatro zeros abaixo não explicam nada sozinhos. O
            // que a tela tem a oferecer neste estado não é medição, é plano: a
            // lista de para onde apontar o primeiro anúncio.
            <div className="flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
              <Target className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="min-w-0 text-muted-foreground">
                <strong className="text-foreground">
                  Nenhum anúncio segmentado neste projeto ainda.
                </strong>{" "}
                Enquanto não houver entrega, o mapa serve para planejar: a visão <em>prioridade</em>{" "}
                mostra os municípios mais parecidos com a capital, e a lista no fim da página é, na
                prática, a ordem de segmentação sugerida. Assim que o primeiro impulsionamento
                rodar, a visão <em>alcance</em> passa a mostrar quanto de cada um foi coberto.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo={`Cobertura do top ${dado.cobertura.total}`}
              valor={`${dado.cobertura.alcancados} de ${dado.cobertura.total}`}
              nota={formatPercent(dado.cobertura.fatia * 100, 0)}
              alerta={dado.cobertura.fatia < 0.5}
            />
            <Indicador
              rotulo="População nos alcançados"
              valor={formatCompact(dado.cobertura.populacaoAlcancada)}
              nota={`de ${formatCompact(dado.cobertura.populacaoTotal)} nos prioritários`}
            />
            <Indicador
              rotulo="Municípios com entrega"
              valor={formatNumber(dado.pontos.filter((ponto) => ponto.alcance > 0).length)}
              nota="de 645 no estado"
            />
            <Indicador
              rotulo="Investido no estado"
              valor={formatCurrency(dado.pontos.reduce((soma, ponto) => soma + ponto.investido, 0))}
              nota="em anúncios segmentados"
            />
          </div>

          <SectionCard
            title={
              visao === "prioridade" ? "Onde a campanha deveria estar" : "Onde a campanha está"
            }
            description={
              visao === "prioridade"
                ? "Cor pela nota do IPS — quanto mais escuro, mais parecido com a capital. O anel marca a capital, que é a referência do índice."
                : "Cor pelo alcance dos anúncios segmentados. Cinza é município sem nenhuma entrega."
            }
            icon={MapaIcone}
          >
            <MapaDeSaoPaulo
              pontos={dado.pontos}
              visao={visao}
              selecionado={selecionado}
              onSelecionar={setSelecionado}
            />
          </SectionCard>

          {escolhido ? (
            <SectionCard title={escolhido.municipio.nome} icon={Target}>
              <div className="grid gap-4 md:grid-cols-2">
                {escolhido.ehCapital ? (
                  // Sem esta linha o card da capital é uma coluna de traços, e
                  // traço lido sem explicação vira "faltou dado".
                  <p className="text-sm text-muted-foreground md:col-span-2">
                    A capital é a referência do índice, não um item dele: o IPS mede a semelhança de
                    cada município <em>com ela</em>. Por isso não tem nota, posição nem distância —
                    a matriz de origem a deixa de fora.
                  </p>
                ) : null}
                <dl className="space-y-2 text-sm">
                  <Linha
                    rotulo="Posição no IPS"
                    valor={
                      escolhido.municipio.posicao
                        ? `${escolhido.municipio.posicao}º de 600`
                        : "fora do ranking"
                    }
                  />
                  <Linha rotulo="Nota do IPS" valor={escolhido.municipio.ips?.toString() ?? "—"} />
                  <Linha
                    rotulo="População de referência"
                    valor={
                      escolhido.municipio.populacao
                        ? formatNumber(escolhido.municipio.populacao)
                        : "—"
                    }
                  />
                  <Linha
                    rotulo="Distância da capital"
                    valor={escolhido.municipio.km ? `${escolhido.municipio.km} km` : "—"}
                  />
                  <Linha rotulo="IDHM 2010" valor={escolhido.municipio.idhm?.toString() ?? "—"} />
                </dl>

                <div className="rounded-xl border border-border p-4">
                  <h3 className="text-sm font-medium">O que a campanha entregou aqui</h3>
                  {escolhido.alcance === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Nenhum anúncio foi segmentado para este município.
                      {escolhido.municipio.posicao && escolhido.municipio.posicao <= prioritarios
                        ? " Ele está entre os prioritários — é um vazio que vale corrigir."
                        : ""}
                    </p>
                  ) : (
                    <dl className="mt-2 space-y-2 text-sm">
                      <Linha rotulo="Pessoas alcançadas" valor={formatNumber(escolhido.alcance)} />
                      <Linha rotulo="Investido" valor={formatCurrency(escolhido.investido)} />
                      <Linha
                        rotulo="Custo por mil"
                        valor={
                          escolhido.alcance > 0
                            ? formatCurrency((escolhido.investido / escolhido.alcance) * 1000)
                            : "—"
                        }
                      />
                      <Linha
                        rotulo="Publicações entregues"
                        valor={String(escolhido.publicacoes.length)}
                      />
                    </dl>
                  )}
                  <Link
                    to="/social/impulsionamentos"
                    className="mt-3 inline-block text-xs text-accent hover:underline"
                  >
                    Ver os impulsionamentos →
                  </Link>
                </div>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Prioritários ainda sem entrega"
            description="Os municípios de maior proximidade com a capital que nenhum anúncio alcançou."
            icon={TriangleAlert}
            actions={
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
                {QUANTOS_PRIORITARIOS.map((quantos) => (
                  <button
                    key={quantos}
                    type="button"
                    onClick={() => setPrioritarios(quantos)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      prioritarios === quantos
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    top {quantos}
                  </button>
                ))}
              </div>
            }
          >
            {dado.cobertura.faltando.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todos os {dado.cobertura.total} prioritários receberam alguma entrega.
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {dado.cobertura.faltando.map((municipio) => (
                  <li key={municipio.codigo}>
                    <button
                      type="button"
                      onClick={() => setSelecionado(municipio.codigo)}
                      className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-secondary/50"
                    >
                      <span className="w-8 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {municipio.posicao}º
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{municipio.nome}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {municipio.populacao ? formatCompact(municipio.populacao) : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="flex items-start gap-2.5 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" />
            <div className="min-w-0 space-y-1.5 text-muted-foreground">
              <p>
                <strong className="text-foreground">O que o IPS é.</strong> Uma medida de semelhança
                com a capital: população (40%), proximidade geográfica (25%), IDHM 2010 (20%) e
                escala urbana (15%). A própria matriz se declara preliminar, e o IDHM é de 2010 —
                serve para priorizar onde olhar, não para concluir nada sozinho.
              </p>
              <p>
                <strong className="text-foreground">De onde vem o alcance.</strong> Da segmentação
                dos anúncios, que é o dado firme. Quando um anúncio mira várias cidades, o alcance é
                dividido igualmente entre elas — a rede não devolve a quebra por município.
              </p>
              <p>
                <strong className="text-foreground">O que não está aqui.</strong> Alcance orgânico
                por município: nenhuma rede informa de onde veio quem viu um post não patrocinado. O
                mapa mostra mídia paga.
              </p>
              {dado.foraDoEstado.length > 0 ? (
                <p>
                  <strong className="text-foreground">Fora do estado:</strong>{" "}
                  {dado.foraDoEstado.join(", ")} — segmentações que não casam com nenhum município
                  de São Paulo e por isso não aparecem no mapa.
                </p>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  nota,
  alerta,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className={cn("surface-card min-w-0 p-4", alerta && "border-accent/50")}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{rotulo}</div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums">{valor}</div>
      {nota ? (
        <div className="mt-0.5 text-xs">
          {alerta ? (
            <StatusPill tone="destaque">{nota}</StatusPill>
          ) : (
            <span className="text-muted-foreground">{nota}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="shrink-0 font-medium tabular-nums">{valor}</dd>
    </div>
  );
}
