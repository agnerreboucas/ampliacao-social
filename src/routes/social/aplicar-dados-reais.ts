#!/usr/bin/env node --experimental-strip-types
/**
 * Troca os dados de demonstração pelos dados reais da campanha.
 *
 * A plataforma nasceu com uma semente fictícia — três projetos, seis redes com
 * números inventados — que serve para desenvolver e para mostrar as telas. A
 * partir do momento em que existe exportação de verdade, misturar os dois é o
 * pior dos mundos: o Painel soma alcance real com alcance inventado e ninguém
 * consegue mais dizer qual número é qual.
 *
 * Este script resolve isso com uma regra dura: **o que não é real vira vazio.**
 *
 * - O Instagram recebe as publicações da exportação, com o horário corrigido
 *   para o fuso da campanha.
 * - A série diária do Instagram no período é recalculada a partir dessas
 *   publicações — alcance, visualizações e interações somados por dia.
 * - As outras cinco redes ficam **sem publicação e sem número**. Elas não estão
 *   conectadas ainda, e mostrar movimento numa conta desconectada é a mentira
 *   mais fácil de acreditar.
 * - Impulsionamentos somem: não há dado de mídia paga na exportação.
 *
 * O que a exportação **não** traz e por isso não é inventado aqui:
 * o total de seguidores da conta. O arquivo informa quantos seguidores cada
 * publicação gerou (dez no período), não quantos existem. O total fica em zero
 * até alguém informar — um zero visível é melhor do que um número plausível e
 * falso.
 *
 *   node --experimental-strip-types scripts/aplicar-dados-reais.ts
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  lerExportacaoDoInstagram,
  totalizar,
  type PublicacaoImportada,
} from "../src/lib/social/instagram-csv.ts";

const RAIZ = new URL("../", import.meta.url);
const CSV = new URL("dados/instagram-agosto-2026.csv", RAIZ);
const SNAPSHOT = new URL("dados/plataforma.json", RAIZ);

const CONTA_DO_INSTAGRAM = "acc-ig-neon";
const PROJETO = "proj-campanha";

type Snapshot = {
  posts: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  metrics: { accountId: string; dias: Record<string, number | string>[] }[];
  audience: { accountId: string; insight: Record<string, unknown> }[];
  inbox: Record<string, unknown>[];
  boosts: unknown[];
  eventos: Record<string, unknown>[];
  [chave: string]: unknown;
};

const leitura = lerExportacaoDoInstagram(readFileSync(CSV, "utf8"));
if (leitura.problemas.length > 0) {
  console.error("A exportação tem problemas:");
  for (const problema of leitura.problemas) {
    console.error(`  linha ${problema.linha}: ${problema.motivo}`);
  }
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as Snapshot;

// --- As publicações ----------------------------------------------------------

/**
 * A legenda encurtada para caber numa lista.
 *
 * A legenda inteira de um post de campanha tem parágrafos e hashtags; guardar o
 * texto completo é certo, mas a plataforma mostra o começo em quase todo lugar.
 */
function primeiraLinha(legenda: string): string {
  return legenda.replace(/\s+/g, " ").trim();
}

const GRADIENTES = [
  "linear-gradient(135deg, oklch(0.62 0.19 10), oklch(0.4 0.16 300))",
  "linear-gradient(135deg, oklch(0.68 0.16 75), oklch(0.45 0.14 30))",
  "linear-gradient(135deg, oklch(0.58 0.15 250), oklch(0.38 0.14 280))",
  "linear-gradient(135deg, oklch(0.62 0.14 165), oklch(0.4 0.12 200))",
];

function paraPost(peca: PublicacaoImportada, indice: number) {
  return {
    id: `ig-${peca.idExterno}`,
    projectId: PROJETO,
    accountIds: [CONTA_DO_INSTAGRAM],
    format: peca.formato,
    caption: primeiraLinha(peca.legenda),
    media: {
      count: peca.formato === "carrossel" ? 3 : 1,
      aspectRatio: peca.formato === "video" ? "9:16" : "4:5",
      fileSizeMb: 0,
      ...(peca.duracaoSegundos > 0 ? { durationSeconds: peca.duracaoSegundos } : {}),
    },
    status: "publicado",
    scheduledFor: null,
    publishedAt: peca.publicadoEm,
    createdBy: "user-conteudo",
    approvedBy: "user-campanha",
    requiresApproval: true,
    metrics: {
      // "Visualizações" da exportação é o que a plataforma chama de impressões.
      // Não é a mesma coisa para reels, e por isso está anotado em
      // docs/motor-de-analise.md como métrica a separar.
      reach: peca.alcance,
      impressions: peca.visualizacoes,
      likes: peca.curtidas,
      comments: peca.comentarios,
      shares: peca.compartilhamentos,
      saves: peca.salvamentos,
    },
    coverGradient: GRADIENTES[indice % GRADIENTES.length],
  };
}

const reais = leitura.publicacoes.map(paraPost);

// As peças que ainda não foram ao ar continuam: são a pauta da equipe, não
// número de desempenho. O que sai é tudo que estava publicado por invenção.
const pipeline = snapshot.posts.filter((post) => post.status !== "publicado");
snapshot.posts = [...reais.slice().reverse(), ...pipeline];

// --- A série diária do Instagram ---------------------------------------------

const diaDe = (iso: string) => iso.slice(0, 10);
const dias = [...new Set(leitura.publicacoes.map((peca) => diaDe(peca.publicadoEm)))].sort();
const primeiroDia = dias[0];
const ultimoDia = dias[dias.length - 1];

function seriePorDia() {
  const porDia = new Map<string, PublicacaoImportada[]>();
  for (const peca of leitura.publicacoes) {
    const chave = diaDe(peca.publicadoEm);
    porDia.set(chave, [...(porDia.get(chave) ?? []), peca]);
  }

  const serie: Record<string, number | string>[] = [];
  const inicio = new Date(`${primeiroDia}T00:00:00Z`);
  const fim = new Date(`${ultimoDia}T00:00:00Z`);

  for (let d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const chave = d.toISOString().slice(0, 10);
    const doDia = porDia.get(chave) ?? [];
    const soma = (campo: keyof PublicacaoImportada) =>
      doDia.reduce((total, peca) => total + (peca[campo] as number), 0);

    serie.push({
      date: chave,
      // O total de seguidores não vem na exportação. Zero é o valor honesto até
      // alguém informar; o ganho do dia é real.
      followers: 0,
      followersGained: soma("seguidoresGanhos"),
      followersLost: 0,
      organicReach: soma("alcance"),
      paidReach: 0,
      organicImpressions: soma("visualizacoes"),
      paidImpressions: 0,
      organicEngagement:
        soma("curtidas") + soma("comentarios") + soma("compartilhamentos") + soma("salvamentos"),
      paidEngagement: 0,
      adSpend: 0,
    });
  }

  return serie;
}

snapshot.metrics = [{ accountId: CONTA_DO_INSTAGRAM, dias: seriePorDia() }];

// --- O que não é real vira vazio ---------------------------------------------

snapshot.accounts = snapshot.accounts.map((conta) =>
  conta.id === CONTA_DO_INSTAGRAM
    ? { ...conta, origem: "demonstracao", trackingSince: primeiroDia, lastSyncAt: ultimoDia }
    : // As outras redes existem no cadastro e não têm dado nenhum: é a verdade,
      // e é o que a tela de Contas precisa mostrar para alguém ir conectá-las.
      { ...conta, status: "desconectada", lastSyncAt: null, adAccountConnected: false },
);

// Perfil de público não vem nesta exportação — ela é de conteúdo.
snapshot.audience = snapshot.audience
  .filter((perfil) => perfil.accountId === CONTA_DO_INSTAGRAM)
  .map((perfil) => ({
    accountId: perfil.accountId,
    insight: {
      available: false,
      unavailableReason:
        "O perfil de público não vem na exportação de conteúdo. Ele chega quando a conta for conectada por OAuth.",
      newFollowers: totalizar(leitura.publicacoes).seguidoresGanhos,
      unfollows: 0,
      demografia: [],
      topInteractors: [],
      activityByHour: [],
      topCities: [],
    },
  }));

// Sem dado de mídia paga na exportação.
snapshot.boosts = [];

/**
 * As conversas apontavam para publicações que deixaram de existir.
 *
 * Os **números** de comentário são reais — a exportação diz 132 no período —,
 * mas os **textos** não vêm nela: comentário e mensagem chegam pela API, com a
 * conta conectada. Então as conversas da semente continuam, repontadas para as
 * publicações reais, e a tela diz que são ilustrativas.
 *
 * Apagá-las esvaziaria a tela de Relacionamento sem ganho de honestidade: o
 * aviso na tela resolve o mesmo problema e mantém o fluxo visível.
 */
const idsReais = reais.map((post) => post.id);
snapshot.inbox = snapshot.inbox
  .filter((item) => item.accountId === CONTA_DO_INSTAGRAM)
  .map((item, indice) => ({ ...item, postId: idsReais[indice % idsReais.length] }));

// Os eventos são a agenda da campanha, cadastrada por gente — continuam.
snapshot.geradoEm = new Date().toISOString();

writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);

const totais = totalizar(leitura.publicacoes);
console.log(`dados/plataforma.json atualizado com a exportação real.

  publicações reais: ${totais.publicacoes}   (${primeiroDia} a ${ultimoDia})
  visualizações:     ${totais.visualizacoes.toLocaleString("pt-BR")}
  alcance:           ${totais.alcance.toLocaleString("pt-BR")}
  interações:        ${totais.interacoes.toLocaleString("pt-BR")}
  seguidores ganhos: ${totais.seguidoresGanhos}
  taxa de interação: ${totais.taxaDeInteracao.toFixed(1)}%

  peças em produção mantidas: ${pipeline.length}
  redes sem dado: ${snapshot.accounts.length - 1}   (marcadas como desconectadas)
`);
