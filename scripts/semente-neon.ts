import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { NETWORKS } from "../src/lib/social/networks.ts";
import { serializar, type EstadoPersistivel } from "../src/lib/social/snapshot.ts";
import { FAIXAS_ETARIAS } from "../src/lib/social/types.ts";
import type {
  AudienceInsight,
  Boost,
  CelulaDemografica,
  DailyMetric,
  Evento,
  InboxItem,
  NetworkId,
  PlatformUser,
  Post,
  PostFormat,
  Project,
  SocialAccount,
} from "../src/lib/social/types.ts";

/**
 * Gera `dados/plataforma.json` com a campanha da Neon Cunha e mais nada.
 *
 * A semente que vem no código traz três projetos de exemplo — um mercadinho, um
 * estúdio e a campanha vazia. Serve para desenvolver, e atrapalha para mostrar:
 * quem abre a demonstração para ver a campanha não quer procurar a campanha no
 * meio de um supermercado.
 *
 * Este script não toca na semente. Ele escreve o arquivo que o
 * `build-html.mjs` embute no HTML, e que a plataforma carrega **no lugar** da
 * semente. Apagar o arquivo devolve tudo ao que era.
 *
 * **Os números são fictícios, e o nome do projeto diz isso.** É conteúdo de
 * demonstração para ver a ferramenta funcionando — não medição de nada. Quando
 * as contas reais forem conectadas, os números verdadeiros entram por cima e o
 * rótulo sai.
 *
 *   node --experimental-strip-types scripts/semente-neon.ts
 */

const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);

const DIAS_DE_HISTORICO = 180;

function somarDias(data: Date, dias: number): Date {
  const proxima = new Date(data);
  proxima.setDate(proxima.getDate() + dias);
  return proxima;
}

function dia(data: Date): string {
  return `${data.getFullYear()}-${`${data.getMonth() + 1}`.padStart(2, "0")}-${`${data.getDate()}`.padStart(2, "0")}`;
}

function naHora(data: Date, hora: number): string {
  const proxima = new Date(data);
  proxima.setHours(hora, 0, 0, 0);
  return proxima.toISOString();
}

/** PRNG determinístico: o mesmo arquivo sai igual em toda execução. */
function aleatorio(semente: string) {
  let hash = 2166136261;
  for (let i = 0; i < semente.length; i += 1) {
    hash ^= semente.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let a = hash >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADIENTES = [
  "linear-gradient(135deg, oklch(0.6 0.21 15), oklch(0.45 0.19 320))",
  "linear-gradient(135deg, oklch(0.45 0.2 260), oklch(0.72 0.18 200))",
  "linear-gradient(135deg, oklch(0.65 0.2 80), oklch(0.4 0.22 320))",
  "linear-gradient(135deg, oklch(0.7 0.2 150), oklch(0.3 0.15 250))",
  "linear-gradient(135deg, oklch(0.55 0.22 30), oklch(0.35 0.18 280))",
  "linear-gradient(135deg, oklch(0.68 0.17 200), oklch(0.38 0.16 265))",
];

const PROJETO_ID = "proj-campanha";

const projetos: Project[] = [
  {
    id: PROJETO_ID,
    // O rótulo é proposital: os números abaixo são fictícios, e quem abrir a
    // tela precisa saber disso antes de ler qualquer um deles.
    name: "Campanha Neon Cunha (demonstração)",
    client: "Campanha Neon Cunha",
  },
];

const usuarios: PlatformUser[] = [
  {
    id: "user-campanha",
    name: "Campanha Neon Cunha",
    email: "campanha.neoncunha@gmail.com",
    role: "administrador",
    projectIds: [PROJETO_ID],
    lastActiveAt: HOJE.toISOString(),
    avatarGradient: GRADIENTES[0],
  },
  {
    id: "user-ampliacao",
    name: "Ampliação Marketing Digital",
    email: "ampliacaomktdigital@gmail.com",
    role: "administrador",
    projectIds: [PROJETO_ID],
    lastActiveAt: HOJE.toISOString(),
    avatarGradient: GRADIENTES[1],
  },
  {
    id: "user-conteudo",
    name: "Equipe de conteúdo",
    email: "conteudo@ampliacao.com.br",
    role: "editor",
    projectIds: [PROJETO_ID],
    lastActiveAt: new Date(Date.now() - 5400_000).toISOString(),
    avatarGradient: GRADIENTES[2],
  },
  {
    id: "user-atendimento",
    name: "Atendimento",
    email: "atendimento@ampliacao.com.br",
    role: "atendimento",
    projectIds: [PROJETO_ID],
    lastActiveAt: new Date(Date.now() - 1800_000).toISOString(),
    avatarGradient: GRADIENTES[3],
  },
];

type SementeDeConta = {
  id: string;
  networkId: NetworkId;
  handle: string;
  seguidoresBase: number;
  crescimentoDiario: number;
  fatiaPaga: number;
  contaDeAnuncios: boolean;
  mensageriaAprovada: boolean;
};

const SEMENTES_DE_CONTA: SementeDeConta[] = [
  {
    id: "acc-ig-neon",
    networkId: "instagram",
    handle: "@neoncunha",
    seguidoresBase: 18400,
    crescimentoDiario: 42,
    fatiaPaga: 0.38,
    contaDeAnuncios: true,
    mensageriaAprovada: true,
  },
  {
    id: "acc-fb-neon",
    networkId: "facebook",
    handle: "/neoncunha",
    seguidoresBase: 12600,
    crescimentoDiario: 19,
    fatiaPaga: 0.46,
    contaDeAnuncios: true,
    mensageriaAprovada: true,
  },
  {
    id: "acc-tt-neon",
    networkId: "tiktok",
    handle: "@neoncunha",
    seguidoresBase: 6800,
    crescimentoDiario: 55,
    fatiaPaga: 0.12,
    contaDeAnuncios: false,
    mensageriaAprovada: false,
  },
  {
    id: "acc-yt-neon",
    networkId: "youtube",
    handle: "@neoncunha",
    seguidoresBase: 2450,
    crescimentoDiario: 7,
    fatiaPaga: 0,
    contaDeAnuncios: false,
    mensageriaAprovada: false,
  },
  {
    id: "acc-th-neon",
    networkId: "threads",
    handle: "@neoncunha",
    seguidoresBase: 5200,
    crescimentoDiario: 31,
    fatiaPaga: 0,
    contaDeAnuncios: false,
    mensageriaAprovada: false,
  },
  {
    id: "acc-li-neon",
    networkId: "linkedin",
    handle: "/in/neoncunha",
    seguidoresBase: 3900,
    crescimentoDiario: 9,
    fatiaPaga: 0,
    contaDeAnuncios: false,
    mensageriaAprovada: true,
  },
];

const contas: SocialAccount[] = SEMENTES_DE_CONTA.map((semente, indice) => ({
  id: semente.id,
  projectId: PROJETO_ID,
  networkId: semente.networkId,
  handle: semente.handle,
  displayName: "Neon Cunha",
  status: "ativa",
  origem: "demonstracao",
  adAccountConnected: semente.contaDeAnuncios,
  trackingSince: dia(somarDias(HOJE, -DIAS_DE_HISTORICO)),
  tokenExpiresAt: dia(somarDias(HOJE, 45)),
  lastSyncAt: new Date(HOJE.getTime() + 9 * 3600_000).toISOString(),
  messagingApproved: semente.mensageriaAprovada,
  avatarGradient: GRADIENTES[indice % GRADIENTES.length],
}));

/**
 * Série diária de cada conta.
 *
 * A curva tem uma inflexão no meio do período: campanha que começa a investir
 * cresce diferente de campanha que só posta, e o gráfico precisa mostrar isso —
 * é a diferença que a tela de evolução existe para revelar.
 */
function serieDaConta(semente: SementeDeConta): DailyMetric[] {
  const rand = aleatorio(`${semente.id}-serie`);
  const dias: DailyMetric[] = [];
  let seguidores = semente.seguidoresBase;

  for (let i = DIAS_DE_HISTORICO; i >= 0; i -= 1) {
    const data = somarDias(HOJE, -i);
    const diaDaSemana = data.getDay();
    // A campanha entra em ritmo nos últimos dois meses.
    const emCampanha = i <= 60;
    const impulso = emCampanha ? 2.1 : 1;

    const ganhos = Math.round(semente.crescimentoDiario * impulso * (0.6 + rand() * 0.9));
    const perdas = Math.round(ganhos * (0.12 + rand() * 0.18));
    seguidores += ganhos - perdas;

    // Fim de semana rende menos: é quando a agenda para.
    const ritmo = diaDaSemana === 0 || diaDaSemana === 6 ? 0.68 : 1;
    const alcanceOrganico = Math.round(seguidores * (0.22 + rand() * 0.2) * ritmo);
    const gasto = emCampanha && semente.fatiaPaga > 0 ? Math.round(60 + rand() * 240) : 0;
    const alcancePago = gasto > 0 ? Math.round(gasto * (26 + rand() * 18)) : 0;

    dias.push({
      date: dia(data),
      followers: seguidores,
      followersGained: ganhos,
      followersLost: perdas,
      organicReach: alcanceOrganico,
      paidReach: alcancePago,
      organicImpressions: Math.round(alcanceOrganico * (1.4 + rand() * 0.5)),
      paidImpressions: Math.round(alcancePago * (1.7 + rand() * 0.6)),
      organicEngagement: Math.round(alcanceOrganico * (0.05 + rand() * 0.04)),
      paidEngagement: Math.round(alcancePago * (0.02 + rand() * 0.02)),
      adSpend: gasto,
    });
  }

  return dias;
}

/**
 * Perfil demográfico por rede.
 *
 * As curvas diferem de propósito: TikTok mais jovem, Facebook mais velho. É
 * essa diferença que responde "onde falo com quem" — semear a mesma curva nas
 * quatro redes esconderia a única conclusão que a tela produz.
 */
const PESOS_POR_REDE: Record<NetworkId, number[]> = {
  //          13-17 18-24 25-34 35-44 45-54 55-64  65+
  threads: [0.02, 0.24, 0.36, 0.21, 0.11, 0.04, 0.02],
  instagram: [0.03, 0.21, 0.33, 0.22, 0.13, 0.06, 0.02],
  facebook: [0.01, 0.07, 0.19, 0.25, 0.23, 0.16, 0.09],
  tiktok: [0.09, 0.36, 0.31, 0.15, 0.06, 0.02, 0.01],
  youtube: [0.04, 0.19, 0.29, 0.23, 0.15, 0.07, 0.03],
  linkedin: [0, 0.08, 0.38, 0.31, 0.16, 0.05, 0.02],
};

function demografiaDaConta(semente: SementeDeConta): CelulaDemografica[] {
  const rand = aleatorio(`${semente.id}-demografia`);
  const pesos = PESOS_POR_REDE[semente.networkId];
  const fatiaFeminina = [0.54, 0.59, 0.62, 0.61, 0.58, 0.55, 0.51];

  return FAIXAS_ETARIAS.flatMap((faixa, indice) => {
    const naFaixa = Math.round(semente.seguidoresBase * pesos[indice] * (0.92 + rand() * 0.16));
    const naoInformado = Math.round(naFaixa * (0.01 + rand() * 0.02));
    const restante = naFaixa - naoInformado;
    const feminino = Math.round(restante * fatiaFeminina[indice]);

    return [
      { genero: "feminino" as const, faixa, pessoas: feminino },
      { genero: "masculino" as const, faixa, pessoas: restante - feminino },
      { genero: "nao_informado" as const, faixa, pessoas: naoInformado },
    ].filter((celula) => celula.pessoas > 0);
  });
}

const APOIADORES: [string, string][] = [
  ["@marcia.oliveira", "Márcia Oliveira"],
  ["@rsantos", "Renato Santos"],
  ["@juliana.alves", "Juliana Alves"],
  ["@cleber_ferreira", "Cleber Ferreira"],
  ["@vaniapereira", "Vânia Pereira"],
  ["@edu.martins", "Eduardo Martins"],
  ["@profa.silvia", "Sílvia Nogueira"],
  ["@thiago.lima", "Thiago Lima"],
];

function perfilDaConta(semente: SementeDeConta, serie: DailyMetric[]): AudienceInsight {
  const rand = aleatorio(`${semente.id}-perfil`);
  const ultimos30 = serie.slice(-30);
  const expoePerfil = semente.networkId === "instagram" || semente.networkId === "facebook";

  const base = {
    newFollowers: ultimos30.reduce((total, item) => total + item.followersGained, 0),
    unfollows: ultimos30.reduce((total, item) => total + item.followersLost, 0),
  };

  if (!expoePerfil) {
    return {
      available: false,
      unavailableReason: `A API do ${NETWORKS[semente.networkId].label} não expõe dados de perfil do público para esta conta.`,
      ...base,
      topInteractors: [],
      activityByHour: [],
      topCities: [],
      demografia: [],
    };
  }

  const fatiasDeCidade = [41, 9, 7, 6, 5];
  return {
    available: true,
    ...base,
    topInteractors: APOIADORES.slice(0, 6)
      .map(([handle, name], indice) => ({
        handle,
        name,
        interactions: Math.round(180 - indice * 19 + rand() * 30),
        avatarGradient: GRADIENTES[indice % GRADIENTES.length],
      }))
      .sort((a, b) => b.interactions - a.interactions),
    activityByHour: Array.from({ length: 24 }, (_, hora) => {
      const almoco = Math.exp(-((hora - 12.5) ** 2) / 4);
      const noite = Math.exp(-((hora - 20) ** 2) / 5);
      return {
        hour: hora,
        activity: Math.round((almoco * 0.7 + noite) * 100 * (0.85 + rand() * 0.3)),
      };
    }),
    topCities: ["São Paulo", "Guarulhos", "Osasco", "Santo André", "São Bernardo do Campo"].map(
      (city, indice) => ({ city, share: fatiasDeCidade[indice] }),
    ),
    demografia: demografiaDaConta(semente),
  };
}

type SementeDePeca = {
  formato: PostFormat;
  legenda: string;
  hora: number;
  /** Dias atrás em que foi publicada. */
  atras: number;
  redes: string[];
  /** Multiplicador de desempenho: a pauta não rende igual. */
  peso: number;
};

/**
 * A pauta.
 *
 * Assuntos, formatos e horários variam porque é do cruzamento deles que a tela
 * de Conteúdo tira conclusão. Peças de agenda e de proposta rendendo diferente
 * é o achado que a ferramenta existe para mostrar.
 */
const PAUTA: SementeDePeca[] = [
  {
    formato: "video",
    legenda:
      "Caminhada na feira da Vila Nova hoje de manhã. Ouvir quem levanta cedo é o que dá direção pra proposta. #agenda #mobilidade",
    hora: 19,
    atras: 2,
    redes: ["acc-ig-neon", "acc-fb-neon"],
    peso: 1.9,
  },
  {
    formato: "carrossel",
    legenda:
      "Nossa proposta para a saúde da região: mais horário de atendimento no posto, agendamento pelo celular e transporte para exame. Arrasta pro lado. #proposta #saude",
    hora: 12,
    atras: 4,
    redes: ["acc-ig-neon", "acc-fb-neon", "acc-th-neon"],
    peso: 1.4,
  },
  {
    formato: "imagem",
    legenda: "Reunião com as mães da creche do Jardim União. Escutar primeiro. #agenda #educacao",
    hora: 18,
    atras: 6,
    redes: ["acc-ig-neon"],
    peso: 0.8,
  },
  {
    formato: "video",
    legenda:
      "Dona Marlene esperou dois anos por uma consulta. É por histórias como a dela que a fila do SUS entrou no centro do nosso plano. #depoimento #saude",
    hora: 20,
    atras: 8,
    redes: ["acc-ig-neon", "acc-fb-neon", "acc-tt-neon", "acc-th-neon"],
    peso: 2.4,
  },
  {
    formato: "story",
    legenda: "Bastidor: montando o material da caminhada de amanhã 💪 #bastidores",
    hora: 9,
    atras: 3,
    redes: ["acc-ig-neon"],
    peso: 1,
  },
  {
    formato: "story",
    legenda: "Enquete: qual assunto vocês querem que eu trate na live de quinta?",
    hora: 15,
    atras: 5,
    redes: ["acc-ig-neon"],
    peso: 1.3,
  },
  {
    formato: "carrossel",
    legenda:
      "O que já entregamos em mobilidade: 3 linhas novas, ponto coberto na avenida e a ciclovia que ligou os dois bairros. #resultado #mobilidade",
    hora: 11,
    atras: 11,
    redes: ["acc-ig-neon", "acc-fb-neon"],
    peso: 1.1,
  },
  {
    formato: "imagem",
    legenda:
      "Segurança se faz com iluminação, presença e programa para o jovem. Não é slogan, é orçamento. #proposta #seguranca",
    hora: 21,
    atras: 13,
    redes: ["acc-fb-neon"],
    peso: 0.7,
  },
  {
    formato: "video",
    legenda:
      "Live de ontem na íntegra: educação, creche e a fila que não anda. Perguntas de vocês respondidas uma a uma. #educacao",
    hora: 20,
    atras: 15,
    redes: ["acc-yt-neon", "acc-fb-neon"],
    peso: 1.2,
  },
  {
    formato: "story",
    legenda: "Chegando na zona leste para a reunião com os comerciantes 🚐 #agenda",
    hora: 8,
    atras: 9,
    redes: ["acc-ig-neon"],
    peso: 0.9,
  },
  {
    formato: "imagem",
    legenda:
      "Equipe reunida no domingo para fechar a pauta da semana. Campanha se faz junto. #bastidores",
    hora: 17,
    atras: 18,
    redes: ["acc-ig-neon"],
    peso: 0.6,
  },
  {
    formato: "carrossel",
    legenda: "Cinco compromissos que assumimos por escrito. Cobrem a gente. #proposta #compromisso",
    hora: 13,
    atras: 21,
    redes: ["acc-ig-neon", "acc-fb-neon", "acc-li-neon"],
    peso: 1.5,
  },
  {
    formato: "imagem",
    legenda:
      "O plano de desenvolvimento econômico da região, em números: onde estão os empregos, onde eles faltam e o que muda com formação técnica. #proposta #resultado",
    hora: 10,
    atras: 7,
    redes: ["acc-li-neon"],
    peso: 1.2,
  },
  {
    formato: "video",
    legenda:
      "Painel sobre primeira infância e retorno econômico da creche pública. A conta fecha — e ainda sobra. #educacao #proposta",
    hora: 12,
    atras: 16,
    redes: ["acc-li-neon", "acc-yt-neon"],
    peso: 0.9,
  },
];

function midiaDoFormato(formato: PostFormat, rand: () => number): Post["media"] {
  if (formato === "story") return { count: 1, aspectRatio: "9:16", fileSizeMb: 1.8 };
  if (formato === "carrossel") {
    return { count: 4 + Math.floor(rand() * 4), aspectRatio: "4:5", fileSizeMb: 4.6 };
  }
  if (formato === "video") {
    return {
      count: 1,
      aspectRatio: "9:16",
      fileSizeMb: 42 + Math.round(rand() * 50),
      durationSeconds: 24 + Math.floor(rand() * 70),
    };
  }
  return { count: 1, aspectRatio: "4:5", fileSizeMb: 2.4 };
}

function montarPecas(): Post[] {
  const rand = aleatorio("pecas-neon");

  const publicadas = PAUTA.map((semente, indice) => {
    const alcance = Math.round((2600 + rand() * 4200) * semente.peso);
    const ehStory = semente.formato === "story";

    return {
      id: `post-${indice + 1}`,
      projectId: PROJETO_ID,
      accountIds: semente.redes,
      format: semente.formato,
      caption: semente.legenda,
      media: midiaDoFormato(semente.formato, rand),
      status: "publicado" as const,
      scheduledFor: null,
      publishedAt: naHora(somarDias(HOJE, -semente.atras), semente.hora),
      createdBy: "user-conteudo",
      approvedBy: "user-campanha",
      requiresApproval: true,
      metrics: {
        reach: ehStory ? Math.round(alcance * 0.22) : alcance,
        impressions: Math.round(alcance * (ehStory ? 0.25 : 1.4 + rand() * 0.5)),
        // A rede não devolve curtida nem salvamento de story.
        likes: ehStory ? 0 : Math.round(alcance * (0.05 + rand() * 0.04)),
        comments: Math.round(alcance * (ehStory ? 0.012 : 0.005 + rand() * 0.005)),
        shares: Math.round(alcance * (0.003 + rand() * 0.004)),
        saves: ehStory ? 0 : Math.round(alcance * (0.007 + rand() * 0.007)),
      },
      coverGradient: GRADIENTES[indice % GRADIENTES.length],
    };
  });

  // A fila de produção: sem ela, a tela de Publicações abre vazia e ninguém vê
  // o fluxo de aprovação funcionando.
  const fila: Post[] = [
    {
      id: "post-f1",
      projectId: PROJETO_ID,
      accountIds: ["acc-ig-neon", "acc-fb-neon"],
      format: "carrossel",
      caption:
        "O plano para a primeira infância, em cinco cartões. Publicação de amanhã. #proposta #educacao",
      media: { count: 5, aspectRatio: "4:5", fileSizeMb: 5.1 },
      status: "agendado",
      scheduledFor: naHora(somarDias(HOJE, 1), 12),
      publishedAt: null,
      createdBy: "user-conteudo",
      approvedBy: "user-campanha",
      requiresApproval: true,
      metrics: null,
      coverGradient: GRADIENTES[1],
    },
    {
      id: "post-f2",
      projectId: PROJETO_ID,
      accountIds: ["acc-ig-neon"],
      format: "story",
      caption: "Lembrete da live de quinta às 20h 📣",
      media: { count: 1, aspectRatio: "9:16", fileSizeMb: 1.6 },
      status: "agendado",
      scheduledFor: naHora(somarDias(HOJE, 2), 9),
      publishedAt: null,
      createdBy: "user-conteudo",
      approvedBy: "user-campanha",
      requiresApproval: true,
      metrics: null,
      coverGradient: GRADIENTES[3],
    },
    {
      id: "post-f3",
      projectId: PROJETO_ID,
      accountIds: ["acc-ig-neon", "acc-fb-neon"],
      format: "video",
      caption:
        "Resposta ao que perguntaram sobre a fila da creche — com o número e a fonte. #educacao",
      media: { count: 1, aspectRatio: "9:16", fileSizeMb: 61, durationSeconds: 48 },
      status: "aguardando_aprovacao",
      scheduledFor: naHora(somarDias(HOJE, 3), 19),
      publishedAt: null,
      createdBy: "user-conteudo",
      approvedBy: null,
      requiresApproval: true,
      metrics: null,
      coverGradient: GRADIENTES[4],
    },
    {
      id: "post-f4",
      projectId: PROJETO_ID,
      accountIds: ["acc-ig-neon"],
      format: "imagem",
      caption: "Rascunho: card com a agenda da semana.",
      media: { count: 1, aspectRatio: "1:1", fileSizeMb: 1.9 },
      status: "rascunho",
      scheduledFor: null,
      publishedAt: null,
      createdBy: "user-conteudo",
      approvedBy: null,
      requiresApproval: false,
      metrics: null,
      coverGradient: GRADIENTES[5],
    },
  ];

  return [...publicadas, ...fila].sort((a, b) => {
    const quandoA = new Date(a.publishedAt ?? a.scheduledFor ?? 0).getTime();
    const quandoB = new Date(b.publishedAt ?? b.scheduledFor ?? 0).getTime();
    return quandoB - quandoA;
  });
}

/**
 * Os impulsionamentos, com a segmentação escrita como o Gerenciador a escreve.
 *
 * É daqui que sai o mapa: cada cidade citada vira entrega, e cada cidade
 * ausente vira o vazio que a tela mostra. A lista mistura capital, região
 * metropolitana e interior de propósito — uma campanha estadual real não mira
 * sempre os mesmos lugares, e é a diferença entre onde ela chega e onde ela
 * deveria chegar que muda a decisão.
 */
function montarImpulsionamentos(pecas: Post[]): Boost[] {
  const rand = aleatorio("impulsionamentos-neon");
  const publicadas = pecas.filter((peca) => peca.status === "publicado" && peca.metrics);

  const segmentacoes: string[][] = [
    ["São Paulo (+10 km)"],
    ["São Paulo (+10 km)", "Guarulhos", "Osasco"],
    ["Santo André", "São Bernardo do Campo", "São Caetano do Sul", "Diadema"],
    ["Campinas", "Sorocaba", "Jundiaí"],
    ["São Paulo (+10 km)", "Mauá", "Carapicuíba", "Itaquaquecetuba"],
    ["Ribeirão Preto", "São José do Rio Preto"],
  ];
  const objetivos = ["alcance", "engajamento", "mensagens", "trafego"] as const;

  return publicadas.slice(0, 6).map((peca, indice) => {
    const duracao = [7, 5, 10, 14, 7, 5][indice];
    const inicio = somarDias(new Date(peca.publishedAt!), 1);
    const fim = somarDias(inicio, duracao);
    const ativo = fim.getTime() > HOJE.getTime();
    const orcamento = [900, 1400, 2200, 1800, 1200, 700][indice];
    const decorridos = Math.min(
      duracao,
      Math.max(1, Math.round((HOJE.getTime() - inicio.getTime()) / 86400000)),
    );
    const gasto = Math.round((orcamento / duracao) * decorridos * 100) / 100;
    const alcance = Math.round(gasto * (30 + rand() * 20));

    return {
      id: `boost-${indice + 1}`,
      postId: peca.id,
      accountId: peca.accountIds[0],
      objective: objetivos[indice % objetivos.length],
      budgetTotal: orcamento,
      durationDays: duracao,
      startedAt: dia(inicio),
      endsAt: dia(fim),
      status: ativo ? ("ativo" as const) : ("encerrado" as const),
      audience: {
        locations: segmentacoes[indice],
        ageMin: 18,
        ageMax: 65,
        interests: ["Política", "Notícias locais", "Comunidade"],
      },
      results: {
        spend: gasto,
        reach: alcance,
        impressions: Math.round(alcance * (1.8 + rand() * 0.7)),
        engagement: Math.round(alcance * (0.03 + rand() * 0.03)),
        clicks: Math.round(alcance * (0.012 + rand() * 0.014)),
      },
    };
  });
}

type SementeDeInteracao = {
  texto: string;
  peca: string | null;
  tipo: "comentario" | "mensagem";
  conta: string;
  autor: number;
  minutosAtras: number;
  relacao: "nao_seguidor" | "seguidor" | "apoiador" | "defensor";
  interacoes: number;
  respondida?: string;
};

const INTERACOES: SementeDeInteracao[] = [
  {
    texto: "A caminhada passa pela Vila Sônia também? Queria levar minha mãe pra conhecer.",
    peca: "post-1",
    tipo: "comentario",
    conta: "acc-ig-neon",
    autor: 0,
    minutosAtras: 12,
    relacao: "apoiador",
    interacoes: 14,
  },
  {
    texto: "Isso de agendar consulta pelo celular já existe em outra cidade e funciona muito bem.",
    peca: "post-2",
    tipo: "comentario",
    conta: "acc-fb-neon",
    autor: 1,
    minutosAtras: 38,
    relacao: "seguidor",
    interacoes: 6,
  },
  {
    texto: "Chorei com o vídeo da dona Marlene. Compartilhei em três grupos aqui do bairro.",
    peca: "post-4",
    tipo: "comentario",
    conta: "acc-ig-neon",
    autor: 2,
    minutosAtras: 65,
    relacao: "defensor",
    interacoes: 31,
  },
  {
    texto: "E a creche do Jardim União, tem previsão de vaga pra fevereiro?",
    peca: "post-3",
    tipo: "comentario",
    conta: "acc-ig-neon",
    autor: 3,
    minutosAtras: 96,
    relacao: "nao_seguidor",
    interacoes: 1,
  },
  {
    texto: "Boa tarde! Como faço pra ser voluntária na campanha? Moro em Guarulhos.",
    peca: null,
    tipo: "mensagem",
    conta: "acc-ig-neon",
    autor: 4,
    minutosAtras: 140,
    relacao: "apoiador",
    interacoes: 9,
  },
  {
    texto: "Vocês têm o material da proposta de mobilidade em PDF? Queria imprimir pro condomínio.",
    peca: "post-7",
    tipo: "comentario",
    conta: "acc-fb-neon",
    autor: 5,
    minutosAtras: 210,
    relacao: "seguidor",
    interacoes: 4,
  },
  {
    texto: "Sou professora e queria entender melhor a parte de educação do plano.",
    peca: "post-9",
    tipo: "comentario",
    conta: "acc-fb-neon",
    autor: 6,
    minutosAtras: 320,
    relacao: "apoiador",
    interacoes: 11,
  },
  {
    texto: "Respondi a enquete! Quero a live sobre segurança.",
    peca: "post-6",
    tipo: "comentario",
    conta: "acc-ig-neon",
    autor: 7,
    minutosAtras: 400,
    relacao: "seguidor",
    interacoes: 3,
  },
  {
    texto: "Onde vai ser a reunião com os comerciantes da zona leste?",
    peca: "post-10",
    tipo: "mensagem",
    conta: "acc-ig-neon",
    autor: 0,
    minutosAtras: 520,
    relacao: "apoiador",
    interacoes: 14,
    respondida:
      "Oi, Márcia! Vai ser na quarta às 19h, no salão da associação da Vila Curuçá. Te espero lá!",
  },
  {
    texto: "Assisti a live inteira. Muito claro o ponto sobre a fila da creche.",
    peca: "post-9",
    tipo: "comentario",
    conta: "acc-yt-neon",
    autor: 1,
    minutosAtras: 700,
    relacao: "seguidor",
    interacoes: 6,
    respondida: "Obrigada por acompanhar, Renato! Semana que vem trago os números atualizados.",
  },
  {
    texto: "Os cinco compromissos por escrito ficaram ótimos. Isso é o que falta na política.",
    peca: "post-12",
    tipo: "comentario",
    conta: "acc-ig-neon",
    autor: 6,
    minutosAtras: 900,
    relacao: "defensor",
    interacoes: 11,
  },
  {
    texto:
      "Trabalho com formação técnica há 12 anos e gostaria de contribuir com a parte de empregos do plano.",
    peca: "post-13",
    tipo: "mensagem",
    conta: "acc-li-neon",
    autor: 5,
    minutosAtras: 260,
    relacao: "seguidor",
    interacoes: 4,
  },
  {
    texto: "Ótimo painel. Vocês têm o estudo que embasa o número de retorno da creche?",
    peca: "post-14",
    tipo: "comentario",
    conta: "acc-li-neon",
    autor: 6,
    minutosAtras: 480,
    relacao: "apoiador",
    interacoes: 11,
  },
];

function montarInteracoes(): InboxItem[] {
  return INTERACOES.map((semente, indice) => {
    const [handle, nome] = APOIADORES[semente.autor];
    const recebidaEm = new Date(Date.now() - semente.minutosAtras * 60_000).toISOString();

    return {
      id: `inbox-${indice + 1}`,
      accountId: semente.conta,
      kind: semente.tipo,
      authorHandle: handle,
      authorName: nome,
      avatarGradient: GRADIENTES[semente.autor % GRADIENTES.length],
      text: semente.texto,
      postId: semente.peca,
      receivedAt: recebidaEm,
      status: semente.respondida ? ("respondido" as const) : ("pendente" as const),
      assignedTo: semente.respondida ? "user-atendimento" : null,
      replies: semente.respondida
        ? [
            {
              id: `reply-${indice + 1}`,
              author: "Atendimento",
              text: semente.respondida,
              sentAt: new Date(Date.now() - (semente.minutosAtras - 25) * 60_000).toISOString(),
            },
          ]
        : [],
      relacao: semente.relacao,
      interacoes: semente.interacoes,
    };
  });
}

/**
 * A agenda da campanha.
 *
 * Cobre os quatro casos que a tela precisa saber desenhar: o compromisso que já
 * aconteceu e gerou peça, o de hoje, o prazo de produção e o futuro que existe
 * só como data. Sem o último, ninguém enxerga que o calendário serve para
 * planejar e não só para registrar.
 */
function montarEventos(pecas: Post[]): Evento[] {
  const publicadas = pecas.filter((peca) => peca.status === "publicado");
  const porTrecho = (parte: string) =>
    publicadas.filter((peca) => peca.caption.includes(parte)).map((peca) => peca.id);

  const compromisso = (
    id: string,
    titulo: string,
    tipo: Evento["tipo"],
    atras: number,
    hora: number,
    local: string | null,
    postIds: string[] = [],
    descricao: string | null = null,
  ): Evento => ({
    id,
    projectId: PROJETO_ID,
    titulo,
    descricao,
    tipo,
    comecaEm: naHora(somarDias(HOJE, -atras), hora),
    terminaEm: null,
    diaInteiro: false,
    local,
    municipioCodigo: null,
    responsavel: null,
    postIds,
    origem: "manual",
    criadoPor: "user-conteudo",
    criadoEm: somarDias(HOJE, -40).toISOString(),
  });

  return [
    compromisso(
      "ev-caminhada",
      "Caminhada na feira da Vila Nova",
      "agenda",
      2,
      8,
      "São Paulo",
      porTrecho("Caminhada na feira"),
      "Ponto de encontro na entrada da feira. Levar material de panfletagem.",
    ),
    compromisso(
      "ev-creche",
      "Reunião com as mães da creche",
      "agenda",
      6,
      18,
      "São Paulo",
      porTrecho("creche do Jardim União"),
    ),
    compromisso(
      "ev-depoimento",
      "Gravação do depoimento da dona Marlene",
      "gravacao",
      9,
      14,
      "Guarulhos",
      porTrecho("Dona Marlene"),
    ),
    compromisso("ev-pauta", "Reunião de pauta da semana", "interno", 0, 10, null),
    compromisso(
      "ev-comerciantes",
      "Reunião com comerciantes da zona leste",
      "agenda",
      -1,
      19,
      "São Paulo",
      [],
      "Salão da associação da Vila Curuçá.",
    ),
    compromisso(
      "ev-prazo-infancia",
      "Prazo do carrossel da primeira infância",
      "prazo",
      -1,
      18,
      null,
    ),
    compromisso(
      "ev-live",
      "Live sobre educação e fila da creche",
      "agenda",
      -2,
      20,
      null,
      [],
      "Transmissão pelo Instagram e YouTube.",
    ),
    compromisso("ev-caravana", "Caravana pelo interior", "agenda", -6, 7, "Campinas"),
    compromisso("ev-abc", "Encontro com apoiadores no ABC", "agenda", -9, 19, "Santo André"),
  ];
}

// --- Montagem ---------------------------------------------------------------

const metrics = new Map<string, DailyMetric[]>();
const audience = new Map<string, AudienceInsight>();

for (const semente of SEMENTES_DE_CONTA) {
  const serie = serieDaConta(semente);
  metrics.set(semente.id, serie);
  audience.set(semente.id, perfilDaConta(semente, serie));
}

const posts = montarPecas();

const estado: EstadoPersistivel = {
  projects: projetos,
  users: usuarios,
  accounts: contas,
  metrics,
  audience,
  posts,
  boosts: montarImpulsionamentos(posts),
  inbox: montarInteracoes(),
  eventos: montarEventos(posts),
  reports: [],
  atualizacoes: [],
};

const destino = new URL("../dados/plataforma.json", import.meta.url);
await mkdir(dirname(destino.pathname), { recursive: true });
await writeFile(destino, serializar(estado, HOJE), "utf-8");

console.log(`dados/plataforma.json escrito: ${contas.length} contas, ${posts.length} peças,`);
console.log(`${estado.boosts.length} impulsionamentos, ${estado.inbox.length} interações.`);
