import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  PERIOD_DAYS,
  buildSeries,
  mergeSeries,
  slicePeriod,
  splitOrganicPaid,
  summarize,
} from "@/lib/social/analytics";
import { getMetaConfig, getWindsorConfig } from "@/lib/config.server";
import {
  consumirState,
  descartarDescoberta,
  guardarDescoberta,
  lerCredencial,
  registrarState,
  removerCredencial,
  revelarToken,
  salvarCredencial,
  temCredencial,
  lerDescoberta,
} from "@/lib/social/credenciais.server";
import {
  MIDIA_PADRAO,
  NETWORKS,
  NETWORK_IDS,
  hasBlockingIssues,
  statusLabel,
  validateDraft,
} from "@/lib/social/networks";
import { can } from "@/lib/social/permissions";
import { FASE_LABELS } from "@/lib/social/format";
import { aplicarModelo, separarEnviaveis } from "@/lib/social/relacionamento";
import {
  VALORES_ZERADOS,
  aplicarValores,
  atualizacoesDoDia,
  progressoDoDia,
  valoresDe,
  variacaoEntre,
} from "@/lib/social/atualizacao";
import { desserializar, nomeDoArquivo, serializar } from "@/lib/social/snapshot";
import { destinoDosDados, usandoBanco } from "@/lib/social/snapshot.server";
import {
  TAMANHO_MINIMO_SENHA,
  gerarHash,
  pareceHash,
  verificarSenha,
} from "@/lib/social/senha.server";
import {
  abrirSessao,
  exigirAdministrador,
  exigirConta,
  exigirContas,
  exigirImpulsionamento,
  exigirInteracao,
  exigirRelatorio,
  exigirProjetos,
  exigirPublicacao,
  exigirUsuario,
  fecharSessao,
  usuarioAtual,
} from "@/lib/social/sessao.server";
import {
  avaliar,
  mensagemDeBloqueio,
  registrarAcerto,
  registrarErro,
  TENTATIVAS_ZERADAS,
  type Tentativas,
} from "@/lib/social/tentativas";
import { anotar, consultar, consultarTudo, type NovoEvento } from "@/lib/social/historico.server";
import { ACOES_CONHECIDAS, resumirPorPessoa, type AcaoHistorico } from "@/lib/social/historico";
import { recomendar, resumirCanais } from "@/lib/social/recomendacoes";
import { aplicarPlano, montarPlano } from "@/lib/social/importacao";
import {
  avaliarPecas,
  destaques,
  porAssunto,
  porDiaDaSemana,
  porFaixaDeHorario,
  porFormato,
} from "@/lib/social/conteudo";
import {
  cidadesAlcancadas,
  demografiaDoPublico,
  normalizarCidade,
  perfilDoPublico,
} from "@/lib/social/publico";
import { medirCobertura, montarMapa } from "@/lib/social/mapa";
import {
  atividadePorBloco,
  blocosDoDia,
  compararComOPublico,
  horariosPorFormato,
  mapaDeHorarios,
  melhoresBlocos,
  melhoresHorarios,
  picoDoPublico,
  type PecaNoTempo,
} from "@/lib/social/horarios";
import { conversasPorPeca, indexarOrigens, resumirPeca } from "@/lib/social/rastreio";
import {
  chaveDoDia,
  eventosSemPauta,
  motivoParaNaoAvancar,
  pautaDoEvento,
  podeMoverPara,
  resumirDia,
} from "@/lib/social/agenda";
import { FUSO_DA_CAMPANHA, paredeNaZona } from "@/lib/social/fuso";
import { lerIcs, planejarImportacao } from "@/lib/social/ics";
import { MUNICIPIOS_SP, acharMunicipio } from "@/lib/social/municipios-sp";
import { gerarRelatorioPdf } from "@/lib/social/pdf/relatorio";
import { paraBase64 } from "@/lib/social/pdf/documento";
import { buscarMidiaPaga, explicarErroWindsor } from "@/lib/social/windsor/cliente.server";
import { CONECTORES_SOCIAIS } from "@/lib/social/windsor/windsor";
import {
  curvaDoPost,
  dividirPorConta,
  itensDaMidia,
  taxaDeEngajamento,
  totalDeInteracoes,
} from "@/lib/social/post-analytics";
import { montarEscopos, montarUrlAutorizacao, type GrupoEscopo } from "@/lib/social/oauth/meta";
import {
  buscarInsights,
  descobrirContas,
  explicarErro,
  gerarState,
  obterTokenLongaDuracao,
  trocarCodigoPorToken,
} from "@/lib/social/oauth/meta.server";
import {
  getDb,
  mesclarMetricas,
  nextId,
  persistir,
  releaseIncoming,
  sortPostsByRecency,
  substituirEstado,
  toDayKey,
} from "@/lib/social/store.server";
import type {
  AtualizacaoManual,
  AudienceInsight,
  Boost,
  Evento,
  InboxItem,
  NetworkId,
  PeriodKey,
  PlatformUser,
  Post,
  PostFormat,
  PostMedia,
  SocialAccount,
} from "@/lib/social/types";

/**
 * API da plataforma social. Tudo que a UI lê ou escreve passa por aqui — os
 * componentes nunca tocam no store diretamente, então trocar o store em memória
 * por um banco (ou pelos conectores oficiais de cada rede) fica restrito à
 * camada de dados.
 */

/**
 * Tentativas de login por e-mail.
 *
 * Em memória e em `globalThis`, como o resto do estado volátil: sobrevive ao
 * hot reload e some no restart. Reiniciar o servidor limpar os bloqueios é
 * aceitável — quem controla o restart já tem acesso à máquina.
 */
const globalTentativas = globalThis as typeof globalThis & {
  __socialTentativas?: Map<string, Tentativas>;
};

function mapaDeTentativas(): Map<string, Tentativas> {
  globalTentativas.__socialTentativas ??= new Map();
  return globalTentativas.__socialTentativas;
}

const lerTentativas = (chave: string): Tentativas =>
  mapaDeTentativas().get(chave) ?? TENTATIVAS_ZERADAS;

const gravarTentativas = (chave: string, valor: Tentativas) => {
  mapaDeTentativas().set(chave, valor);
};

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Anota uma ação no histórico já com o nome de quem agiu e o do projeto.
 *
 * Resolver os nomes aqui, e não na hora de ler, é o que faz o histórico
 * continuar legível depois que a pessoa sai da equipe ou a conta é desconectada
 * — ver a nota em `historico.ts`.
 */
function anotarDe(
  usuario: PlatformUser,
  evento: Omit<NovoEvento, "usuarioId" | "usuarioNome" | "projetoNome">,
): void {
  const projetoId = evento.projetoId ?? null;
  anotar({
    ...evento,
    usuarioId: usuario.id,
    usuarioNome: usuario.name,
    projetoId,
    projetoNome: projetoId
      ? (getDb().projects.find((projeto) => projeto.id === projetoId)?.name ?? null)
      : null,
  });
}

/** O projeto de uma conta, para o histórico não precisar recebê-lo de fora. */
function projetoDaConta(accountId: string): string | null {
  return getDb().accounts.find((conta) => conta.id === accountId)?.projectId ?? null;
}

/**
 * O token do link público de um relatório.
 *
 * Vinha de `Math.random()`, que não é imprevisível: o gerador é semeado pelo
 * processo e a sequência pode ser reconstruída. Como esse token é a *única*
 * coisa entre os números do cliente e quem tentar adivinhar o endereço, ele
 * precisa vir do gerador criptográfico — e ser longo o bastante para que
 * tentar não valha a pena.
 *
 * 128 bits em base36 dão 25 caracteres. Tokens já emitidos continuam válidos;
 * são os novos que passam a ser fortes.
 */
function gerarTokenDeCompartilhamento(): string {
  // `crypto.getRandomValues` em vez de `node:crypto`: é o mesmo gerador
  // criptográfico, existe no Node e no navegador, e mantém este arquivo
  // utilizável na demonstração em HTML único, que roda sem servidor.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let valor = 0n;
  for (const byte of bytes) valor = (valor << 8n) | BigInt(byte);
  return valor.toString(36).padStart(25, "0");
}

/**
 * A legenda encurtada, para caber numa linha do histórico.
 *
 * Guardar a legenda inteira transformaria o registro em cópia do conteúdo; o
 * começo basta para reconhecer de qual publicação se trata.
 */
/**
 * "17/08 09:06" — o instante escrito no fuso da campanha.
 *
 * Formatar no servidor, e não no navegador, é o que garante que a lista de
 * peças concorde com o gráfico: os dois passam a ler o mesmo relógio, o de São
 * Paulo, independentemente de onde a pessoa abriu a tela.
 */
function aParede(instante: string): string {
  const parede = paredeNaZona(instante, FUSO_DA_CAMPANHA);
  const [, mes, dia] = parede.dia.split("-");
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  return `${dia}/${mes} ${doisDigitos(parede.hora)}:${doisDigitos(parede.minuto)}`;
}

function resumoDaLegenda(legenda: string): string {
  const limpa = legenda.replace(/\s+/g, " ").trim();
  if (!limpa) return "sem legenda";
  return limpa.length <= 70 ? limpa : `${limpa.slice(0, 69)}…`;
}

/** Como uma conta aparece no histórico: legível sem consultar outra tabela. */
function rotuloDaConta(accountId: string): string {
  const conta = getDb().accounts.find((candidata) => candidata.id === accountId);
  return conta ? `${conta.displayName} (${conta.handle})` : accountId;
}

const periodSchema = z.enum(["7d", "30d", "90d", "12m", "tudo"]).default("30d");
// Os limites reais por rede vivem em `networks.ts` e são reportados como erros
// de validação legíveis; aqui só barramos valores absurdos.
const mediaSchema = z.object({
  count: z.number().int().min(1).max(100),
  aspectRatio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  fileSizeMb: z.number().min(0),
  durationSeconds: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Sessão, projetos e usuários (PRD 3.1 e 3.7)
// ---------------------------------------------------------------------------

/**
 * Autenticação da plataforma.
 *
 * A senha é conferida contra o hash guardado (scrypt com sal). Quem ainda não
 * definiu senha não entra — exceto no modo demonstração, onde não existe dado de
 * cliente para proteger e a graça é justamente qualquer pessoa poder olhar.
 *
 * "Modo demonstração" é ausência de banco: sem `DATABASE_URL`, a plataforma está
 * rodando com a semente. Amarrar a regra a isso evita uma variável a mais para
 * alguém esquecer de ligar — e o esquecimento aqui é caro.
 *
 * As respostas de erro não distinguem "e-mail não existe" de "senha errada".
 * Distinguir entregaria, a quem tentasse, a lista de quem tem conta.
 */
export const autenticar = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email(), senha: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const demonstracao = !usandoBanco();
    const generico = "E-mail ou senha incorretos.";
    const chave = data.email.toLowerCase();

    // O limite vale antes de qualquer verificação: adivinhar senha por força
    // bruta não pode ser barato só porque o e-mail existe.
    const decisao = avaliar(lerTentativas(chave), Date.now());
    if (!decisao.permitido) {
      return { ok: false as const, erro: mensagemDeBloqueio(decisao.segundosRestantes) };
    }
    if (decisao.atrasoMs > 0) await esperar(decisao.atrasoMs);

    const recusar = (erro: string) => {
      gravarTentativas(chave, registrarErro(lerTentativas(chave), Date.now()));
      // O e-mail tentado entra no lugar do nome: numa entrada recusada não há
      // usuário a que se referir, e é justamente o que foi tentado que se quer
      // ler depois. Nunca a senha — nem quando ela vem errada.
      anotar({
        acao: "entrada_recusada",
        usuarioId: null,
        usuarioNome: data.email,
        alvoRotulo: erro,
      });
      return { ok: false as const, erro };
    };

    const user = db.users.find(
      (candidate) => candidate.email.toLowerCase() === data.email.toLowerCase(),
    );
    if (!user) return recusar(generico);

    if (pareceHash(user.senhaHash)) {
      const confere = await verificarSenha(data.senha, user.senhaHash);
      if (!confere) return recusar(generico);
    } else if (!demonstracao) {
      return {
        ok: false as const,
        erro: "Esta conta ainda não tem senha definida. Peça a um administrador para definir uma.",
      };
    }

    gravarTentativas(chave, registrarAcerto());
    user.lastActiveAt = new Date().toISOString();

    // A partir daqui quem manda é o cookie: o navegador não escolhe mais quem é.
    await abrirSessao(user.id);
    anotarDe(user, { acao: "entrou" });

    return {
      ok: true as const,
      session: {
        user,
        projects: db.projects.filter((project) => user.projectIds.includes(project.id)),
      },
    };
  });

/** Encerra a sessão do lado do servidor, apagando o cookie. */
export const sair = createServerFn({ method: "POST" }).handler(async () => {
  // Antes de fechar: depois, não há mais de quem registrar a saída.
  const usuario = await usuarioAtual();
  if (usuario) anotarDe(usuario, { acao: "saiu" });

  await fecharSessao();
  return { ok: true as const };
});

/**
 * Quem está autenticado agora, segundo o servidor.
 *
 * A tela consulta isto ao abrir. Antes a sessão vinha do `localStorage`, e um
 * navegador com o valor certo escrito à mão "estava logado"; agora a resposta
 * vem de um cookie que só o servidor sabe assinar.
 */
/**
 * A área da pessoa: quem ela é aqui dentro, e o que ela já fez.
 *
 * Junta três coisas que estavam espalhadas — o cadastro, os projetos e o
 * histórico de uso — porque a pergunta "quem sou eu nesta plataforma?" não se
 * responde com o cadastro sozinho. O que a pessoa **pode fazer** é derivado do
 * papel, e vem daqui em vez de ser remontado na tela: a regra tem de ser a
 * mesma que o servidor aplica, senão a tela promete o que a chamada recusa.
 */
export const meuPerfil = createServerFn({ method: "POST" }).handler(async () => {
  const usuario = await exigirUsuario();
  const db = getDb();

  return {
    usuario,
    projetos: db.projects.filter((projeto) => usuario.projectIds.includes(projeto.id)),
    /** As permissões do papel, na ordem em que fazem sentido para quem lê. */
    permissoes: PERMISSOES_EXPLICADAS.filter((item) => can(usuario.role, item.id)),
    negadas: PERMISSOES_EXPLICADAS.filter((item) => !can(usuario.role, item.id)),
    // As últimas coisas que a pessoa fez. É a parte da tela que serve para
    // conferir "fui eu que mexi nisso?" sem pedir nada a ninguém.
    atividade: await consultar({ usuarioId: usuario.id, limite: 12 }),
  };
});

/**
 * O que cada permissão significa em português.
 *
 * Mostrar `publicar_direto` na tela não informa ninguém. A frase explica o que
 * muda na prática — e é ela que faz alguém entender por que um botão não
 * aparece, em vez de achar que a plataforma está com defeito.
 */
const PERMISSOES_EXPLICADAS: { id: string; rotulo: string; explica: string }[] = [
  { id: "metricas", rotulo: "Ver números", explica: "Painel, contas, público e mapa." },
  { id: "publicar", rotulo: "Criar conteúdo", explica: "Escrever peças e mandar para aprovação." },
  {
    id: "publicar_direto",
    rotulo: "Publicar sem aprovação",
    explica: "Manda para a rede na hora — é o que permite cobrir evento ao vivo.",
  },
  { id: "aprovar", rotulo: "Aprovar peças", explica: "Liberar o que outra pessoa escreveu." },
  { id: "impulsionar", rotulo: "Impulsionar", explica: "Criar e acompanhar campanhas pagas." },
  { id: "inbox", rotulo: "Responder pessoas", explica: "Comentários e mensagens diretas." },
  { id: "relatorios", rotulo: "Gerar relatórios", explica: "Montar e compartilhar o PDF." },
  {
    id: "agenda",
    rotulo: "Mexer na agenda",
    explica: "Compromissos, quadro de produção e pautas.",
  },
  { id: "admin", rotulo: "Administrar", explica: "Equipe, papéis e histórico de uso de todos." },
];

/**
 * A pessoa edita o próprio cadastro — e só o próprio.
 *
 * Papel fica de fora de propósito: quem muda papel é administrador, pela tela
 * de Equipe. Um campo de papel aqui seria alguém se promovendo a administrador
 * no próprio perfil, que é a falha de autorização mais banal que existe.
 */
export const atualizarMeuPerfil = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      nome: z.string().min(1).max(120),
      area: z.string().max(120),
      telefone: z.string().max(40),
    }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirUsuario();

    usuario.name = data.nome.trim();
    usuario.area = data.area.trim() || undefined;
    usuario.telefone = data.telefone.trim() || undefined;

    anotarDe(usuario, { acao: "perfil_editado", alvoRotulo: usuario.name });
    await persistir();

    return { ok: true as const, usuario };
  });

export const sessaoAtual = createServerFn({ method: "POST" }).handler(async () => {
  const usuario = await usuarioAtual();
  if (!usuario) return { autenticado: false as const };

  const db = getDb();
  return {
    autenticado: true as const,
    session: {
      user: usuario,
      projects: db.projects.filter((project) => usuario.projectIds.includes(project.id)),
    },
  };
});

/**
 * Define ou troca a senha de um usuário.
 *
 * Trocar a própria senha exige a atual. Um administrador pode definir a de
 * outra pessoa sem ela — é como se recupera o acesso de quem esqueceu.
 *
 * Quem está pedindo vem da sessão do servidor, não do corpo da requisição: um
 * `solicitanteId` enviado pelo navegador seria só uma sugestão.
 */
export const definirSenha = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      senhaNova: z.string().min(TAMANHO_MINIMO_SENHA),
      senhaAtual: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const solicitante = await exigirUsuario();

    const alvo = db.users.find(
      (candidate) => candidate.email.toLowerCase() === data.email.toLowerCase(),
    );
    if (!alvo) return { ok: false as const, erro: "Usuário não encontrado." };

    const ehOProprio = solicitante.id === alvo.id;
    if (!ehOProprio && solicitante.role !== "administrador") {
      return { ok: false as const, erro: "Só um administrador define a senha de outra pessoa." };
    }

    // Trocar a própria senha exige a atual: sem isso, uma sessão esquecida
    // aberta vira uma conta tomada.
    if (ehOProprio && pareceHash(alvo.senhaHash)) {
      const confere = data.senhaAtual
        ? await verificarSenha(data.senhaAtual, alvo.senhaHash)
        : false;
      if (!confere) return { ok: false as const, erro: "A senha atual não confere." };
    }

    try {
      alvo.senhaHash = await gerarHash(data.senhaNova);
    } catch (erro) {
      return {
        ok: false as const,
        erro: erro instanceof Error ? erro.message : "Não foi possível definir a senha.",
      };
    }

    anotarDe(solicitante, {
      acao: "senha_definida",
      alvoId: alvo.id,
      alvoRotulo: alvo.name,
      detalhes: { proprio: ehOProprio ? "sim" : "não" },
    });

    const gravacao = await persistir();
    return { ok: true as const, gravacao };
  });

export const listarUsuarios = createServerFn({ method: "POST" }).handler(async () => {
  await exigirAdministrador();
  const db = getDb();
  return { users: db.users, projects: db.projects };
});

export const atualizarUsuario = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string(),
      role: z.enum(["administrador", "gestor", "editor", "atendimento"]).optional(),
      projectIds: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const administrador = await exigirAdministrador();
    const db = getDb();
    const user = db.users.find((candidate) => candidate.id === data.userId);
    if (!user) throw new Error("Usuário não encontrado.");

    const papelAntes = user.role;
    const projetosAntes = user.projectIds.length;
    if (data.role) user.role = data.role;
    if (data.projectIds) user.projectIds = data.projectIds;

    anotarDe(administrador, {
      acao: "usuario_alterado",
      alvoId: user.id,
      alvoRotulo: user.name,
      detalhes: {
        papel: papelAntes === user.role ? user.role : `${papelAntes} → ${user.role}`,
        projetos:
          projetosAntes === user.projectIds.length
            ? user.projectIds.length
            : `${projetosAntes} → ${user.projectIds.length}`,
      },
    });

    // Sem isto, tirar o acesso de alguém valia até o próximo restart — que é o
    // oposto do que a ação promete.
    const gravacao = await persistir();
    return { user, gravacao };
  });

export const convidarUsuario = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.enum(["administrador", "gestor", "editor", "atendimento"]),
      projectIds: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const administrador = await exigirAdministrador();
    const db = getDb();
    if (db.users.some((user) => user.email.toLowerCase() === data.email.toLowerCase())) {
      return { ok: false as const, erro: "Já existe um usuário com este e-mail." };
    }

    const user = {
      id: nextId("user"),
      name: data.name,
      email: data.email,
      role: data.role,
      projectIds: data.projectIds,
      lastActiveAt: new Date().toISOString(),
      avatarGradient: "linear-gradient(135deg, oklch(0.6 0.18 200), oklch(0.4 0.16 280))",
    };
    db.users.push(user);

    anotarDe(administrador, {
      acao: "usuario_convidado",
      alvoId: user.id,
      alvoRotulo: `${user.name} <${user.email}>`,
      detalhes: { papel: user.role, projetos: user.projectIds.length },
    });

    const gravacao = await persistir();
    return { ok: true as const, user, gravacao };
  });

// ---------------------------------------------------------------------------
// Contas conectadas (PRD 3.1)
// ---------------------------------------------------------------------------

/**
 * As contas que quem está pedindo pode ver.
 *
 * Este é o gargalo por onde quase toda leitura passa, e é aqui que a
 * autorização mora. Antes a função recebia um `projectId` do navegador e
 * confiava nele; agora ela confirma na sessão do servidor que a pessoa tem
 * acesso àquele projeto — e, sem projeto informado, devolve só os projetos dela.
 *
 * O nome mudou junto com o comportamento de propósito: `accountsOfProject`
 * soava como um filtro, e filtro é algo que se pode esquecer de aplicar.
 */
async function contasPermitidas(projectId: string | undefined): Promise<SocialAccount[]> {
  const { projetos } = await exigirProjetos(projectId);
  const db = getDb();
  return db.accounts.filter((account) => projetos.includes(account.projectId));
}

export const listarContas = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = await contasPermitidas(data.projectId);
    return {
      accounts,
      projects: db.projects,
      /** Dias restantes até o token expirar, para o alerta de reconexão. */
      tokenWarnings: accounts
        .filter((account) => account.tokenExpiresAt !== null)
        .map((account) => ({
          accountId: account.id,
          daysToExpire: Math.ceil(
            (new Date(`${account.tokenExpiresAt}T00:00:00`).getTime() - Date.now()) / 86400000,
          ),
        }))
        .filter((warning) => warning.daysToExpire <= 15),
    };
  });

/**
 * Conclui a conexão de um perfil. Em produção este passo recebe o `code` do
 * OAuth oficial da rede e troca por um token de longa duração; aqui o handshake
 * é simulado e a conta entra já sincronizada.
 */
export const conectarConta = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      networkId: z.enum(NETWORK_IDS as [NetworkId, ...NetworkId[]]),
      handle: z.string().min(2),
      displayName: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { usuario } = await exigirProjetos(data.projectId);
    const db = getDb();
    const duplicated = db.accounts.some(
      (account) =>
        account.networkId === data.networkId &&
        account.handle.toLowerCase() === data.handle.toLowerCase(),
    );
    if (duplicated) {
      return { ok: false as const, erro: "Este perfil já está conectado." };
    }

    const now = new Date();
    const account: SocialAccount = {
      id: nextId("acc"),
      projectId: data.projectId,
      networkId: data.networkId as NetworkId,
      handle: data.handle,
      displayName: data.displayName,
      status: "ativa",
      origem: "demonstracao",
      adAccountConnected: false,
      trackingSince: toDayKey(now),
      tokenExpiresAt: toDayKey(new Date(now.getTime() + 60 * 86400000)),
      lastSyncAt: now.toISOString(),
      messagingApproved: false,
      avatarGradient: "linear-gradient(135deg, oklch(0.62 0.2 40), oklch(0.4 0.18 300))",
    };

    db.accounts.push(account);
    // Conta nova começa sem histórico: a curva de evolução nasce hoje.
    db.metrics.set(account.id, []);
    db.audience.set(account.id, {
      available: NETWORKS[account.networkId].supportsAudienceInsights,
      unavailableReason: NETWORKS[account.networkId].supportsAudienceInsights
        ? undefined
        : `A API do ${NETWORKS[account.networkId].label} não expõe dados de perfil do público.`,
      newFollowers: 0,
      unfollows: 0,
      topInteractors: [],
      activityByHour: [],
      topCities: [],
      demografia: [],
    });

    anotarDe(usuario, {
      acao: "conta_conectada",
      projetoId: account.projectId,
      alvoId: account.id,
      alvoRotulo: rotuloDaConta(account.id),
      detalhes: { rede: account.networkId },
    });

    return { ok: true as const, account };
  });

export const atualizarConexao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountId: z.string(),
      acao: z.enum(["reconectar", "desconectar", "sincronizar", "conectar_anuncios"]),
    }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirConta(data.accountId);
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    const now = new Date();
    switch (data.acao) {
      case "reconectar":
        account.status = "ativa";
        account.tokenExpiresAt = toDayKey(new Date(now.getTime() + 60 * 86400000));
        account.lastSyncAt = now.toISOString();
        break;
      case "desconectar":
        // O histórico continua no store: desconectar não apaga métricas (PRD 3.2).
        account.status = "desconectada";
        account.tokenExpiresAt = null;
        break;
      case "sincronizar":
        account.lastSyncAt = now.toISOString();
        break;
      case "conectar_anuncios":
        account.adAccountConnected = true;
        break;
    }

    anotarDe(usuario, {
      acao: data.acao === "desconectar" ? "conta_desconectada" : "conexao_alterada",
      projetoId: account.projectId,
      alvoId: account.id,
      alvoRotulo: rotuloDaConta(account.id),
      detalhes: { operacao: data.acao },
    });

    return { account };
  });

// ---------------------------------------------------------------------------
// Métricas (PRD 3.2)
// ---------------------------------------------------------------------------

function accountSummary(account: SocialAccount, period: PeriodKey) {
  const db = getDb();
  const metrics = db.metrics.get(account.id) ?? [];
  return {
    account,
    summary: summarize(metrics, period),
    series: buildSeries(slicePeriod(metrics, period)),
    split: splitOrganicPaid(slicePeriod(metrics, period)),
    daysTracked: metrics.length,
  };
}

/** Visão consolidada do projeto: todas as contas somadas + destaque por conta. */
export const obterPainel = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), period: periodSchema }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = await contasPermitidas(data.projectId);
    const period = data.period as PeriodKey;

    const seriesByAccount = accounts.map((account) =>
      slicePeriod(db.metrics.get(account.id) ?? [], period),
    );
    const merged = mergeSeries(seriesByAccount);

    const posts = db.posts
      .filter((post) => post.accountIds.some((id) => accounts.some((account) => account.id === id)))
      .filter((post) => post.status === "publicado" && post.metrics)
      .sort((a, b) => (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0))
      .slice(0, 5);

    const pendingInbox = db.inbox.filter(
      (item) =>
        item.status === "pendente" && accounts.some((account) => account.id === item.accountId),
    ).length;

    const scheduled = db.posts.filter(
      (post) =>
        (post.status === "agendado" || post.status === "aguardando_aprovacao") &&
        post.accountIds.some((id) => accounts.some((account) => account.id === id)),
    ).length;

    return {
      period,
      accounts: accounts.map((account) => accountSummary(account, period)),
      summary: summarize(merged, "tudo"),
      series: buildSeries(merged),
      split: splitOrganicPaid(merged),
      topPosts: posts,
      pendingInbox,
      scheduled,
      activeBoosts: db.boosts.filter(
        (boost) =>
          boost.status === "ativo" && accounts.some((account) => account.id === boost.accountId),
      ).length,
      // Um bloco por rede, para o cartão de cada uma no painel. Agrupar aqui e
      // não na tela evita mandar o histórico inteiro de cada conta pela rede só
      // para a tela somá-lo de novo.
      redes: resumirRedes(accounts, period),
    };
  });

/**
 * Consolida os canais por rede social, com a curva de cada uma.
 *
 * O agrupamento é por rede, não por perfil, porque é assim que a pergunta
 * costuma vir: "como está o Instagram?", e não "como está cada um dos três
 * perfis de Instagram?". O detalhe por perfil continua a um clique.
 */
function resumirRedes(contas: SocialAccount[], period: PeriodKey) {
  const db = getDb();
  const porRede = new Map<NetworkId, SocialAccount[]>();

  for (const conta of contas) {
    porRede.set(conta.networkId, [...(porRede.get(conta.networkId) ?? []), conta]);
  }

  return [...porRede.entries()]
    .map(([networkId, contasDaRede]) => {
      /**
       * A série inteira vai para o `summarize`, e não a já recortada.
       *
       * `summarize` compara o período pedido com o período anterior de mesmo
       * tamanho — e para isso precisa ter o anterior em mãos. Recortar antes
       * deixava o "anterior" vazio, e a variação do alcance saía zero em todos
       * os cartões, aparecendo na tela como um traço. Um traço em todo cartão
       * lê como "a plataforma não sabe", quando o dado sempre esteve ali.
       */
      const serieCompleta = mergeSeries(
        contasDaRede.map((conta) => db.metrics.get(conta.id) ?? []),
      );
      const resumo = summarize(serieCompleta, period);
      const juntas = slicePeriod(serieCompleta, period);
      const split = splitOrganicPaid(juntas);

      return {
        networkId,
        contas: contasDaRede.length,
        /**
         * Nenhum dado importado para esta rede.
         *
         * É diferente de "os números estão em zero": a rede existe no cadastro e
         * nunca recebeu leitura nenhuma. A tela precisa dizer isso em vez de
         * desenhar um cartão zerado, que lê como queda.
         */
        semDados: serieCompleta.length === 0,
        // Uma conexão com problema pesa mais que o número bonito: é ela que
        // explica por que o número parou de crescer.
        comProblema: contasDaRede.filter((conta) => conta.status !== "ativa").length,
        resumo,
        split,
        // Poucos pontos de propósito: é uma linha de tendência do tamanho de um
        // cartão, não um gráfico para ler valores.
        faisca: buildSeries(juntas, 24).map((ponto) => ponto.followers),
        publicacoes: db.posts.filter(
          (post) =>
            post.status === "publicado" &&
            post.accountIds.some((id) => contasDaRede.some((conta) => conta.id === id)),
        ).length,
        pendentes: db.inbox.filter(
          (item) =>
            item.status === "pendente" && contasDaRede.some((conta) => conta.id === item.accountId),
        ).length,
      };
    })
    .sort((a, b) => b.resumo.followers - a.resumo.followers);
}

/** Detalhe de uma conta: curva desde o início, orgânico x pago e público. */
export const obterConta = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accountId: z.string(), period: periodSchema }))
  .handler(async ({ data }) => {
    await exigirConta(data.accountId);
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    const period = data.period as PeriodKey;
    const metrics = db.metrics.get(account.id) ?? [];
    const windowed = slicePeriod(metrics, period);

    return {
      ...accountSummary(account, period),
      /** Curva completa desde o início do acompanhamento, independente do filtro. */
      lifetimeSeries: buildSeries(metrics, 120),
      audience: db.audience.get(account.id) ?? null,
      capabilities: NETWORKS[account.networkId],
      posts: db.posts.filter((post) => post.accountIds.includes(account.id)).slice(0, 8),
      boosts: db.boosts.filter((boost) => boost.accountId === account.id),
      firstDay: metrics[0]?.date ?? null,
      lastDay: metrics[metrics.length - 1]?.date ?? null,
      windowDays: windowed.length,
    };
  });

// ---------------------------------------------------------------------------
// Publicação (PRD 3.3)
// ---------------------------------------------------------------------------

const draftSchema = z.object({
  projectId: z.string(),
  accountIds: z.array(z.string()).min(1),
  format: z.enum(["imagem", "carrossel", "video", "story"]),
  caption: z.string().max(63206),
  media: mediaSchema,
});

/** Valida o rascunho contra os limites de cada rede antes de publicar. */
export const validarRascunho = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountIds: z.array(z.string()),
      format: z.enum(["imagem", "carrossel", "video", "story"]),
      caption: z.string(),
      media: mediaSchema,
    }),
  )
  .handler(async ({ data }) => {
    await exigirContas(data.accountIds);
    const db = getDb();
    const accounts = db.accounts.filter((account) => data.accountIds.includes(account.id));
    const issues = validateDraft(
      { format: data.format as PostFormat, caption: data.caption, media: data.media },
      accounts,
    );
    return { issues, bloqueado: hasBlockingIssues(issues) };
  });

export const listarPublicacoes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = await contasPermitidas(data.projectId);
    const accountIds = new Set(accounts.map((account) => account.id));
    return {
      posts: db.posts
        .filter((post) => post.accountIds.some((id) => accountIds.has(id)))
        .sort(sortPostsByRecency),
      accounts,
      users: db.users,
    };
  });

export const criarPublicacao = createServerFn({ method: "POST" })
  .inputValidator(
    draftSchema.extend({
      createdBy: z.string(),
      requiresApproval: z.boolean(),
      scheduledFor: z.string().nullable(),
      /** "agora" publica imediatamente; "rascunho" só salva. */
      acao: z.enum(["publicar", "agendar", "rascunho"]),
    }),
  )
  .handler(async ({ data }) => {
    const { usuario } = await exigirProjetos(data.projectId);
    await exigirContas(data.accountIds);
    const db = getDb();
    const accounts = db.accounts.filter((account) => data.accountIds.includes(account.id));
    const issues = validateDraft(
      { format: data.format as PostFormat, caption: data.caption, media: data.media },
      accounts,
    );

    // Rascunho pode ficar inválido; publicar ou agendar, não.
    if (data.acao !== "rascunho" && hasBlockingIssues(issues)) {
      return { ok: false as const, issues };
    }

    const now = new Date();
    const status: Post["status"] =
      data.acao === "rascunho"
        ? "rascunho"
        : data.requiresApproval
          ? "aguardando_aprovacao"
          : data.acao === "publicar"
            ? "publicado"
            : "agendado";

    const post: Post = {
      id: nextId("post"),
      projectId: data.projectId,
      accountIds: data.accountIds,
      format: data.format as PostFormat,
      caption: data.caption,
      media: data.media,
      status,
      scheduledFor: data.acao === "agendar" ? data.scheduledFor : null,
      publishedAt: status === "publicado" ? now.toISOString() : null,
      createdBy: data.createdBy,
      approvedBy: null,
      requiresApproval: data.requiresApproval,
      metrics:
        status === "publicado"
          ? { reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0 }
          : null,
      coverGradient: "linear-gradient(135deg, oklch(0.6 0.2 40), oklch(0.38 0.18 290))",
    };

    db.posts.unshift(post);

    anotarDe(usuario, {
      acao: "publicacao_criada",
      projetoId: post.projectId,
      alvoId: post.id,
      alvoRotulo: resumoDaLegenda(post.caption),
      detalhes: { situacao: post.status, formato: post.format, contas: post.accountIds.length },
    });

    return { ok: true as const, post, issues };
  });

export const atualizarPublicacao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      acao: z.enum(["aprovar", "reprovar", "publicar_agora", "excluir"]),
      userId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirPublicacao(data.postId);
    const db = getDb();
    const index = db.posts.findIndex((post) => post.id === data.postId);
    if (index === -1) throw new Error("Publicação não encontrada.");
    const post = db.posts[index];

    switch (data.acao) {
      case "aprovar":
        post.approvedBy = data.userId ?? null;
        post.status = post.scheduledFor ? "agendado" : "aprovado";
        break;
      case "reprovar":
        post.approvedBy = null;
        post.status = "rascunho";
        break;
      case "publicar_agora": {
        const accounts = db.accounts.filter((account) => post.accountIds.includes(account.id));
        const issues = validateDraft(
          { format: post.format, caption: post.caption, media: post.media },
          accounts,
        );
        if (hasBlockingIssues(issues)) {
          post.status = "falhou";
          post.failureReason = issues.find((issue) => issue.severity === "erro")?.message;
          return { ok: false as const, post, issues };
        }
        post.status = "publicado";
        post.publishedAt = new Date().toISOString();
        post.scheduledFor = null;
        post.metrics = post.metrics ?? {
          reach: 0,
          impressions: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          saves: 0,
        };
        break;
      }
      case "excluir":
        db.posts.splice(index, 1);
        anotarDe(usuario, {
          acao: "publicacao_alterada",
          projetoId: post.projectId,
          alvoId: post.id,
          alvoRotulo: resumoDaLegenda(post.caption),
          detalhes: { operacao: "excluir" },
        });
        return { ok: true as const, post: null, issues: [] };
    }

    anotarDe(usuario, {
      acao: "publicacao_alterada",
      projetoId: post.projectId,
      alvoId: post.id,
      alvoRotulo: resumoDaLegenda(post.caption),
      detalhes: { operacao: data.acao, situacao: post.status },
    });

    return { ok: true as const, post, issues: [] };
  });

/**
 * Republica uma publicação que já foi ao ar (repost).
 *
 * O que nasce daqui é uma publicação nova, não uma cópia disfarçada: id próprio,
 * métricas zeradas e `republicadoDe` apontando para a original. Sem essa
 * separação, o repost herdaria os números do post antigo e o histórico deixaria
 * de dizer a verdade sobre o que cada peça alcançou.
 *
 * A legenda vem editável de propósito — repetir o texto idêntico é o que a rede
 * lê como conteúdo duplicado.
 */
export const republicarPublicacao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      createdBy: z.string(),
      /** Legenda ajustada; em branco reaproveita a original. */
      caption: z.string().optional(),
      /** Subconjunto das contas originais; em branco republica em todas. */
      accountIds: z.array(z.string()).optional(),
      acao: z.enum(["publicar", "agendar", "rascunho"]),
      scheduledFor: z.string().nullable().default(null),
      requiresApproval: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirPublicacao(data.postId);
    const db = getDb();
    const original = db.posts.find((candidate) => candidate.id === data.postId);
    if (!original) throw new Error("Publicação não encontrada.");
    if (original.status !== "publicado") {
      return {
        ok: false as const,
        issues: [],
        erro: "Só dá para republicar uma publicação que já foi ao ar.",
      };
    }

    const accountIds =
      data.accountIds && data.accountIds.length > 0
        ? original.accountIds.filter((id) => data.accountIds!.includes(id))
        : original.accountIds;
    if (accountIds.length === 0) {
      return { ok: false as const, issues: [], erro: "Escolha ao menos uma conta de destino." };
    }

    const caption = data.caption?.trim() ? data.caption : original.caption;
    const contas = db.accounts.filter((account) => accountIds.includes(account.id));
    const issues = validateDraft(
      { format: original.format, caption, media: original.media },
      contas,
    );
    if (data.acao !== "rascunho" && hasBlockingIssues(issues)) {
      return { ok: false as const, issues, erro: null };
    }

    const agora = new Date();
    const status: Post["status"] =
      data.acao === "rascunho"
        ? "rascunho"
        : data.requiresApproval
          ? "aguardando_aprovacao"
          : data.acao === "publicar"
            ? "publicado"
            : "agendado";

    const post: Post = {
      ...original,
      id: nextId("post"),
      republicadoDe: original.id,
      accountIds,
      caption,
      status,
      scheduledFor: data.acao === "agendar" ? data.scheduledFor : null,
      publishedAt: status === "publicado" ? agora.toISOString() : null,
      createdBy: data.createdBy,
      approvedBy: null,
      requiresApproval: data.requiresApproval,
      failureReason: undefined,
      // Métricas nunca são herdadas: o alcance do repost é dele.
      metrics:
        status === "publicado"
          ? { reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0, saves: 0 }
          : null,
    };

    db.posts.unshift(post);

    anotarDe(usuario, {
      acao: "publicacao_republicada",
      projetoId: post.projectId,
      alvoId: post.id,
      alvoRotulo: resumoDaLegenda(post.caption),
      detalhes: { original: original.id, situacao: post.status, contas: accountIds.length },
    });

    return { ok: true as const, post, issues, erro: null };
  });

// ---------------------------------------------------------------------------
// Impulsionamento (PRD 3.4)
// ---------------------------------------------------------------------------

export const listarImpulsionamentos = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const accounts = await contasPermitidas(data.projectId);
    const accountIds = new Set(accounts.map((account) => account.id));
    const boosts = db.boosts.filter((boost) => accountIds.has(boost.accountId));

    return {
      boosts: boosts.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      accounts,
      /** Só posts publicados em contas com anúncios ativos podem ser impulsionados. */
      elegiveis: db.posts.filter(
        (post) =>
          post.status === "publicado" &&
          post.accountIds.some((id) => {
            const account = accounts.find((candidate) => candidate.id === id);
            return account?.adAccountConnected && NETWORKS[account.networkId].supportsBoost;
          }),
      ),
      posts: db.posts,
    };
  });

export const criarImpulsionamento = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      accountId: z.string(),
      objective: z.enum(["alcance", "engajamento", "trafego", "mensagens"]),
      budgetTotal: z.number().min(6),
      durationDays: z.number().int().min(1).max(90),
      locations: z.array(z.string()).min(1),
      ageMin: z.number().int().min(13).max(65),
      ageMax: z.number().int().min(13).max(65),
      interests: z.array(z.string()),
    }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirConta(data.accountId);
    await exigirPublicacao(data.postId);
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    const network = NETWORKS[account.networkId];
    if (!network.supportsBoost) {
      return {
        ok: false as const,
        erro: `O ${network.label} ainda não permite impulsionar pela API.`,
      };
    }
    if (!account.adAccountConnected) {
      return {
        ok: false as const,
        erro: `Conecte a conta de anúncios do ${network.label} para impulsionar publicações.`,
      };
    }
    if (account.status !== "ativa") {
      return { ok: false as const, erro: "A conexão desta conta precisa estar ativa." };
    }
    if (data.ageMax < data.ageMin) {
      return { ok: false as const, erro: "A idade máxima precisa ser maior que a mínima." };
    }

    const now = new Date();
    const boost: Boost = {
      id: nextId("boost"),
      postId: data.postId,
      accountId: data.accountId,
      objective: data.objective,
      budgetTotal: data.budgetTotal,
      durationDays: data.durationDays,
      startedAt: toDayKey(now),
      endsAt: toDayKey(new Date(now.getTime() + data.durationDays * 86400000)),
      // A rede ainda precisa revisar o anúncio antes de veicular.
      status: "em_analise",
      audience: {
        locations: data.locations,
        ageMin: data.ageMin,
        ageMax: data.ageMax,
        interests: data.interests,
      },
      results: { spend: 0, reach: 0, impressions: 0, engagement: 0, clicks: 0 },
    };

    db.boosts.unshift(boost);

    // O valor entra no histórico porque dinheiro é a parte que alguém vai
    // querer conferir depois, e é a que ninguém lembra de cabeça.
    anotarDe(usuario, {
      acao: "impulsionamento_criado",
      projetoId: account.projectId,
      alvoId: boost.id,
      alvoRotulo: rotuloDaConta(account.id),
      detalhes: {
        objetivo: boost.objective,
        orcamento: boost.budgetTotal,
        dias: boost.durationDays,
      },
    });

    return { ok: true as const, boost };
  });

export const encerrarImpulsionamento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ boostId: z.string() }))
  .handler(async ({ data }) => {
    const usuario = await exigirImpulsionamento(data.boostId);
    const db = getDb();
    const boost = db.boosts.find((candidate) => candidate.id === data.boostId);
    if (!boost) throw new Error("Impulsionamento não encontrado.");
    boost.status = "encerrado";
    boost.endsAt = toDayKey(new Date());

    anotarDe(usuario, {
      acao: "impulsionamento_encerrado",
      projetoId: projetoDaConta(boost.accountId),
      alvoId: boost.id,
      alvoRotulo: rotuloDaConta(boost.accountId),
      detalhes: { investido: boost.results.spend, alcance: boost.results.reach },
    });

    return { boost };
  });

// ---------------------------------------------------------------------------
// Caixa de entrada unificada (PRD 3.5)
// ---------------------------------------------------------------------------

export const listarInbox = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().optional(),
      /** Libera novas interações da fila — usado pelo polling da tela. */
      poll: z.boolean().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const novo: InboxItem | null = data.poll ? releaseIncoming() : null;
    const accounts = await contasPermitidas(data.projectId);
    const accountIds = new Set(accounts.map((account) => account.id));

    const items = db.inbox
      .filter((item) => accountIds.has(item.accountId))
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

    return {
      items,
      accounts,
      users: db.users,
      novoId: novo && accountIds.has(novo.accountId) ? novo.id : null,
      pendentes: items.filter((item) => item.status === "pendente").length,
      // A origem de cada conversa vai junto: sem isto a tela mostra um
      // identificador cru ("post-4") onde deveria dizer que foi o vídeo de
      // quinta às 19h. Vai indexado por publicação, e não repetido em cada
      // interação, porque várias conversas nascem da mesma peça.
      origens: indexarOrigens(items, db.posts, accounts),
      conversasPorPeca: conversasPorPeca(items),
    };
  });

export const responderInbox = createServerFn({ method: "POST" })
  .inputValidator(z.object({ itemId: z.string(), texto: z.string().min(1), autor: z.string() }))
  .handler(async ({ data }) => {
    const usuario = await exigirInteracao(data.itemId);
    const db = getDb();
    const item = db.inbox.find((candidate) => candidate.id === data.itemId);
    if (!item) throw new Error("Interação não encontrada.");

    const account = db.accounts.find((candidate) => candidate.id === item.accountId);
    if (account && account.status !== "ativa") {
      return {
        ok: false as const,
        erro: "A conexão desta conta está inativa; reconecte para responder.",
      };
    }
    if (account && item.kind === "mensagem" && !account.messagingApproved) {
      return {
        ok: false as const,
        erro: `As permissões de mensageria do ${NETWORKS[account.networkId].label} ainda não foram aprovadas para esta conta.`,
      };
    }

    item.replies.push({
      id: nextId("reply"),
      author: data.autor,
      text: data.texto,
      sentAt: new Date().toISOString(),
    });
    item.status = "respondido";

    // O texto da resposta não entra: o histórico diz que houve resposta e a
    // quem, não repete o conteúdo da conversa.
    anotarDe(usuario, {
      acao: "interacao_respondida",
      projetoId: projetoDaConta(item.accountId),
      alvoId: item.id,
      alvoRotulo: `${item.authorHandle} · ${rotuloDaConta(item.accountId)}`,
      detalhes: { tipo: item.kind },
    });

    return { ok: true as const, item };
  });

export const atualizarInbox = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      itemId: z.string(),
      status: z.enum(["pendente", "respondido"]).optional(),
      assignedTo: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirInteracao(data.itemId);
    const db = getDb();
    const item = db.inbox.find((candidate) => candidate.id === data.itemId);
    if (!item) throw new Error("Interação não encontrada.");
    if (data.status) item.status = data.status;
    if (data.assignedTo !== undefined) item.assignedTo = data.assignedTo;
    return { item };
  });

// ---------------------------------------------------------------------------
// Gerenciamento de relacionamento
// ---------------------------------------------------------------------------

/**
 * Responde várias interações de uma vez, personalizando o texto por pessoa.
 *
 * A checagem de quem pode receber acontece *antes* de qualquer envio: comentário
 * público sempre pode; mensagem direta só dentro da janela de 24h da rede e em
 * conta com mensageria aprovada. O que não passa volta como "ignorado", com o
 * motivo — em vez de virar uma tentativa que a rede recusaria.
 */
export const responderEmLote = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      itemIds: z.array(z.string()).min(1).max(200),
      texto: z.string().min(1),
      autor: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const selecionados = db.inbox.filter((item) => data.itemIds.includes(item.id));
    if (selecionados.length === 0) throw new Error("Nenhuma interação encontrada.");

    // Uma lista de ids é um convite a misturar projetos: basta um id de outro
    // cliente no meio para vazar. Todos precisam passar pela mesma checagem.
    const usuario = await exigirContas([...new Set(selecionados.map((item) => item.accountId))]);

    const contaPorId = new Map(db.accounts.map((account) => [account.id, account]));

    // Conexão inativa é motivo próprio: não adianta olhar janela nem permissão.
    const comConexao: InboxItem[] = [];
    const ignorados: { itemId: string; motivo: string }[] = [];
    for (const item of selecionados) {
      const account = contaPorId.get(item.accountId);
      if (account && account.status !== "ativa") {
        ignorados.push({
          itemId: item.id,
          motivo: `A conexão com ${NETWORKS[account.networkId].label} está ${statusLabel(account.status)}.`,
        });
        continue;
      }
      comConexao.push(item);
    }

    const mensageriaPorConta: Record<string, boolean> = {};
    for (const account of db.accounts) {
      mensageriaPorConta[account.id] = account.messagingApproved;
    }

    const separacao = separarEnviaveis(comConexao, { agoraMs: Date.now(), mensageriaPorConta });
    ignorados.push(...separacao.ignorados);

    const agora = new Date().toISOString();
    const enviados: { itemId: string; texto: string }[] = [];
    for (const item of comConexao) {
      if (!separacao.enviados.includes(item.id)) continue;
      const texto = aplicarModelo(data.texto, {
        nome: item.authorName,
        handle: item.authorHandle,
      });
      item.replies.push({ id: nextId("reply"), author: data.autor, text: texto, sentAt: agora });
      item.status = "respondido";
      enviados.push({ itemId: item.id, texto });
    }

    anotarDe(usuario, {
      acao: "resposta_em_lote",
      projetoId: projetoDaConta(selecionados[0].accountId),
      alvoRotulo: `${enviados.length} de ${selecionados.length} interações`,
      detalhes: { enviados: enviados.length, ignorados: ignorados.length },
    });

    return { enviados, ignorados };
  });

/**
 * Ajusta à mão o grau de relação de uma pessoa.
 *
 * Vale para todos os itens do mesmo `@handle`: o grau pertence à pessoa, não à
 * mensagem, e o time que conhece a base sabe mais do que a heurística de
 * volume de interações.
 */
export const classificarPessoa = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      handle: z.string().min(1),
      relacao: z.enum(["nao_seguidor", "seguidor", "apoiador", "defensor"]),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const usuario = await exigirUsuario();

    // O mesmo @ pode aparecer em contas de projetos diferentes. A reclassificação
    // só alcança as contas que esta pessoa administra — senão, marcar alguém como
    // defensor num projeto mexeria no cadastro de outro cliente.
    const contasPermitidas = new Set(
      db.accounts
        .filter((conta) => usuario.projectIds.includes(conta.projectId))
        .map((conta) => conta.id),
    );

    const itens = db.inbox.filter(
      (item) => item.authorHandle === data.handle && contasPermitidas.has(item.accountId),
    );
    if (itens.length === 0) throw new Error("Pessoa não encontrada.");
    const relacaoAnterior = itens[0].relacao;
    for (const item of itens) item.relacao = data.relacao;

    anotarDe(usuario, {
      acao: "relacao_alterada",
      projetoId: projetoDaConta(itens[0].accountId),
      alvoRotulo: data.handle,
      detalhes: { de: relacaoAnterior, para: data.relacao, itens: itens.length },
    });

    return { handle: data.handle, relacao: data.relacao, atualizados: itens.length };
  });

// ---------------------------------------------------------------------------
// Relatórios (PRD 3.6)
// ---------------------------------------------------------------------------

export const listarRelatorios = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    return {
      reports: db.reports
        .filter((report) => !data.projectId || report.projectId === data.projectId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      accounts: await contasPermitidas(data.projectId),
    };
  });

export const gerarRelatorio = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      accountIds: z.array(z.string()).min(1),
      title: z.string().min(1),
      period: periodSchema,
      createdBy: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { usuario } = await exigirProjetos(data.projectId);
    await exigirContas(data.accountIds);
    const db = getDb();
    const merged = mergeSeries(
      data.accountIds.map((id) => slicePeriod(db.metrics.get(id) ?? [], data.period as PeriodKey)),
    );

    const report = {
      id: nextId("rep"),
      projectId: data.projectId,
      accountIds: data.accountIds,
      title: data.title,
      periodStart: merged[0]?.date ?? toDayKey(new Date()),
      periodEnd: merged[merged.length - 1]?.date ?? toDayKey(new Date()),
      createdAt: new Date().toISOString(),
      createdBy: data.createdBy,
      shareToken: gerarTokenDeCompartilhamento(),
      shareEnabled: false,
    };

    db.reports.unshift(report);

    anotarDe(usuario, {
      acao: "relatorio_gerado",
      projetoId: report.projectId,
      alvoId: report.id,
      alvoRotulo: report.title,
      detalhes: {
        periodo: `${report.periodStart} a ${report.periodEnd}`,
        contas: report.accountIds.length,
      },
    });

    // Relatório que some no restart não é relatório: o link compartilhado com o
    // cliente deixaria de existir sem aviso.
    const gravacao = await persistir();
    return { report, gravacao };
  });

export const alternarCompartilhamento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ reportId: z.string(), enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const usuario = await exigirRelatorio(data.reportId);
    const db = getDb();
    const report = db.reports.find((candidate) => candidate.id === data.reportId);
    if (!report) throw new Error("Relatório não encontrado.");
    report.shareEnabled = data.enabled;

    // Abrir um link público é a ação com maior alcance de todas as da tela:
    // depois dela, os números do cliente estão a um endereço de distância de
    // qualquer pessoa. Fica registrada com peso de atenção.
    anotarDe(usuario, {
      acao: data.enabled ? "relatorio_compartilhado" : "relatorio_fechado",
      projetoId: report.projectId,
      alvoId: report.id,
      alvoRotulo: report.title,
    });

    const gravacao = await persistir();
    return { report, gravacao };
  });

/** Consumido pela página pública somente leitura — não exige sessão. */
export const obterRelatorioPublico = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const report = db.reports.find((candidate) => candidate.shareToken === data.token);
    if (!report || !report.shareEnabled) {
      return { ok: false as const };
    }

    const accounts = db.accounts.filter((account) => report.accountIds.includes(account.id));
    const merged = mergeSeries(
      report.accountIds.map((id) =>
        (db.metrics.get(id) ?? []).filter(
          (metric) => metric.date >= report.periodStart && metric.date <= report.periodEnd,
        ),
      ),
    );

    const posts = db.posts
      .filter(
        (post) =>
          post.status === "publicado" &&
          post.publishedAt !== null &&
          post.accountIds.some((id) => report.accountIds.includes(id)),
      )
      .sort((a, b) => (b.metrics?.reach ?? 0) - (a.metrics?.reach ?? 0))
      .slice(0, 5);

    return {
      ok: true as const,
      report,
      project: db.projects.find((project) => project.id === report.projectId) ?? null,
      accounts,
      summary: summarize(merged, "tudo"),
      series: buildSeries(merged),
      split: splitOrganicPaid(merged),
      posts,
      boosts: db.boosts.filter((boost) => report.accountIds.includes(boost.accountId)),
    };
  });

// ---------------------------------------------------------------------------
// Conexão real com a Meta — Facebook e Instagram (PRD 3.1)
// ---------------------------------------------------------------------------

/**
 * Diz à interface se a integração oficial está configurada.
 *
 * Sem as variáveis do app da Meta a plataforma continua utilizável em modo
 * demonstração; a tela de contas explica o que falta em vez de oferecer um
 * botão que não funcionaria.
 */
export const situacaoIntegracao = createServerFn({ method: "POST" }).handler(async () => {
  await exigirUsuario();
  const config = getMetaConfig();
  const faltando: string[] = [];
  if (!config.appId) faltando.push("META_APP_ID");
  if (!config.appSecret) faltando.push("META_APP_SECRET");
  if (!config.redirectUri) faltando.push("META_REDIRECT_URI");
  if (!config.chaveCriptografia) faltando.push("SOCIAL_CRYPTO_KEY");

  return {
    habilitada: config.habilitada && Boolean(config.chaveCriptografia),
    faltando,
    redirectUri: config.redirectUri ?? null,
  };
});

const gruposEscopo = z
  .array(z.enum(["leitura", "publicacao", "atendimento", "anuncios"]))
  .min(1)
  .default(["leitura", "publicacao", "atendimento"]);

/**
 * Passo 1 do "Conectar com Facebook": devolve a URL do diálogo oficial.
 *
 * A pessoa autoriza na página da Meta e volta para `META_REDIRECT_URI`. Nenhuma
 * senha passa pela plataforma — é a própria Meta que autentica.
 */
export const iniciarConexaoMeta = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string(), grupos: gruposEscopo }))
  .handler(async ({ data }) => {
    await exigirProjetos(data.projectId);
    const config = getMetaConfig();
    if (!config.habilitada || !config.appId || !config.redirectUri) {
      return {
        modo: "demonstracao" as const,
        erro: "A integração com a Meta ainda não foi configurada neste ambiente.",
      };
    }
    if (!config.chaveCriptografia) {
      return {
        modo: "demonstracao" as const,
        erro: "Defina SOCIAL_CRYPTO_KEY antes de conectar contas reais — o token precisa ser cifrado.",
      };
    }

    const escopos = montarEscopos(data.grupos as GrupoEscopo[]);
    const state = gerarState();
    registrarState({ state, projectId: data.projectId, escopos });

    return {
      modo: "oauth" as const,
      url: montarUrlAutorizacao({
        appId: config.appId,
        redirectUri: config.redirectUri,
        state,
        escopos,
        versaoGraph: config.versaoGraph,
      }),
    };
  });

/**
 * Passo 2: a Meta devolveu o `code`. Trocamos por um token de longa duração e
 * listamos as contas que a pessoa administra, para ela escolher quais conectar.
 *
 * Os tokens ficam no servidor: a interface recebe apenas nome, @ e rede.
 */
export const concluirConexaoMeta = createServerFn({ method: "POST" })
  .inputValidator(z.object({ code: z.string().min(1), state: z.string().min(1) }))
  .handler(async ({ data }) => {
    await exigirUsuario();
    const config = getMetaConfig();
    if (!config.habilitada || !config.appId || !config.appSecret || !config.redirectUri) {
      return { ok: false as const, erro: "A integração com a Meta não está configurada." };
    }

    const pedido = consumirState(data.state);
    if (!pedido) {
      return {
        ok: false as const,
        erro: "Este pedido de autorização expirou ou não foi reconhecido. Comece a conexão de novo.",
      };
    }

    const credenciaisMeta = {
      appId: config.appId,
      appSecret: config.appSecret,
      redirectUri: config.redirectUri,
      versaoGraph: config.versaoGraph,
    };

    try {
      const tokenCurto = await trocarCodigoPorToken(credenciaisMeta, data.code);
      const { token, expiraEm } = await obterTokenLongaDuracao(credenciaisMeta, tokenCurto);
      const contas = await descobrirContas(credenciaisMeta, token);

      if (contas.length === 0) {
        return {
          ok: false as const,
          erro:
            "Nenhuma Página encontrada nesta conta. O Instagram precisa ser profissional e estar " +
            "vinculado a uma Página do Facebook que você administre.",
        };
      }

      const db = getDb();
      const descobertaId = nextId("desc");
      guardarDescoberta({
        id: descobertaId,
        projectId: pedido.projectId,
        escopos: pedido.escopos,
        contas: contas.map((conta) => ({
          ...conta,
          // A validade do token de usuário acompanha as contas descobertas.
          accessToken: conta.accessToken,
        })),
      });

      return {
        ok: true as const,
        descobertaId,
        expiraEmSegundos: expiraEm,
        contas: contas.map((conta) => ({
          externalId: conta.externalId,
          networkId: conta.networkId,
          displayName: conta.displayName,
          handle: conta.handle,
          jaConectada: db.accounts.some(
            (existente) =>
              existente.externalId === conta.externalId && existente.projectId === pedido.projectId,
          ),
        })),
      };
    } catch (erro) {
      console.error("Falha ao concluir a conexão com a Meta:", erro);
      return { ok: false as const, erro: explicarErro(erro) };
    }
  });

/** Passo 3: grava as contas escolhidas e guarda cada token cifrado. */
export const conectarContasEscolhidas = createServerFn({ method: "POST" })
  .inputValidator(z.object({ descobertaId: z.string(), externalIds: z.array(z.string()).min(1) }))
  .handler(async ({ data }) => {
    await exigirUsuario();
    const descoberta = lerDescoberta(data.descobertaId);
    if (!descoberta) {
      return {
        ok: false as const,
        erro: "A escolha expirou. Refaça a conexão para listar as contas de novo.",
      };
    }

    const db = getDb();
    const agora = new Date();
    const conectadas: SocialAccount[] = [];

    for (const externalId of data.externalIds) {
      const conta = descoberta.contas.find((candidata) => candidata.externalId === externalId);
      if (!conta) continue;

      const jaExiste = db.accounts.find(
        (existente) =>
          existente.externalId === externalId && existente.projectId === descoberta.projectId,
      );

      const registro: SocialAccount = jaExiste ?? {
        id: nextId("acc"),
        projectId: descoberta.projectId,
        networkId: conta.networkId,
        handle: conta.handle,
        displayName: conta.displayName,
        status: "ativa",
        origem: "oauth",
        externalId,
        adAccountConnected: descoberta.escopos.includes("ads_management"),
        // Conta nova começa a acompanhar hoje; a sincronização traz o histórico
        // que a rede permitir e a curva cresce a partir daí.
        trackingSince: toDayKey(agora),
        tokenExpiresAt: toDayKey(new Date(agora.getTime() + 60 * 86400000)),
        lastSyncAt: null,
        messagingApproved: descoberta.escopos.includes("pages_messaging"),
        avatarGradient: "linear-gradient(135deg, oklch(0.62 0.2 40), oklch(0.4 0.18 300))",
      };

      // Reconexão: a conta volta a ficar ativa e mantém o histórico já guardado.
      registro.status = "ativa";
      registro.origem = "oauth";
      registro.handle = conta.handle;
      registro.displayName = conta.displayName;
      registro.tokenExpiresAt = toDayKey(new Date(agora.getTime() + 60 * 86400000));

      if (!jaExiste) {
        db.accounts.push(registro);
        db.metrics.set(registro.id, []);
        db.audience.set(registro.id, {
          available: false,
          unavailableReason:
            "Os dados de público aparecem depois da primeira sincronização com a rede.",
          newFollowers: 0,
          unfollows: 0,
          topInteractors: [],
          activityByHour: [],
          topCities: [],
          demografia: [],
        });
      }

      salvarCredencial({
        accountId: registro.id,
        externalId,
        instagramId: conta.instagramId,
        token: conta.accessToken,
        expiraEm: null,
        escopos: descoberta.escopos,
      });

      conectadas.push(registro);
    }

    descartarDescoberta(data.descobertaId);

    if (conectadas.length === 0) {
      return { ok: false as const, erro: "Nenhuma conta foi selecionada." };
    }
    return { ok: true as const, contas: conectadas };
  });

/**
 * Sincroniza uma conta conectada de verdade com a Graph API.
 *
 * Contas de demonstração não têm credencial e continuam com os dados semeados —
 * a tela avisa em vez de fingir que buscou.
 */
export const sincronizarContaReal = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ accountId: z.string(), dias: z.number().int().min(1).max(30).default(28) }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirConta(data.accountId);
    const config = getMetaConfig();
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    if (!temCredencial(account.id) || !config.habilitada || !config.appId || !config.appSecret) {
      return {
        ok: false as const,
        erro: "Esta conta não tem conexão real. Conecte pela Meta para sincronizar dados de verdade.",
      };
    }

    const credencial = lerCredencial(account.id)!;
    const token = revelarToken(account.id);
    if (!token) {
      return { ok: false as const, erro: "Credencial ausente; reconecte a conta." };
    }

    const ate = new Date();
    const desde = new Date(ate.getTime() - data.dias * 86400000);

    try {
      const metricas = await buscarInsights(
        {
          appId: config.appId,
          appSecret: config.appSecret,
          redirectUri: config.redirectUri!,
          versaoGraph: config.versaoGraph,
        },
        {
          externalId: credencial.externalId,
          instagramId: credencial.instagramId,
          accessToken: token,
        },
        { desde: toDayKey(desde), ate: toDayKey(ate) },
      );

      const gravados = mesclarMetricas(account.id, metricas);
      account.lastSyncAt = new Date().toISOString();
      account.status = "ativa";

      anotarDe(usuario, {
        acao: "sincronizacao_rede",
        projetoId: account.projectId,
        alvoId: account.id,
        alvoRotulo: rotuloDaConta(account.id),
        detalhes: { dias: gravados },
      });

      return { ok: true as const, dias: gravados, account };
    } catch (erro) {
      console.error(`Falha ao sincronizar ${account.id}:`, erro);
      // Token revogado é estado da conexão, não erro passageiro.
      account.status = String(erro).includes("190") ? "expirada" : account.status;
      return { ok: false as const, erro: explicarErro(erro) };
    }
  });

/** Desconectar remove a credencial, mas preserva o histórico já sincronizado. */
export const desconectarContaReal = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accountId: z.string() }))
  .handler(async ({ data }) => {
    const usuario = await exigirConta(data.accountId);
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    removerCredencial(account.id);
    account.status = "desconectada";
    account.tokenExpiresAt = null;

    anotarDe(usuario, {
      acao: "conta_desconectada",
      projetoId: account.projectId,
      alvoId: account.id,
      alvoRotulo: rotuloDaConta(account.id),
      detalhes: { credencial: "removida" },
    });

    return { ok: true as const, account };
  });

/**
 * Detalhe de uma publicação: a mídia, o resultado por conta, a curva dos
 * primeiros dias, os impulsionamentos e as interações que ela gerou.
 *
 * Reúne num só lugar o que hoje está espalhado entre listas — é a tela para
 * responder "por que este post foi bem?" sem trocar de aba.
 */
export const obterPublicacao = createServerFn({ method: "POST" })
  .inputValidator(z.object({ postId: z.string() }))
  .handler(async ({ data }) => {
    await exigirPublicacao(data.postId);
    const db = getDb();
    const post = db.posts.find((candidate) => candidate.id === data.postId);
    if (!post) return { ok: false as const };

    const contas = db.accounts.filter((account) => post.accountIds.includes(account.id));
    const autor = db.users.find((user) => user.id === post.createdBy) ?? null;
    const aprovador = post.approvedBy
      ? (db.users.find((user) => user.id === post.approvedBy) ?? null)
      : null;

    const porConta = dividirPorConta(post);

    // Linha do tempo do post: o que aconteceu, em ordem.
    const etapas: { rotulo: string; quando: string | null; concluida: boolean }[] = [
      { rotulo: "Criado", quando: null, concluida: true },
      {
        rotulo: post.requiresApproval ? "Aprovado" : "Aprovação dispensada",
        quando: null,
        concluida: post.approvedBy !== null || !post.requiresApproval,
      },
      {
        rotulo: post.scheduledFor ? "Agendado" : "Sem agendamento",
        quando: post.scheduledFor,
        concluida: Boolean(post.scheduledFor),
      },
      { rotulo: "Publicado", quando: post.publishedAt, concluida: post.status === "publicado" },
    ];

    const boosts = db.boosts.filter((boost) => boost.postId === post.id);

    return {
      ok: true as const,
      post,
      contas,
      autor,
      aprovador,
      itensMidia: itensDaMidia(post),
      porConta,
      curva: curvaDoPost(post, 10),
      interacoes: post.metrics ? totalDeInteracoes(post.metrics) : 0,
      taxaEngajamento: post.metrics ? taxaDeEngajamento(post.metrics) : 0,
      etapas,
      boosts,
      /** Comentários e mensagens que citam esta publicação (PRD 3.5). */
      inbox: db.inbox
        .filter((item) => item.postId === post.id)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
      capacidades: contas.map((conta) => ({
        accountId: conta.id,
        rede: NETWORKS[conta.networkId].label,
        limiteLegenda: NETWORKS[conta.networkId].captionMaxLength,
      })),
      /** Se a conta é real, os números vêm da rede; se não, são de demonstração. */
      dadosReais: contas.some((conta) => conta.origem === "oauth"),
      /** A publicação de onde este repost nasceu, quando for o caso. */
      original: post.republicadoDe
        ? (db.posts.find((candidate) => candidate.id === post.republicadoDe) ?? null)
        : null,
      /** Reposts já criados a partir desta publicação. */
      reposts: db.posts
        .filter((candidate) => candidate.republicadoDe === post.id)
        .sort(sortPostsByRecency),
    };
  });

// ---------------------------------------------------------------------------
// Windsor.ai — mídia paga real sem depender da revisão da Meta
// ---------------------------------------------------------------------------

const periodoWindsor = z
  .enum(["last_7d", "last_30d", "last_90d", "last_6m", "last_year", "last_2years"])
  .default("last_90d");

export const situacaoWindsor = createServerFn({ method: "POST" }).handler(async () => {
  const config = getWindsorConfig();
  return {
    habilitada: config.habilitada,
    conectores: Object.entries(CONECTORES_SOCIAIS).map(([id, meta]) => ({ id, ...meta })),
  };
});

/**
 * Campanhas reais de mídia paga, vindas do Windsor.
 *
 * Devolve o que o gestor olha primeiro — investido, alcance, CPM, CPC — sem
 * exigir que a plataforma tenha aprovação da Meta para anúncios.
 */
export const listarCampanhasWindsor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ conector: z.string().default("facebook"), periodo: periodoWindsor }))
  .handler(async ({ data }) => {
    await exigirUsuario();
    const config = getWindsorConfig();
    if (!config.habilitada || !config.apiKey) {
      return {
        ok: false as const,
        erro: "Defina WINDSOR_API_KEY para ler as contas conectadas no Windsor.ai.",
      };
    }

    try {
      const resultado = await buscarMidiaPaga(
        { apiKey: config.apiKey, baseUrl: config.baseUrl },
        data.conector,
        data.periodo,
      );

      return {
        ok: true as const,
        conector: data.conector,
        periodo: data.periodo,
        campanhas: resultado.campanhas.slice(0, 50),
        totais: resultado.totais,
        contasDeAnuncio: resultado.contasDeAnuncio,
        dias: resultado.dias,
      };
    } catch (erro) {
      console.error("Falha ao ler o Windsor.ai:", erro);
      return { ok: false as const, erro: explicarErroWindsor(erro) };
    }
  });

/**
 * Traz a mídia paga do Windsor para o histórico de uma conta da plataforma.
 *
 * Preenche apenas os campos pagos; o orgânico continua vindo da rede. Manter as
 * duas origens separadas é o que sustenta o comparativo do PRD 3.2.
 */
export const sincronizarPagoWindsor = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountId: z.string(),
      conector: z.string().default("facebook"),
      periodo: periodoWindsor,
    }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirConta(data.accountId);
    const config = getWindsorConfig();
    const db = getDb();
    const account = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!account) throw new Error("Conta não encontrada.");

    if (!config.habilitada || !config.apiKey) {
      return { ok: false as const, erro: "WINDSOR_API_KEY não está configurada." };
    }

    try {
      const { dias } = await buscarMidiaPaga(
        { apiKey: config.apiKey, baseUrl: config.baseUrl },
        data.conector,
        data.periodo,
      );

      if (dias.length === 0) {
        return {
          ok: false as const,
          erro: "O Windsor não devolveu veiculação neste período para o conector escolhido.",
        };
      }

      // Mescla preservando o orgânico já guardado em cada dia.
      const atuais = db.metrics.get(account.id) ?? [];
      const porData = new Map(atuais.map((dia) => [dia.date, dia]));

      for (const dia of dias) {
        const existente = porData.get(dia.date);
        if (existente) {
          existente.paidReach = dia.paidReach;
          existente.paidImpressions = dia.paidImpressions;
          existente.adSpend = dia.adSpend;
        } else {
          porData.set(dia.date, dia);
        }
      }

      db.metrics.set(
        account.id,
        [...porData.values()].sort((a, b) => a.date.localeCompare(b.date)),
      );
      account.lastSyncAt = new Date().toISOString();

      anotarDe(usuario, {
        acao: "sincronizacao_paga",
        projetoId: account.projectId,
        alvoId: account.id,
        alvoRotulo: rotuloDaConta(account.id),
        detalhes: { dias: dias.length, conector: data.conector },
      });

      return { ok: true as const, dias: dias.length, account };
    } catch (erro) {
      console.error(`Falha ao sincronizar ${account.id} pelo Windsor:`, erro);
      return { ok: false as const, erro: explicarErroWindsor(erro) };
    }
  });

// ---------------------------------------------------------------------------
// Atualização manual dos números
// ---------------------------------------------------------------------------

const valoresSchema = z.object({
  followers: z.number().int().min(0),
  organicReach: z.number().int().min(0),
  paidReach: z.number().int().min(0),
  organicImpressions: z.number().int().min(0),
  paidImpressions: z.number().int().min(0),
  organicEngagement: z.number().int().min(0),
  paidEngagement: z.number().int().min(0),
  adSpend: z.number().min(0),
});

/**
 * O que a tela de atualização precisa saber: contas do projeto, o que já foi
 * registrado hoje e onde os dados estão guardados.
 */
export const situacaoAtualizacao = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), date: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const hoje = data.date ?? toDayKey(new Date());

    const porConta = contas.map((conta) => {
      const registros = atualizacoesDoDia(db.atualizacoes, conta.id, hoje);
      const serie = db.metrics.get(conta.id) ?? [];
      const doDia = serie.find((dia) => dia.date === hoje);
      const ultimoDiaAnterior = serie.filter((dia) => dia.date < hoje).at(-1);

      return {
        accountId: conta.id,
        registros,
        progresso: progressoDoDia(registros),
        // Pré-preenche com o que já existe: quem atualiza três vezes por dia só
        // deve digitar o que mudou desde a leitura anterior.
        valores: doDia
          ? valoresDe(doDia)
          : ultimoDiaAnterior
            ? valoresDe(ultimoDiaAnterior)
            : VALORES_ZERADOS,
        temDoDia: Boolean(doDia),
      };
    });

    return {
      contas,
      date: hoje,
      porConta,
      destino: destinoDosDados(),
      totalRegistros: db.atualizacoes.length,
    };
  });

/**
 * Registra uma leitura manual.
 *
 * Grava o arquivo em seguida, porque a alternativa é o usuário digitar quinze
 * campos, fechar o navegador e perder tudo — o passo que ele esqueceria é
 * justamente o que não pode depender dele.
 */
export const registrarAtualizacao = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accountId: z.string(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD."),
      autor: z.string(),
      valores: valoresSchema,
    }),
  )
  .handler(async ({ data }) => {
    const usuario = await exigirConta(data.accountId);
    const db = getDb();
    const conta = db.accounts.find((candidate) => candidate.id === data.accountId);
    if (!conta) throw new Error("Conta não encontrada.");

    const anteriores = atualizacoesDoDia(db.atualizacoes, data.accountId, data.date);
    const anterior = anteriores.at(-1);

    const registro: AtualizacaoManual = {
      id: nextId("atual"),
      accountId: data.accountId,
      date: data.date,
      registradaEm: new Date().toISOString(),
      autor: data.autor,
      valores: data.valores,
    };

    db.atualizacoes.push(registro);
    db.metrics.set(
      data.accountId,
      aplicarValores(db.metrics.get(data.accountId) ?? [], data.date, data.valores),
    );
    conta.lastSyncAt = registro.registradaEm;

    anotarDe(usuario, {
      acao: "leitura_registrada",
      projetoId: conta.projectId,
      alvoId: conta.id,
      alvoRotulo: rotuloDaConta(conta.id),
      detalhes: {
        dia: data.date,
        seguidores: data.valores.followers,
        leituraDoDia: anteriores.length + 1,
      },
    });

    const gravacao = await persistir();

    return {
      registro,
      // O que mudou desde a leitura anterior do mesmo dia — é o que dá sentido
      // a atualizar mais de uma vez.
      variacoes: anterior ? variacaoEntre(anterior.valores, data.valores) : [],
      progresso: progressoDoDia([...anteriores, registro]),
      gravacao,
    };
  });

/** Devolve o arquivo inteiro para download — o que vai para o commit. */
export const exportarDados = createServerFn({ method: "POST" }).handler(async () => {
  const administrador = await exigirAdministrador();
  const db = getDb();

  // Exportar tira uma cópia de tudo da plataforma. Fica registrado por isso.
  anotarDe(administrador, {
    acao: "dados_exportados",
    detalhes: { contas: db.accounts.length, projetos: db.projects.length },
  });

  return { conteudo: serializar(db), nome: nomeDoArquivo() };
});

/** Carrega um arquivo enviado pela tela, substituindo o estado atual. */
export const importarDados = createServerFn({ method: "POST" })
  .inputValidator(z.object({ conteudo: z.string().min(1) }))
  .handler(async ({ data }) => {
    const administrador = await exigirAdministrador();
    try {
      const estado = desserializar(data.conteudo);
      substituirEstado(estado);

      anotarDe(administrador, {
        acao: "dados_importados",
        detalhes: { contas: estado.accounts.length, atualizacoes: estado.atualizacoes.length },
      });

      const gravacao = await persistir();
      return {
        ok: true as const,
        contas: estado.accounts.length,
        atualizacoes: estado.atualizacoes.length,
        gravacao,
      };
    } catch (erro) {
      return {
        ok: false as const,
        erro: erro instanceof Error ? erro.message : "Não foi possível ler o arquivo.",
      };
    }
  });

// ---------------------------------------------------------------------------
// Detalhamento de um dia (ou de um grupo de dias) por canal
// ---------------------------------------------------------------------------

/**
 * Abre um ponto do gráfico: o que cada canal fez naquele intervalo.
 *
 * O gráfico agrupa dias quando o período é longo, então a entrada é um
 * intervalo, não um dia. Com `inicio === fim` o resultado é o dia exato; com
 * uma faixa, cada canal vem somado dentro dela — que é o que a barra clicada
 * de fato representa.
 */
export const detalharPeriodo = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().optional(),
      inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const [inicio, fim] =
      data.inicio <= data.fim ? [data.inicio, data.fim] : [data.fim, data.inicio];
    const dentro = (date: string) => date >= inicio && date <= fim;

    const canais = contas
      .map((conta) => {
        const dias = (db.metrics.get(conta.id) ?? []).filter((dia) => dentro(dia.date));
        const soma = dias.reduce(
          (acumulado, dia) => ({
            organicReach: acumulado.organicReach + dia.organicReach,
            paidReach: acumulado.paidReach + dia.paidReach,
            organicImpressions: acumulado.organicImpressions + dia.organicImpressions,
            paidImpressions: acumulado.paidImpressions + dia.paidImpressions,
            organicEngagement: acumulado.organicEngagement + dia.organicEngagement,
            paidEngagement: acumulado.paidEngagement + dia.paidEngagement,
            adSpend: acumulado.adSpend + dia.adSpend,
            followersGained: acumulado.followersGained + dia.followersGained,
            followersLost: acumulado.followersLost + dia.followersLost,
          }),
          {
            organicReach: 0,
            paidReach: 0,
            organicImpressions: 0,
            paidImpressions: 0,
            organicEngagement: 0,
            paidEngagement: 0,
            adSpend: 0,
            followersGained: 0,
            followersLost: 0,
          },
        );

        const ultimo = dias.at(-1);
        const alcance = soma.organicReach + soma.paidReach;
        const engajamento = soma.organicEngagement + soma.paidEngagement;

        return {
          conta,
          /** Sem linha no intervalo, o canal aparece como "sem dado" em vez de zerado. */
          temDado: dias.length > 0,
          dias,
          soma: { ...soma, adSpend: Math.round(soma.adSpend * 100) / 100 },
          alcance,
          engajamento,
          /** Seguidores no fim do intervalo — é um estoque, não se soma. */
          followers: ultimo?.followers ?? null,
          taxaEngajamento: alcance > 0 ? engajamento / alcance : 0,
          publicacoes: db.posts
            .filter(
              (post) =>
                post.accountIds.includes(conta.id) &&
                post.publishedAt !== null &&
                dentro(post.publishedAt.slice(0, 10)),
            )
            .sort(sortPostsByRecency),
          impulsionamentos: db.boosts.filter(
            (boost) =>
              boost.accountId === conta.id && boost.startedAt <= fim && boost.endsAt >= inicio,
          ),
          interacoes: db.inbox.filter(
            (item) => item.accountId === conta.id && dentro(item.receivedAt.slice(0, 10)),
          ).length,
          /** Leituras manuais do intervalo — mostra de onde vieram os números. */
          leituras: db.atualizacoes
            .filter((registro) => registro.accountId === conta.id && dentro(registro.date))
            .sort((a, b) => a.registradaEm.localeCompare(b.registradaEm)),
        };
      })
      .sort((a, b) => b.alcance - a.alcance);

    const totais = canais.reduce(
      (acumulado, canal) => ({
        alcance: acumulado.alcance + canal.alcance,
        organico: acumulado.organico + canal.soma.organicReach,
        pago: acumulado.pago + canal.soma.paidReach,
        engajamento: acumulado.engajamento + canal.engajamento,
        investido: acumulado.investido + canal.soma.adSpend,
        publicacoes: acumulado.publicacoes + canal.publicacoes.length,
      }),
      { alcance: 0, organico: 0, pago: 0, engajamento: 0, investido: 0, publicacoes: 0 },
    );

    return {
      inicio,
      fim,
      canais,
      totais: { ...totais, investido: Math.round(totais.investido * 100) / 100 },
    };
  });

/**
 * O que a tela de entrada precisa saber antes de alguém digitar.
 *
 * Sem isto, a tela ficaria repetindo "entre com qualquer senha" mesmo em uma
 * instalação com banco, onde isso deixou de ser verdade — instrução errada na
 * primeira tela é o pior lugar para uma instrução errada.
 */
export const situacaoAcesso = createServerFn({ method: "POST" }).handler(async () => {
  const demonstracao = !usandoBanco();

  /**
   * Em demonstração, a tela mostra com quem dá para entrar.
   *
   * A lista sai dos dados carregados, e não de nomes escritos na tela. Já foi
   * escrita à mão uma vez: quando os dados passaram a ser os da campanha, a
   * tela continuou oferecendo quatro usuários que não existiam mais, e não
   * havia como entrar.
   *
   * **Só em demonstração.** Com banco configurado isto devolve lista vazia —
   * ali os e-mails são de gente de verdade, e uma tela de login que enumera
   * quem tem conta entrega metade da credencial a quem só passou por ela.
   */
  const usuarios = demonstracao
    ? getDb().users.map((usuario) => ({
        email: usuario.email,
        nome: usuario.name,
        papel: usuario.role,
      }))
    : [];

  return { demonstracao, usuarios };
});

// ---------------------------------------------------------------------------
// Histórico de uso
// ---------------------------------------------------------------------------

/**
 * O histórico de uso da plataforma — só para administrador.
 *
 * A restrição não é zelo excessivo: a lista diz de onde cada pessoa entrou e a
 * que horas, o que é dado sobre gente, não sobre campanha. Quem precisa dela
 * para prestar contas é quem responde pela conta.
 */
export const listarHistorico = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      usuarioId: z.string().optional(),
      acao: z.enum(ACOES_CONHECIDAS as [string, ...string[]]).optional(),
      area: z.string().optional(),
      projetoId: z.string().optional(),
      de: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      ate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      busca: z.string().optional(),
      limite: z.number().int().min(1).max(500).default(100),
      deslocamento: z.number().int().min(0).default(0),
    }),
  )
  .handler(async ({ data }) => {
    await exigirAdministrador();
    const db = getDb();

    const pagina = await consultar({
      ...data,
      acao: data.acao as AcaoHistorico | undefined,
    });

    return {
      ...pagina,
      // Para montar os filtros da tela sem uma segunda ida ao servidor.
      pessoas: db.users.map((usuario) => ({ id: usuario.id, nome: usuario.name })),
      projetos: db.projects.map((projeto) => ({ id: projeto.id, nome: projeto.name })),
    };
  });

/**
 * Quem usou a plataforma, e quanto, no período pedido.
 *
 * Responde a pergunta que a lista cronológica responde mal: "quem está
 * usando isto?". O resumo é calculado sobre o conjunto inteiro do período, não
 * sobre a página visível — um ranking de uma fatia arbitrária enganaria.
 */
export const resumoDeUso = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      de: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      ate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      projetoId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await exigirAdministrador();
    const eventos = await consultarTudo(data);
    return { pessoas: resumirPorPessoa(eventos), eventos: eventos.length };
  });

// ---------------------------------------------------------------------------
// Painel geral e recomendações
// ---------------------------------------------------------------------------

/**
 * O quadro de horários, mídia e público — o resumo que abre no Painel.
 *
 * Quatro perguntas que estavam em três telas diferentes, juntas num lugar:
 * **quando publicar**, **em que formato**, **para quem** e **quando o público
 * está na rede**. Cada uma leva à tela onde ela se aprofunda; o quadro não
 * repete a análise inteira, dá a conclusão e o caminho.
 *
 * A frase que compara campanha e público é o que faz o quadro valer mais que a
 * soma das partes: "a campanha rende de manhã, mas o público está na rede à
 * noite" é uma decisão esperando para ser tomada, e nenhum dos dois números
 * mostra isso sozinho.
 */
export const quadroDeHorarios = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), period: periodSchema }))
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const ids = new Set(contas.map((conta) => conta.id));
    const period = data.period as PeriodKey;

    // Mesmo recorte da tela de Conteúdo: pela data de publicação, para uma peça
    // de três meses atrás não entrar na média de "últimos 30 dias" só porque
    // ainda recebe curtida.
    const dias = PERIOD_DAYS[period];
    const limite = dias === null ? null : toDayKey(new Date(Date.now() - dias * 86400000));

    const posts = db.posts.filter(
      (post) =>
        post.accountIds.some((id) => ids.has(id)) &&
        post.status === "publicado" &&
        (limite === null || (post.publishedAt ?? "").slice(0, 10) >= limite),
    );
    const inbox = db.inbox.filter((item) => ids.has(item.accountId));
    const pecas = avaliarPecas(posts, inbox);

    const perfis = contas
      .map((conta) => db.audience.get(conta.id))
      .filter((perfil): perfil is AudienceInsight => Boolean(perfil));

    // A atividade do público é somada entre as contas: a pergunta é sobre o
    // público da campanha, não de um perfil isolado.
    const porHora = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      activity: perfis.reduce(
        (soma, perfil) =>
          soma + (perfil.activityByHour?.find((ponto) => ponto.hour === hour)?.activity ?? 0),
        0,
      ),
    }));

    const blocos = melhoresBlocos(pecas);
    const formatos = porFormato(pecas).filter((grupo) => grupo.pecas >= 3);
    const demografia = demografiaDoPublico(perfis);
    const pico = picoDoPublico(porHora);

    return {
      period,
      pecas: pecas.length,
      /** O melhor bloco do dia, e os dois seguintes. */
      melhoresBlocos: blocos,
      /** Os oito blocos, para o comparativo com a atividade do público. */
      blocosDoDia: blocosDoDia(pecas),
      /** O formato que mais rende, entre os que têm amostra. */
      melhorFormato: [...formatos].sort((a, b) => b.contraMedia - a.contraMedia)[0] ?? null,
      formatos,
      /** A atividade do público, bloco a bloco. */
      atividade: atividadePorBloco(porHora),
      pico,
      /** Quem é o público: fatia por gênero e a faixa dominante. */
      publico: {
        pessoas: demografia.pessoas,
        contas: demografia.contas,
        porGenero: demografia.porGenero,
        faixaDominante: demografia.faixaDominante,
      },
      /** A conclusão que sai de cruzar os dois lados. Nula sem os dois. */
      leitura: compararComOPublico(blocos[0], pico),
      horariosPorFormato: horariosPorFormato(pecas),
      /**
       * As peças reduzidas ao que o gráfico de barras precisa.
       *
       * Mandar as peças e montar as barras no navegador é deliberado: trocar o
       * eixo (horário ou dia), o recorte (mídia ou rede) e a métrica é um clique
       * que não deve custar uma ida ao servidor — senão ninguém experimenta os
       * cortes, e o gráfico deixa de ser exploração para ser figura.
       */
      noTempo: pecas
        .filter((peca) => peca.diaDaSemana !== null && peca.hora !== null)
        .map(
          (peca): PecaNoTempo => ({
            id: peca.post.id,
            dia: peca.diaDaSemana!,
            hora: peca.hora!,
            formato: peca.post.format,
            redes: [
              ...new Set(
                peca.post.accountIds
                  .map((id) => contas.find((conta) => conta.id === id)?.networkId)
                  .filter((rede): rede is NetworkId => Boolean(rede)),
              ),
            ],
            alcance: peca.alcance,
            interacoes: peca.interacoes,
            legenda: resumoDaLegenda(peca.post.caption),
            publicadoEm: peca.post.publishedAt ?? "",
            // O horário escrito vem daqui, já no fuso da campanha, e não do
            // navegador. Se a lista formatasse com o relógio de quem abriu a
            // tela, uma pessoa em outro fuso leria "12:06" embaixo da barra das
            // 9h — o gráfico e a lista discordando sobre a mesma peça.
            quando: peca.post.publishedAt ? aParede(peca.post.publishedAt) : "",
          }),
        ),
    };
  });

/**
 * O quadro completo: cada canal lado a lado, os totais e o que os números
 * sugerem fazer.
 *
 * O painel existente soma os canais e responde "como vamos?". Este compara os
 * canais entre si e responde "qual está puxando e qual está pesando?" — que é
 * a pergunta que leva a uma decisão sobre onde colocar esforço.
 */
export const obterPainelGeral = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), period: periodSchema }))
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const period = data.period as PeriodKey;

    const metricasPorConta = new Map(
      contas.map((conta) => [conta.id, db.metrics.get(conta.id) ?? []]),
    );
    const idsDasContas = new Set(contas.map((conta) => conta.id));

    const posts = db.posts.filter((post) => post.accountIds.some((id) => idsDasContas.has(id)));

    const pendentes = db.inbox.filter(
      (item) => item.status === "pendente" && idsDasContas.has(item.accountId),
    );
    // A mais antiga sem resposta: é dela que sai o "há quantas horas".
    const maisAntiga = pendentes.reduce<string | null>(
      (antiga, item) => (antiga === null || item.receivedAt < antiga ? item.receivedAt : antiga),
      null,
    );

    const canais = resumirCanais(contas, metricasPorConta, period);
    const consolidado = mergeSeries(
      contas.map((conta) => slicePeriod(metricasPorConta.get(conta.id) ?? [], period)),
    );

    const recomendacoes = recomendar({
      contas,
      metricasPorConta,
      posts,
      period,
      interacoesPendentes: pendentes.length,
      pendenteMaisAntigaEm: maisAntiga,
      agoraMs: Date.now(),
    });

    // Agrupamento por rede: uma campanha com três perfis no Instagram quer
    // saber como vai "o Instagram", não cada perfil isolado.
    const porRede = new Map<NetworkId, { alcance: number; seguidores: number; contas: number }>();
    for (const canal of canais) {
      const atual = porRede.get(canal.networkId) ?? { alcance: 0, seguidores: 0, contas: 0 };
      atual.alcance += canal.alcance;
      atual.seguidores += canal.seguidores;
      atual.contas += 1;
      porRede.set(canal.networkId, atual);
    }

    return {
      period,
      canais,
      redes: [...porRede.entries()]
        .map(([networkId, dados]) => ({ networkId, ...dados }))
        .sort((a, b) => b.alcance - a.alcance),
      totais: summarize(consolidado, period),
      split: splitOrganicPaid(consolidado),
      serie: buildSeries(consolidado),
      recomendacoes,
      publicacoesNoPeriodo: posts.filter((post) => post.status === "publicado").length,
      interacoesPendentes: pendentes.length,
    };
  });

/**
 * O relatório em PDF, pronto para baixar.
 *
 * Gerado no servidor, onde os números já estão, e devolvido em base64 para a
 * tela montar o arquivo. O gerador em si é um módulo puro — roda igual aqui e
 * no navegador —, o que mantém o HTML único da demonstração capaz de produzir
 * o mesmo documento sem servidor nenhum.
 */
export const gerarPdfDoRelatorio = createServerFn({ method: "POST" })
  .inputValidator(z.object({ reportId: z.string() }))
  .handler(async ({ data }) => {
    const usuario = await exigirRelatorio(data.reportId);
    const db = getDb();

    const report = db.reports.find((candidato) => candidato.id === data.reportId)!;
    const projeto = db.projects.find((candidato) => candidato.id === report.projectId);
    const contas = db.accounts.filter((conta) => report.accountIds.includes(conta.id));

    // O recorte é o período gravado no relatório, não um período qualquer: é o
    // que faz o PDF de hoje continuar dizendo o mesmo daqui a um mês.
    const doPeriodo = (accountId: string) =>
      (db.metrics.get(accountId) ?? []).filter(
        (dia) => dia.date >= report.periodStart && dia.date <= report.periodEnd,
      );

    const metricasPorConta = new Map(contas.map((conta) => [conta.id, doPeriodo(conta.id)]));
    const consolidado = mergeSeries(contas.map((conta) => doPeriodo(conta.id)));
    const idsDasContas = new Set(contas.map((conta) => conta.id));

    const posts = db.posts.filter(
      (post) =>
        post.accountIds.some((id) => idsDasContas.has(id)) &&
        post.publishedAt !== null &&
        post.publishedAt.slice(0, 10) >= report.periodStart &&
        post.publishedAt.slice(0, 10) <= report.periodEnd,
    );

    const pendentes = db.inbox.filter(
      (item) => item.status === "pendente" && idsDasContas.has(item.accountId),
    );

    const temLeituraManual = db.atualizacoes.some((registro) =>
      idsDasContas.has(registro.accountId),
    );
    const temSincronizacao = contas.some((conta) => conta.origem === "oauth");
    const origens = [
      temLeituraManual ? "leitura manual" : null,
      temSincronizacao ? "API da rede" : null,
    ].filter(Boolean);

    const bytes = gerarRelatorioPdf({
      titulo: report.title,
      projeto: projeto?.name ?? "Projeto",
      cliente: projeto?.client ?? "",
      periodoInicio: report.periodStart,
      periodoFim: report.periodEnd,
      geradoEm: new Date(),
      geradoPor: usuario.name,
      resumo: summarize(consolidado, "tudo"),
      split: splitOrganicPaid(consolidado),
      canais: resumirCanais(contas, metricasPorConta, "tudo"),
      serie: consolidado,
      recomendacoes: recomendar({
        contas,
        metricasPorConta,
        posts,
        period: "tudo",
        interacoesPendentes: pendentes.length,
        pendenteMaisAntigaEm: pendentes.reduce<string | null>(
          (antiga, item) =>
            antiga === null || item.receivedAt < antiga ? item.receivedAt : antiga,
          null,
        ),
        agoraMs: Date.now(),
      }),
      publicacoes: posts.length,
      origemDosDados: origens.length > 0 ? origens.join(" e ") : "dados de demonstração",
    });

    return {
      base64: paraBase64(bytes),
      nome: `${nomeDeArquivo(report.title)}-${report.periodEnd}.pdf`,
      bytes: bytes.length,
    };
  });

/** Um título vira nome de arquivo: sem acento, sem espaço, sem surpresa. */
function nomeDeArquivo(titulo: string): string {
  return (
    titulo
      .normalize("NFD")
      // A faixa dos acentos combinantes, escrita por código: um intervalo com
      // os caracteres literais é invisível no editor e some numa cópia
      // desatenta.
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "relatorio"
  );
}

// ---------------------------------------------------------------------------
// Importação de histórico por planilha
// ---------------------------------------------------------------------------

const arquivoSchema = z.object({
  accountId: z.string(),
  // Um ano de histórico diário em CSV fica na casa das dezenas de kB; o teto
  // existe para uma planilha errada não virar uma requisição de 50 MB.
  conteudo: z.string().min(1).max(4_000_000),
});

/**
 * Lê a planilha e devolve o que *seria* gravado, sem gravar nada.
 *
 * A conferência antes da gravação não é cerimônia: importar sobrescreve dias e
 * pode deslocar um histórico inteiro se a data vier em outra ordem. Mostrar o
 * plano é o que transforma um erro irreversível em uma pergunta.
 */
export const conferirImportacao = createServerFn({ method: "POST" })
  .inputValidator(arquivoSchema)
  .handler(async ({ data }) => {
    await exigirConta(data.accountId);
    const db = getDb();
    const existentes = (db.metrics.get(data.accountId) ?? []).map((dia) => dia.date);

    const plano = montarPlano(data.conteudo, existentes);

    return {
      plano,
      // Uma amostra do que vai entrar, para conferir de olho antes de mandar.
      amostra: plano.linhas.slice(0, 8),
    };
  });

/**
 * Grava o histórico da planilha.
 *
 * O arquivo é lido de novo aqui em vez de receber o plano pronto do navegador:
 * um plano que chega pela requisição é um plano que pode ter sido editado no
 * caminho, e este é o ponto em que dado do cliente é reescrito em massa.
 */
export const importarHistorico = createServerFn({ method: "POST" })
  .inputValidator(arquivoSchema.extend({ nomeDoArquivo: z.string().max(200).default("planilha") }))
  .handler(async ({ data }) => {
    const usuario = await exigirConta(data.accountId);
    const db = getDb();
    const conta = db.accounts.find((candidata) => candidata.id === data.accountId)!;

    const existentes = (db.metrics.get(data.accountId) ?? []).map((dia) => dia.date);
    const plano = montarPlano(data.conteudo, existentes);

    if (!plano.utilizavel) {
      return { ok: false as const, plano, erro: "A planilha não tem o mínimo para ser importada." };
    }

    db.metrics.set(data.accountId, aplicarPlano(db.metrics.get(data.accountId) ?? [], plano));

    // Um registro por dia importado, para a pergunta "de onde veio este número?"
    // continuar tendo resposta depois — a mesma que a leitura manual dá.
    const agora = new Date().toISOString();
    const autor = `${usuario.name} (planilha: ${data.nomeDoArquivo})`;
    for (const linha of plano.linhas) {
      db.atualizacoes.push({
        id: nextId("atual"),
        accountId: data.accountId,
        date: linha.date,
        registradaEm: agora,
        autor,
        valores: linha.valores,
      });
    }

    conta.lastSyncAt = agora;
    // O acompanhamento passa a começar no dia mais antigo importado, se ele for
    // anterior ao que estava registrado — senão a curva começaria depois do
    // próprio histórico.
    if (plano.primeiroDia && plano.primeiroDia < conta.trackingSince) {
      conta.trackingSince = plano.primeiroDia;
    }

    anotarDe(usuario, {
      acao: "historico_importado",
      projetoId: conta.projectId,
      alvoId: conta.id,
      alvoRotulo: rotuloDaConta(conta.id),
      detalhes: {
        arquivo: data.nomeDoArquivo,
        dias: plano.linhas.length,
        reescritos: plano.conflitos.length,
        periodo: `${plano.primeiroDia} a ${plano.ultimoDia}`,
      },
    });

    const gravacao = await persistir();
    return { ok: true as const, plano, gravacao };
  });

/**
 * Tudo de uma rede social específica.
 *
 * É o segundo nível do painel: o cartão da rede leva até aqui, e daqui cada
 * perfil leva ao próprio detalhe. Três níveis, cada um respondendo uma pergunta
 * mais estreita que o anterior.
 */
export const obterRede = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      networkId: z.enum(NETWORK_IDS as [NetworkId, ...NetworkId[]]),
      projectId: z.string().optional(),
      period: periodSchema,
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const permitidas = await contasPermitidas(data.projectId);
    const contas = permitidas.filter((conta) => conta.networkId === data.networkId);
    const period = data.period as PeriodKey;

    const metricasPorConta = new Map(
      contas.map((conta) => [conta.id, db.metrics.get(conta.id) ?? []]),
    );
    const juntas = mergeSeries(
      contas.map((conta) => slicePeriod(metricasPorConta.get(conta.id) ?? [], period)),
    );
    const idsDaRede = new Set(contas.map((conta) => conta.id));

    const posts = db.posts
      .filter((post) => post.accountIds.some((id) => idsDaRede.has(id)))
      .sort(sortPostsByRecency);

    const pendentes = db.inbox.filter(
      (item) => item.status === "pendente" && idsDaRede.has(item.accountId),
    );

    return {
      networkId: data.networkId as NetworkId,
      period,
      contas: contas.map((conta) => accountSummary(conta, period)),
      canais: resumirCanais(contas, metricasPorConta, period),
      resumo: summarize(juntas, "tudo"),
      split: splitOrganicPaid(juntas),
      serie: buildSeries(juntas),
      publicadas: posts.filter((post) => post.status === "publicado").slice(0, 6),
      naFila: posts.filter(
        (post) => post.status === "agendado" || post.status === "aguardando_aprovacao",
      ).length,
      impulsionamentos: db.boosts.filter((boost) => idsDaRede.has(boost.accountId)).length,
      pendentes: pendentes.length,
      // As recomendações desta rede só: no detalhe, conselho sobre outra rede
      // seria ruído.
      recomendacoes: recomendar({
        contas,
        metricasPorConta,
        posts,
        period,
        interacoesPendentes: pendentes.length,
        pendenteMaisAntigaEm: pendentes.reduce<string | null>(
          (antiga, item) =>
            antiga === null || item.receivedAt < antiga ? item.receivedAt : antiga,
          null,
        ),
        agoraMs: Date.now(),
      }),
    };
  });

// ---------------------------------------------------------------------------
// Conteúdo e público
// ---------------------------------------------------------------------------

/** O que rendeu, o que não rendeu, e o que os dois têm em comum. */
export const analisarConteudo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), period: periodSchema }))
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const ids = new Set(contas.map((conta) => conta.id));
    const dias = PERIOD_DAYS[data.period as PeriodKey];

    // O recorte é pela data de publicação: uma peça de três meses atrás não
    // deve entrar na média de "últimos 30 dias" só porque ainda recebe curtida.
    const limite = dias === null ? null : toDayKey(new Date(Date.now() - dias * 86400000));

    const posts = db.posts.filter(
      (post) =>
        post.accountIds.some((id) => ids.has(id)) &&
        post.status === "publicado" &&
        (limite === null || (post.publishedAt ?? "").slice(0, 10) >= limite),
    );
    const inbox = db.inbox.filter((item) => ids.has(item.accountId));

    const pecas = avaliarPecas(posts, inbox);

    return {
      period: data.period as PeriodKey,
      pecas,
      porFormato: porFormato(pecas),
      porAssunto: porAssunto(pecas),
      porDiaDaSemana: porDiaDaSemana(pecas),
      porFaixaDeHorario: porFaixaDeHorario(pecas),
      destaques: destaques(pecas),
      // Quando publicar: o mapa dia × faixa, o ranking geral e o mesmo recorte
      // por tipo de conteúdo. Calculado aqui, junto do resto da análise, porque
      // depende exatamente das mesmas peças já avaliadas.
      horarios: {
        mapa: mapaDeHorarios(pecas),
        melhoresCasas: melhoresHorarios(pecas),
        melhoresBlocos: melhoresBlocos(pecas),
        porFormato: horariosPorFormato(pecas),
      },
      contas,
    };
  });

/**
 * Quem é o público e onde ele está.
 *
 * Cada bloco carrega a origem do número, e a tela mostra isso junto. É o que
 * separa "chegamos a 4.200 pessoas em Recife, porque foi para lá que o anúncio
 * foi contratado" de "estimamos que 18% do seu público seja de Recife, segundo
 * a rede" — os dois aparecem, mas ninguém os confunde.
 */
export const analisarPublico = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), period: periodSchema }))
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const ids = new Set(contas.map((conta) => conta.id));
    const period = data.period as PeriodKey;

    const inbox = db.inbox.filter((item) => ids.has(item.accountId));
    const impulsionamentos = db.boosts.filter((boost) => ids.has(boost.accountId));

    const seguidoresTotais = contas.reduce((soma, conta) => {
      const historico = slicePeriod(db.metrics.get(conta.id) ?? [], period);
      return soma + (historico[historico.length - 1]?.followers ?? 0);
    }, 0);

    const perfis = contas
      .map((conta) => db.audience.get(conta.id))
      .filter((perfil): perfil is AudienceInsight => Boolean(perfil));

    return {
      period,
      cidades: cidadesAlcancadas(impulsionamentos, perfis, seguidoresTotais),
      perfil: perfilDoPublico(inbox),
      demografia: demografiaDoPublico(perfis),
      seguidoresTotais,
      // Quais redes de fato reportam perfil de público — o resto da tela
      // depende disso para não prometer o que não tem.
      redesComPerfil: contas
        .filter((conta) => db.audience.get(conta.id)?.available)
        .map((conta) => conta.networkId),
      redesSemPerfil: [
        ...new Set(
          contas
            .filter((conta) => !db.audience.get(conta.id)?.available)
            .map((conta) => conta.networkId),
        ),
      ],
    };
  });

/**
 * Uma cidade por dentro: o que foi entregue lá e por qual peça.
 *
 * É a rastreabilidade do lado do público — da cidade até a publicação que
 * chegou nela, e não só até o número.
 */
export const detalharCidade = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cidade: z.string().min(1), projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const ids = new Set(contas.map((conta) => conta.id));

    const impulsionamentos = db.boosts.filter(
      (boost) =>
        ids.has(boost.accountId) &&
        boost.audience.locations.some(
          (local) => normalizarCidade(local) === normalizarCidade(data.cidade),
        ),
    );

    const seguidoresTotais = contas.reduce((soma, conta) => {
      const historico = db.metrics.get(conta.id) ?? [];
      return soma + (historico[historico.length - 1]?.followers ?? 0);
    }, 0);

    const perfis = contas
      .map((conta) => db.audience.get(conta.id))
      .filter((perfil): perfil is AudienceInsight => Boolean(perfil));

    const cidade = cidadesAlcancadas(impulsionamentos, perfis, seguidoresTotais).find(
      (item) => normalizarCidade(item.cidade) === normalizarCidade(data.cidade),
    );

    // As peças entregues ali, com o que cada uma é — formato, dia, números.
    const publicacoes = impulsionamentos
      .map((boost) => {
        const post = db.posts.find((candidato) => candidato.id === boost.postId);
        const conta = db.accounts.find((candidata) => candidata.id === boost.accountId);
        return post && conta ? { post, boost, conta } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return { cidade: cidade ?? null, publicacoes, nome: normalizarCidade(data.cidade) };
  });

/**
 * O mapa do estado de São Paulo e a cobertura da campanha nele.
 *
 * Cruza os 645 municípios da matriz do IPS com a segmentação dos anúncios. O
 * alcance por município vem do contrato do anúncio — é o dado firme —, e o que
 * ficou sem entrega aparece como vazio no mapa, que é a informação que leva a
 * mudar a segmentação.
 */
export const obterMapaSP = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().optional(),
      /** Quantos do topo do ranking contam como prioritários. */
      prioritarios: z.number().int().min(5).max(200).default(50),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const ids = new Set(contas.map((conta) => conta.id));

    const impulsionamentos = db.boosts.filter((boost) => ids.has(boost.accountId));
    const pontos = montarMapa(impulsionamentos);

    return {
      pontos,
      cobertura: medirCobertura(pontos, data.prioritarios),
      // Segmentações que não casaram com nenhum município do estado: é o que
      // explica um alcance que existe na campanha e não aparece no mapa.
      foraDoEstado: [
        ...new Set(
          impulsionamentos.flatMap((boost) =>
            boost.audience.locations.filter((local) => !acharMunicipio(local)),
          ),
        ),
      ],
    };
  });

/**
 * Tudo o que a plataforma sabe sobre um município.
 *
 * Existe separada de `obterMapaSP` porque é o oposto dela: o mapa precisa de
 * pouco sobre 645 municípios, e isto precisa de muito sobre um. Juntar as duas
 * mandaria a peça, o impulsionamento e o vizinho de cada município do estado
 * para o navegador toda vez que alguém abrisse a tela.
 */
export const detalharMunicipio = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().optional(),
      codigo: z.string(),
      prioritarios: z.number().int().min(5).max(200).default(50),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const ids = new Set(contas.map((conta) => conta.id));

    const impulsionamentos = db.boosts.filter((boost) => ids.has(boost.accountId));
    const pontos = montarMapa(impulsionamentos);
    const ponto = pontos.find((candidato) => candidato.municipio.codigo === data.codigo);
    if (!ponto) throw new Error("Município não encontrado.");

    // Os anúncios que miraram este município, com a fatia que coube a ele.
    const entregas = impulsionamentos
      .map((boost) => {
        const alvos = boost.audience.locations
          .map((local) => acharMunicipio(local))
          .filter((municipio): municipio is NonNullable<typeof municipio> => municipio !== null);
        if (!alvos.some((alvo) => alvo.codigo === data.codigo)) return null;

        const fatia = 1 / alvos.length;
        const post = db.posts.find((candidato) => candidato.id === boost.postId);

        return {
          boostId: boost.id,
          objetivo: boost.objective,
          status: boost.status,
          comecouEm: boost.startedAt,
          terminaEm: boost.endsAt,
          /** Quantas cidades dividiram este anúncio — muda como ler o número. */
          cidadesNoAnuncio: alvos.length,
          outrasCidades: alvos
            .filter((alvo) => alvo.codigo !== data.codigo)
            .map((alvo) => alvo.nome),
          alcance: Math.round(boost.results.reach * fatia),
          investido: Math.round(boost.results.spend * fatia * 100) / 100,
          peca: post ? resumirPeca(post, contas) : null,
        };
      })
      .filter((entrega): entrega is NonNullable<typeof entrega> => entrega !== null)
      .sort((a, b) => b.alcance - a.alcance);

    const prioritarios = pontos
      .filter((candidato) => candidato.municipio.posicao !== null)
      .sort((a, b) => (a.municipio.posicao ?? 0) - (b.municipio.posicao ?? 0))
      .slice(0, data.prioritarios);
    const ehPrioritario = prioritarios.some(
      (candidato) => candidato.municipio.codigo === data.codigo,
    );

    /**
     * Os vizinhos, pela distância entre as sedes.
     *
     * Serve à decisão seguinte à leitura do mapa: se aqui deu certo, o vizinho
     * é o próximo candidato natural — e saber se ele já recebeu entrega evita
     * repetir onde já se está.
     */
    const vizinhos = pontos
      .filter((candidato) => candidato.municipio.codigo !== data.codigo)
      .map((candidato) => ({
        candidato,
        distancia: Math.hypot(
          candidato.municipio.lat - ponto.municipio.lat,
          candidato.municipio.lon - ponto.municipio.lon,
        ),
      }))
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, 6)
      .map(({ candidato }) => ({
        codigo: candidato.municipio.codigo,
        nome: candidato.municipio.nome,
        populacao: candidato.municipio.populacao,
        posicao: candidato.municipio.posicao,
        alcance: candidato.alcance,
      }));

    return {
      ponto,
      entregas,
      vizinhos,
      ehPrioritario,
      /**
       * Alcance sobre a população do município.
       *
       * Nulo quando a população não está na matriz. É a razão que diz se o
       * investimento foi denso ou espalhado: 5.000 pessoas em Vinhedo é outra
       * coisa que 5.000 em Guarulhos.
       */
      penetracao:
        ponto.municipio.populacao && ponto.municipio.populacao > 0
          ? ponto.alcance / ponto.municipio.populacao
          : null,
    };
  });

// ---------------------------------------------------------------------------
// Agenda: eventos, produção e publicação
// ---------------------------------------------------------------------------

/**
 * Quem enxerga a peça.
 *
 * A regra normal é por conta de rede: quem não pode ver o Instagram da campanha
 * não vê o que sai nele. A pauta recém-nascida da agenda ainda não escolheu
 * canal nenhum, e por isso cairia fora de todo filtro — sumindo justamente da
 * tela onde alguém precisa decidir o que ela vai ser. Sem conta, a permissão
 * que vale é a do projeto.
 */
function vePeca(post: Post, idsDeConta: Set<string>, projetos: string[]): boolean {
  if (post.accountIds.length === 0) return projetos.includes(post.projectId);
  return post.accountIds.some((id) => idsDeConta.has(id));
}

/**
 * Transforma compromissos da agenda em pautas no quadro.
 *
 * Devolve as peças criadas. Idempotente por `origemEventoId`: rodar de novo
 * sobre a mesma agenda não cria nada — o que importa porque o Google exporta o
 * calendário inteiro toda vez, e a importação chama esta função sempre.
 *
 * A pauta nasce **sem formato e sem conta**. É deliberado: as duas coisas são
 * decisão de quem vai produzir, e preenchê-las por conta própria transformaria
 * um palpite da plataforma em algo que parece escolha de alguém.
 */
function gerarPautas(eventos: Evento[], criadoPor: string): Post[] {
  const db = getDb();
  const pendentes = eventosSemPauta(eventos, db.posts);

  const novas = pendentes.map((evento): Post => {
    const pauta: Post = {
      id: nextId("post"),
      projectId: evento.projectId,
      accountIds: [],
      format: "a_definir",
      caption: pautaDoEvento(evento),
      media: { count: 1, aspectRatio: "4:5", fileSizeMb: 0 },
      status: "ideia",
      scheduledFor: evento.comecaEm,
      publishedAt: null,
      createdBy: criadoPor,
      approvedBy: null,
      requiresApproval: true,
      metrics: null,
      coverGradient: "linear-gradient(135deg, oklch(0.62 0.19 10), oklch(0.4 0.16 300))",
      origemEventoId: evento.id,
    };

    // O vínculo vale nos dois sentidos: o evento lista suas peças, e a peça
    // sabe de onde veio. Sem o primeiro, a tela do evento abriria vazia.
    evento.postIds = [...new Set([...evento.postIds, pauta.id])];
    return pauta;
  });

  db.posts.unshift(...novas);
  return novas;
}

/**
 * Tudo o que a agenda mostra, para o projeto e o período pedidos.
 *
 * Devolve peças e eventos crus, e não já agrupados por dia. O agrupamento é
 * puro e roda no navegador — assim trocar de mês, de semana ou de visão não
 * custa uma ida ao servidor, que é o que faria o calendário parecer pesado.
 */
export const listarAgenda = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const { projetos } = await exigirProjetos(data.projectId);
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const idsDeConta = new Set(contas.map((conta) => conta.id));

    return {
      eventos: db.eventos
        .filter((evento) => projetos.includes(evento.projectId))
        .sort((a, b) => a.comecaEm.localeCompare(b.comecaEm)),
      // A pauta nascida da agenda ainda não escolheu canal — filtrar só por
      // conta a deixaria invisível justamente na tela onde ela precisa
      // aparecer. Sem conta, quem manda é o projeto.
      posts: db.posts.filter((post) => vePeca(post, idsDeConta, projetos)).sort(sortPostsByRecency),
      contas,
      users: db.users,
    };
  });

const eventoSchema = z.object({
  projectId: z.string(),
  titulo: z.string().min(1).max(200),
  descricao: z.string().max(2000).nullable(),
  tipo: z.enum(["agenda", "gravacao", "prazo", "interno"]),
  comecaEm: z.string(),
  terminaEm: z.string().nullable(),
  diaInteiro: z.boolean(),
  local: z.string().max(200).nullable(),
  responsavel: z.string().nullable(),
});

/**
 * Cria ou atualiza um compromisso.
 *
 * O município não é informado por quem digita: sai do texto do local, pelo
 * mesmo casamento de nomes que o mapa usa. Pedir o código do IBGE a quem está
 * marcando uma caminhada seria transferir para a pessoa um trabalho que a
 * plataforma já sabe fazer — e ela erraria mais.
 */
export const salvarEvento = createServerFn({ method: "POST" })
  .inputValidator(eventoSchema.extend({ id: z.string().optional() }))
  .handler(async ({ data }) => {
    const { usuario, projetos } = await exigirProjetos(data.projectId);
    if (!projetos.includes(data.projectId)) throw new Error("Projeto não encontrado.");

    const db = getDb();
    const municipio = data.local ? acharMunicipio(data.local) : null;
    const existente = data.id ? db.eventos.find((evento) => evento.id === data.id) : undefined;

    if (existente) {
      Object.assign(existente, {
        titulo: data.titulo,
        descricao: data.descricao,
        tipo: data.tipo,
        comecaEm: data.comecaEm,
        terminaEm: data.terminaEm,
        diaInteiro: data.diaInteiro,
        local: data.local,
        municipioCodigo: municipio?.codigo ?? null,
        responsavel: data.responsavel,
      });
      anotarDe(usuario, { acao: "evento_editado", alvoRotulo: data.titulo });
      await persistir();
      return { evento: existente };
    }

    const evento: Evento = {
      id: nextId("evento"),
      projectId: data.projectId,
      titulo: data.titulo,
      descricao: data.descricao,
      tipo: data.tipo,
      comecaEm: data.comecaEm,
      terminaEm: data.terminaEm,
      diaInteiro: data.diaInteiro,
      local: data.local,
      municipioCodigo: municipio?.codigo ?? null,
      responsavel: data.responsavel,
      postIds: [],
      origem: "manual",
      criadoPor: usuario.id,
      criadoEm: new Date().toISOString(),
    };

    db.eventos.push(evento);
    // O compromisso já entra no quadro como pauta. É o que o evento é para quem
    // faz conteúdo: uma coisa que vai acontecer e da qual vai sair material.
    const pautas = gerarPautas([evento], usuario.id);
    anotarDe(usuario, { acao: "evento_criado", alvoRotulo: data.titulo });
    await persistir();
    return { evento, pautasCriadas: pautas.length };
  });

export const removerEvento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const evento = db.eventos.find((candidato) => candidato.id === data.id);
    if (!evento) throw new Error("Evento não encontrado.");
    const { usuario } = await exigirProjetos(evento.projectId);

    db.eventos = db.eventos.filter((candidato) => candidato.id !== data.id);
    anotarDe(usuario, { acao: "evento_removido", alvoRotulo: evento.titulo });
    await persistir();
    return { ok: true as const };
  });

/**
 * Um compromisso e tudo o que gira em volta dele.
 *
 * É a tela para onde vai quem clica num evento do calendário. Reúne o que
 * estava espalhado: o compromisso em si, o município que o mapa reconheceu, as
 * pautas que nasceram dele e as peças que alguém vinculou depois à mão.
 */
export const detalharEvento = createServerFn({ method: "POST" })
  .inputValidator(z.object({ eventoId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const evento = db.eventos.find((candidato) => candidato.id === data.eventoId);
    if (!evento) throw new Error("Compromisso não encontrado.");

    const { projetos } = await exigirProjetos(evento.projectId);
    if (!projetos.includes(evento.projectId)) throw new Error("Compromisso não encontrado.");

    const vinculadas = new Set(evento.postIds);
    const pecas = db.posts.filter(
      (post) => post.origemEventoId === evento.id || vinculadas.has(post.id),
    );

    const municipio = evento.municipioCodigo
      ? (MUNICIPIOS_SP.find((cidade) => cidade.codigo === evento.municipioCodigo) ?? null)
      : null;

    const contas = await contasPermitidas(evento.projectId);

    return {
      evento,
      pecas: pecas.sort(sortPostsByRecency),
      municipio: municipio && { codigo: municipio.codigo, nome: municipio.nome },
      contas,
      users: db.users,
    };
  });

/** Liga (ou desliga) uma peça de conteúdo a um compromisso. */
export const vincularPeca = createServerFn({ method: "POST" })
  .inputValidator(z.object({ eventoId: z.string(), postId: z.string(), vincular: z.boolean() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const evento = db.eventos.find((candidato) => candidato.id === data.eventoId);
    if (!evento) throw new Error("Evento não encontrado.");
    const { usuario } = await exigirProjetos(evento.projectId);

    evento.postIds = data.vincular
      ? [...new Set([...evento.postIds, data.postId])]
      : evento.postIds.filter((id) => id !== data.postId);

    anotarDe(usuario, { acao: "evento_editado", alvoRotulo: evento.titulo });
    await persistir();
    return { evento };
  });

/**
 * Move uma peça de fase no quadro.
 *
 * A transição é validada no servidor, e não só na tela: arrastar é um gesto
 * fácil de fazer sem querer, e "publicado" é um estado de que não se volta.
 */
export const moverPecaDeFase = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      fase: z.enum([
        "ideia",
        "rascunho",
        "aguardando_aprovacao",
        "aprovado",
        "agendado",
        "publicado",
      ]),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const post = db.posts.find((candidato) => candidato.id === data.postId);
    if (!post) throw new Error("Publicação não encontrada.");
    const usuario = await exigirContas(post.accountIds);

    if (!podeMoverPara(post.status, data.fase)) {
      return {
        ok: false as const,
        erro: `Uma peça em "${FASE_LABELS[post.status]}" não vai direto para "${FASE_LABELS[data.fase]}".`,
      };
    }

    // Pauta sem formato não avança. A validação da rede pegaria isso na hora de
    // publicar; recusar aqui é recusar no momento em que dá para resolver.
    const pendencia = motivoParaNaoAvancar(post, data.fase);
    if (pendencia) return { ok: false as const, erro: pendencia };

    // Publicar pelo quadro exige a mesma permissão que publicar pela tela de
    // publicação. Um atalho que ignora a regra é a regra deixando de existir.
    if (data.fase === "publicado" && !can(usuario.role, "publicar_direto")) {
      return {
        ok: false as const,
        erro: "Seu papel não publica direto. Mova para aprovação e peça a alguém que aprove.",
      };
    }

    post.status = data.fase;
    if (data.fase === "publicado") post.publishedAt = new Date().toISOString();
    if (data.fase === "aprovado") post.approvedBy = usuario.id;

    anotarDe(usuario, { acao: "publicacao_movida", alvoRotulo: FASE_LABELS[data.fase] });
    await persistir();
    return { ok: true as const, post };
  });

/**
 * Lê um arquivo `.ics` e diz o que aconteceria — sem gravar nada.
 *
 * Importar agenda por cima de agenda é o tipo de operação que ninguém quer
 * descobrir depois. Por isso são duas chamadas: esta mostra o plano, e
 * `aplicarAgendaIcs` executa o mesmo plano depois que a pessoa olhou.
 */
export const lerAgendaIcs = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string(), conteudo: z.string().max(4_000_000) }))
  .handler(async ({ data }) => {
    const { usuario } = await exigirProjetos(data.projectId);
    const db = getDb();

    const plano = planejarImportacao(
      lerIcs(data.conteudo),
      db.eventos.filter((evento) => evento.projectId === data.projectId),
      { projectId: data.projectId, criadoPor: usuario.id },
    );

    return {
      novos: plano.novos,
      atualizados: plano.atualizados.map(({ evento, mudou }) => ({
        id: evento.id,
        titulo: evento.titulo,
        mudou,
      })),
      iguais: plano.iguais,
      ignorados: plano.ignorados,
      comRepeticao: plano.comRepeticao,
    };
  });

export const aplicarAgendaIcs = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string(), conteudo: z.string().max(4_000_000) }))
  .handler(async ({ data }) => {
    const { usuario } = await exigirProjetos(data.projectId);
    const db = getDb();

    const plano = planejarImportacao(
      lerIcs(data.conteudo),
      db.eventos.filter((evento) => evento.projectId === data.projectId),
      { projectId: data.projectId, criadoPor: usuario.id },
    );

    db.eventos.push(...plano.novos);
    for (const { evento } of plano.atualizados) {
      const indice = db.eventos.findIndex((candidato) => candidato.id === evento.id);
      if (indice >= 0) db.eventos[indice] = evento;
    }

    // Cada compromisso importado vira pauta no quadro. `gerarPautas` olha o
    // banco inteiro, e não só o que acabou de entrar: assim uma reimportação
    // completa o que faltava sem duplicar o que já existe.
    const pautas = gerarPautas(
      db.eventos.filter((evento) => evento.projectId === data.projectId),
      usuario.id,
    );

    anotarDe(usuario, {
      acao: "agenda_importada",
      alvoRotulo: `${plano.novos.length} novos, ${plano.atualizados.length} atualizados`,
    });
    await persistir();

    return {
      criados: plano.novos.length,
      atualizados: plano.atualizados.length,
      iguais: plano.iguais,
      ignorados: plano.ignorados.length,
      pautasCriadas: pautas.length,
    };
  });

/**
 * Decide o que a pauta vai ser: carrossel, imagem, vídeo ou story.
 *
 * É o passo que faltava entre "sábado tem caminhada" e uma peça de verdade.
 * Junto com o formato vai a mídia esperada — o mesmo padrão que o editor usa —
 * porque um formato sem proporção nem tamanho não passa na validação de rede
 * nenhuma, e deixar isso para depois só adia o mesmo problema.
 *
 * Também aceita as contas em que a peça vai sair. As duas coisas juntas numa
 * chamada só porque é uma decisão só: quem escolhe "reels" já sabe onde.
 */
export const definirFormatoDaPauta = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      postId: z.string(),
      formato: z.enum(["imagem", "carrossel", "video", "story"]),
      accountIds: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const post = db.posts.find((candidato) => candidato.id === data.postId);
    if (!post) throw new Error("Peça não encontrada.");

    const { projetos, usuario } = await exigirProjetos(post.projectId);
    if (!projetos.includes(post.projectId)) throw new Error("Peça não encontrada.");

    // Peça já publicada não muda de formato: o que está no ar é o que está no
    // ar, e reescrever o registro faria a análise por formato mentir.
    if (post.status === "publicado") {
      return { ok: false as const, erro: "Peça publicada não muda de formato." };
    }

    post.format = data.formato;
    post.media = MIDIA_PADRAO[data.formato];
    if (data.accountIds) post.accountIds = data.accountIds;

    anotarDe(usuario, {
      acao: "publicacao_alterada",
      projetoId: post.projectId,
      alvoId: post.id,
      alvoRotulo: resumoDaLegenda(post.caption),
      detalhes: { formato: data.formato },
    });
    await persistir();

    return { ok: true as const, post };
  });

/** O dia de hoje, para a tela que abre com ele. */
export const resumoDeHoje = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().optional(), dia: z.string().optional() }))
  .handler(async ({ data }) => {
    const { projetos } = await exigirProjetos(data.projectId);
    const db = getDb();
    const contas = await contasPermitidas(data.projectId);
    const idsDeConta = new Set(contas.map((conta) => conta.id));

    const dia = data.dia ?? chaveDoDia(new Date());
    const resumo = resumirDia(
      dia,
      db.eventos.filter((evento) => projetos.includes(evento.projectId)),
      db.posts.filter((post) => vePeca(post, idsDeConta, projetos)),
      db.inbox.filter((item) => idsDeConta.has(item.accountId)),
    );

    return { resumo, contas, users: db.users };
  });
