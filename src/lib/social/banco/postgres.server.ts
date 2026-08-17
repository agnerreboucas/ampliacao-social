import pg from "pg";

import { ESQUEMA_SQL, TABELAS_EM_ORDEM_DE_LIMPEZA } from "./esquema.ts";
import {
  deAtualizacao,
  deConta,
  deImpulsionamento,
  deEvento,
  deInteracao,
  dePublicacao,
  deProjeto,
  deRelatorio,
  deUsuario,
  paraAtualizacao,
  paraConta,
  paraImpulsionamento,
  paraEvento,
  paraInteracao,
  paraMetrica,
  paraProjeto,
  paraPublicacao,
  paraRelatorio,
  paraResposta,
  paraUsuario,
} from "./mapeamento.ts";
import type { EstadoPersistivel } from "../snapshot.ts";
import type { AudienceInsight, DailyMetric, InboxReply } from "../types.ts";

/**
 * Persistência em Postgres — Neon, Supabase, RDS ou um Postgres local: o driver
 * é o padrão e o esquema não usa nada específico de fornecedor.
 *
 * Liga-se com uma variável de ambiente. Sem ela, a plataforma continua no
 * arquivo JSON, e nada aqui é sequer executado.
 *
 * O formato do endereço do Neon:
 *   postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
 */

// --- Conversões de tipo do driver -------------------------------------------
//
// Instaladas uma vez, antes de qualquer conexão.

/**
 * `date` (OID 1082) fica como texto.
 *
 * O padrão do driver é converter para `Date`, o que joga o fuso do processo
 * dentro de um dado que não tem hora: "2026-08-08" lido em São Paulo vira 7 de
 * agosto às 21h, e o dia inteiro do relatório escorrega. Manter texto elimina
 * a classe inteira de erro.
 */
pg.types.setTypeParser(1082, (valor) => valor);

/** `numeric` (OID 1700) → número. Valores em reais cabem em `number` com folga. */
pg.types.setTypeParser(1700, (valor) => (valor === null ? null : Number(valor)));

export type Pool = pg.Pool;

const globalPool = globalThis as typeof globalThis & { __socialPool?: pg.Pool };

export function bancoConfigurado(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * O pool, criado uma vez por processo.
 *
 * Fica em `globalThis` pelo mesmo motivo do store: o hot reload do Vite
 * reavalia o módulo, e um pool novo por reload esgotaria as conexões do plano
 * gratuito em poucos minutos de desenvolvimento.
 */
export function obterPool(): pg.Pool {
  if (!globalPool.__socialPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL não está definida.");

    globalPool.__socialPool = new pg.Pool({
      connectionString,
      // O Neon exige TLS. `rejectUnauthorized: false` aceita a cadeia do
      // provedor sem exigir o certificado raiz no sistema — é o que o próprio
      // Neon documenta para clientes Node.
      ssl: precisaDeSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
      // O plano gratuito é modesto em conexões; a aplicação escreve pouco e lê
      // tudo de uma vez na subida.
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalPool.__socialPool;
}

/** Postgres local costuma não ter TLS; serviços gerenciados exigem. */
function precisaDeSsl(connectionString: string): boolean {
  if (/sslmode=disable/.test(connectionString)) return false;
  if (/sslmode=require|sslmode=verify/.test(connectionString)) return true;
  return !/@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
}

export async function garantirEsquema(pool: pg.Pool = obterPool()): Promise<void> {
  await pool.query(ESQUEMA_SQL);
}

/** Fecha o pool — usado nos testes; a aplicação mantém aberto enquanto vive. */
export async function encerrarPool(): Promise<void> {
  if (globalPool.__socialPool) {
    await globalPool.__socialPool.end();
    globalPool.__socialPool = undefined;
  }
}

// --- Leitura ----------------------------------------------------------------

/**
 * Carrega o estado inteiro em memória.
 *
 * Sim, tudo de uma vez: o volume é de alguns milhares de linhas por cliente, e
 * ler uma vez na subida mantém `getDb()` síncrono — ou seja, nenhuma das
 * quarenta funções de servidor precisa mudar por causa do banco. Quando um
 * cliente crescer a ponto de isso pesar, o caminho é substituir consulta a
 * consulta, sem refazer a aplicação.
 *
 * Devolve `null` quando o banco está vazio, e aí a semente assume.
 */
export async function carregarDoBanco(
  pool: pg.Pool = obterPool(),
): Promise<EstadoPersistivel | null> {
  /**
   * "Banco vazio" quer dizer **instalação que ainda não existe**, e isso se mede
   * pelos usuários.
   *
   * Antes a pergunta era feita à tabela de contas de rede social, e o efeito era
   * silencioso e destrutivo: uma instalação nova legítima — projeto criado,
   * administrador criado, senha definida — não tem conta de rede nenhuma até
   * alguém conectar a primeira. Toda subida concluía "vazio", regravava o estado
   * de estreia por cima e **zerava o hash da senha**. Ninguém conseguia entrar, e
   * o log não acusava nada de errado.
   *
   * Usuário é o registro que nasce junto com a instalação e nunca some.
   */
  const instalacao = await pool.query("select 1 from usuarios limit 1");
  if (instalacao.rowCount === 0) return null;

  const contas = await pool.query("select * from contas order by ordem, id");

  const [
    projetos,
    usuarios,
    usuarioProjetos,
    metricas,
    publico,
    publicacoes,
    publicacaoContas,
    impulsionamentos,
    interacoes,
    respostas,
    eventos,
    relatorios,
    relatorioContas,
    atualizacoes,
  ] = await Promise.all([
    pool.query("select * from projetos order by ordem, id"),
    pool.query("select * from usuarios order by ordem, id"),
    pool.query("select * from usuario_projetos"),
    pool.query("select * from metricas_diarias order by conta_id, data"),
    pool.query("select * from publico"),
    pool.query("select * from publicacoes"),
    pool.query("select * from publicacao_contas order by publicacao_id, ordem"),
    pool.query("select * from impulsionamentos order by iniciado_em desc"),
    pool.query("select * from interacoes order by recebida_em desc"),
    pool.query("select * from respostas order by interacao_id, ordem"),
    pool.query("select * from eventos order by comeca_em"),
    pool.query("select * from relatorios order by criado_em desc"),
    pool.query("select * from relatorio_contas"),
    pool.query("select * from atualizacoes_manuais order by registrada_em"),
  ]);

  const projetosPorUsuario = agrupar(
    usuarioProjetos.rows,
    (linha) => String(linha.usuario_id),
    (linha) => String(linha.projeto_id),
  );

  const contasPorPublicacao = agrupar(
    publicacaoContas.rows,
    (linha) => String(linha.publicacao_id),
    (linha) => String(linha.conta_id),
  );

  const contasPorRelatorio = agrupar(
    relatorioContas.rows,
    (linha) => String(linha.relatorio_id),
    (linha) => String(linha.conta_id),
  );

  const respostasPorInteracao = agrupar(
    respostas.rows,
    (linha) => String(linha.interacao_id),
    (linha) => paraResposta(linha) as InboxReply,
  );

  const metricasPorConta = new Map<string, DailyMetric[]>();
  for (const linha of metricas.rows) {
    const contaId = String(linha.conta_id);
    const lista = metricasPorConta.get(contaId) ?? [];
    lista.push(paraMetrica(linha));
    metricasPorConta.set(contaId, lista);
  }

  const publicoPorConta = new Map<string, AudienceInsight>();
  for (const linha of publico.rows) {
    publicoPorConta.set(String(linha.conta_id), linha.dados as AudienceInsight);
  }

  return {
    projects: projetos.rows.map(paraProjeto),
    users: usuarios.rows.map((linha) =>
      paraUsuario(linha, projetosPorUsuario.get(String(linha.id)) ?? []),
    ),
    accounts: contas.rows.map(paraConta),
    metrics: metricasPorConta,
    audience: publicoPorConta,
    posts: publicacoes.rows.map((linha) =>
      paraPublicacao(linha, contasPorPublicacao.get(String(linha.id)) ?? []),
    ),
    boosts: impulsionamentos.rows.map(paraImpulsionamento),
    eventos: eventos.rows.map(paraEvento),
    inbox: interacoes.rows.map((linha) =>
      paraInteracao(linha, respostasPorInteracao.get(String(linha.id)) ?? []),
    ),
    reports: relatorios.rows.map((linha) =>
      paraRelatorio(linha, contasPorRelatorio.get(String(linha.id)) ?? []),
    ),
    atualizacoes: atualizacoes.rows.map(paraAtualizacao),
  };
}

function agrupar<T, V>(
  linhas: Record<string, unknown>[],
  chave: (linha: Record<string, unknown>) => string,
  valor: (linha: Record<string, unknown>) => V,
): Map<string, V[]> {
  const mapa = new Map<string, V[]>();
  for (const linha of linhas) {
    const k = chave(linha);
    const lista = mapa.get(k) ?? [];
    lista.push(valor(linha));
    mapa.set(k, lista);
  }
  return mapa as Map<string, V[]>;
}

// --- Escrita ----------------------------------------------------------------

/**
 * Regrava o estado inteiro dentro de uma transação.
 *
 * Apagar tudo e reinserir parece grosseiro, e seria — se a escrita fosse
 * frequente. Ela não é: acontece quando alguém registra uma leitura manual ou
 * carrega um arquivo, umas poucas vezes por dia. Em troca, some a classe de
 * erro mais cara de todas: o estado meio atualizado, com uma publicação nova
 * apontando para uma conta que a atualização anterior removeu.
 *
 * Tudo em uma transação: ou o estado novo inteiro, ou o antigo inteiro.
 */
export async function gravarNoBanco(
  estado: EstadoPersistivel,
  pool: pg.Pool = obterPool(),
): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");

    for (const tabela of TABELAS_EM_ORDEM_DE_LIMPEZA) {
      await cliente.query(`delete from ${tabela}`);
    }

    await inserirEmLote(
      cliente,
      "projetos",
      COLUNAS.projetos,
      estado.projects.map((projeto, ordem) => deProjeto(projeto, ordem)),
    );
    await inserirEmLote(
      cliente,
      "usuarios",
      COLUNAS.usuarios,
      estado.users.map((usuario, ordem) => deUsuario(usuario, ordem)),
    );
    await inserirEmLote(
      cliente,
      "usuario_projetos",
      ["usuario_id", "projeto_id"],
      estado.users.flatMap((usuario) =>
        usuario.projectIds.map((projetoId) => [usuario.id, projetoId]),
      ),
    );
    await inserirEmLote(
      cliente,
      "contas",
      COLUNAS.contas,
      estado.accounts.map((conta, ordem) => deConta(conta, ordem)),
    );

    // A maior tabela: `unnest` manda uma linha por posição dos arrays em vez de
    // um par de parâmetros por coluna. Com quinze mil dias, o `VALUES` normal
    // estouraria o limite de 65.535 parâmetros de uma consulta.
    await inserirMetricas(cliente, estado.metrics);

    await inserirEmLote(
      cliente,
      "publico",
      ["conta_id", "dados"],
      [...estado.audience.entries()].map(([contaId, dados]) => [contaId, JSON.stringify(dados)]),
    );

    await inserirEmLote(
      cliente,
      "publicacoes",
      COLUNAS.publicacoes,
      estado.posts.map(dePublicacao),
    );
    await inserirEmLote(
      cliente,
      "publicacao_contas",
      ["publicacao_id", "conta_id", "ordem"],
      estado.posts.flatMap((post) =>
        // Um id repetido na mesma publicação violaria a chave primária; a
        // deduplicação preserva a primeira ocorrência, e com ela a ordem.
        [...new Set(post.accountIds)].map((contaId, ordem) => [post.id, contaId, ordem]),
      ),
    );

    await inserirEmLote(
      cliente,
      "impulsionamentos",
      COLUNAS.impulsionamentos,
      estado.boosts.map(deImpulsionamento),
    );

    await inserirEmLote(cliente, "interacoes", COLUNAS.interacoes, estado.inbox.map(deInteracao));
    await inserirEmLote(cliente, "eventos", COLUNAS.eventos, estado.eventos.map(deEvento));
    await inserirEmLote(
      cliente,
      "respostas",
      ["id", "interacao_id", "autor", "texto", "enviada_em", "ordem"],
      estado.inbox.flatMap((item) =>
        item.replies.map((resposta, ordem) => [
          resposta.id,
          item.id,
          resposta.author,
          resposta.text,
          resposta.sentAt,
          ordem,
        ]),
      ),
    );

    await inserirEmLote(cliente, "relatorios", COLUNAS.relatorios, estado.reports.map(deRelatorio));
    await inserirEmLote(
      cliente,
      "relatorio_contas",
      ["relatorio_id", "conta_id"],
      estado.reports.flatMap((report) =>
        [...new Set(report.accountIds)].map((contaId) => [report.id, contaId]),
      ),
    );

    await inserirEmLote(
      cliente,
      "atualizacoes_manuais",
      COLUNAS.atualizacoes,
      estado.atualizacoes.map(deAtualizacao),
    );

    await cliente.query("commit");
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}

const COLUNAS = {
  projetos: ["id", "nome", "cliente", "ordem"],
  usuarios: [
    "id",
    "nome",
    "email",
    "papel",
    "ultimo_acesso_em",
    "avatar_gradiente",
    "ordem",
    "senha_hash",
    "area",
    "telefone",
  ],
  contas: [
    "id",
    "projeto_id",
    "rede",
    "identificador",
    "nome_exibicao",
    "situacao",
    "origem",
    "id_externo",
    "conta_anuncios_conectada",
    "acompanhando_desde",
    "token_expira_em",
    "ultima_sincronizacao_em",
    "mensageria_aprovada",
    "avatar_gradiente",
    "ordem",
  ],
  publicacoes: [
    "id",
    "projeto_id",
    "republicado_de",
    "formato",
    "legenda",
    "midia",
    "situacao",
    "agendado_para",
    "publicado_em",
    "criado_por",
    "aprovado_por",
    "exige_aprovacao",
    "motivo_falha",
    "metricas",
    "capa_gradiente",
    "origem_evento_id",
  ],
  impulsionamentos: [
    "id",
    "publicacao_id",
    "conta_id",
    "objetivo",
    "orcamento_total",
    "duracao_dias",
    "iniciado_em",
    "termina_em",
    "situacao",
    "publico_alvo",
    "resultados",
  ],
  eventos: [
    "id",
    "projeto_id",
    "titulo",
    "descricao",
    "tipo",
    "comeca_em",
    "termina_em",
    "dia_inteiro",
    "local",
    "municipio_codigo",
    "responsavel",
    "origem",
    "uid_externo",
    "criado_por",
    "criado_em",
    "dados_extras",
  ],
  interacoes: [
    "id",
    "conta_id",
    "tipo",
    "autor_identificador",
    "autor_nome",
    "avatar_gradiente",
    "texto",
    "publicacao_id",
    "recebida_em",
    "situacao",
    "atribuida_a",
    "relacao",
    "total_interacoes",
  ],
  relatorios: [
    "id",
    "projeto_id",
    "titulo",
    "periodo_inicio",
    "periodo_fim",
    "criado_em",
    "criado_por",
    "token_compartilhamento",
    "compartilhamento_ativo",
  ],
  atualizacoes: ["id", "conta_id", "data", "registrada_em", "autor", "valores"],
} as const;

/** Um `INSERT` a cada `LOTE` linhas — abaixo do teto de parâmetros do Postgres. */
const LOTE = 500;

async function inserirEmLote(
  cliente: pg.PoolClient,
  tabela: string,
  colunas: readonly string[],
  linhas: unknown[][],
): Promise<void> {
  if (linhas.length === 0) return;

  const porVez = Math.max(1, Math.floor(60_000 / colunas.length));
  const tamanho = Math.min(LOTE, porVez);

  for (let inicio = 0; inicio < linhas.length; inicio += tamanho) {
    const fatia = linhas.slice(inicio, inicio + tamanho);
    const parametros: unknown[] = [];
    const grupos = fatia.map((linha) => {
      const posicoes = linha.map((valor) => {
        parametros.push(valor);
        return `$${parametros.length}`;
      });
      return `(${posicoes.join(", ")})`;
    });

    await cliente.query(
      `insert into ${tabela} (${colunas.join(", ")}) values ${grupos.join(", ")}`,
      parametros,
    );
  }
}

async function inserirMetricas(
  cliente: pg.PoolClient,
  metricas: Map<string, DailyMetric[]>,
): Promise<void> {
  const contas: string[] = [];
  const datas: string[] = [];
  const seguidores: number[] = [];
  const ganhos: number[] = [];
  const perdidos: number[] = [];
  const alcanceOrganico: number[] = [];
  const alcancePago: number[] = [];
  const impressoesOrganicas: number[] = [];
  const impressoesPagas: number[] = [];
  const engajamentoOrganico: number[] = [];
  const engajamentoPago: number[] = [];
  const investimento: number[] = [];

  for (const [contaId, dias] of metricas.entries()) {
    // O mesmo dia duas vezes violaria a chave primária. O último vence — é a
    // mesma regra da atualização manual: a leitura mais recente é a que vale.
    const porData = new Map(dias.map((dia) => [dia.date, dia]));
    for (const dia of porData.values()) {
      contas.push(contaId);
      datas.push(dia.date);
      seguidores.push(dia.followers);
      ganhos.push(dia.followersGained);
      perdidos.push(dia.followersLost);
      alcanceOrganico.push(dia.organicReach);
      alcancePago.push(dia.paidReach);
      impressoesOrganicas.push(dia.organicImpressions);
      impressoesPagas.push(dia.paidImpressions);
      engajamentoOrganico.push(dia.organicEngagement);
      engajamentoPago.push(dia.paidEngagement);
      investimento.push(dia.adSpend);
    }
  }

  if (contas.length === 0) return;

  await cliente.query(
    `insert into metricas_diarias (
       conta_id, data, seguidores, seguidores_ganhos, seguidores_perdidos,
       alcance_organico, alcance_pago, impressoes_organicas, impressoes_pagas,
       engajamento_organico, engajamento_pago, investimento
     )
     select * from unnest(
       $1::text[], $2::date[], $3::int[], $4::int[], $5::int[],
       $6::int[], $7::int[], $8::int[], $9::int[],
       $10::int[], $11::int[], $12::numeric[]
     )`,
    [
      contas,
      datas,
      seguidores,
      ganhos,
      perdidos,
      alcanceOrganico,
      alcancePago,
      impressoesOrganicas,
      impressoesPagas,
      engajamentoOrganico,
      engajamentoPago,
      investimento,
    ],
  );
}
