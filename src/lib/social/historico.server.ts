import { getRequestIP } from "@tanstack/react-start/server";

import { bancoConfigurado, obterPool } from "./banco/postgres.server";
import {
  ACOES_CONHECIDAS,
  areaDe,
  filtrar,
  type AcaoHistorico,
  type EventoHistorico,
  type FiltroHistorico,
} from "./historico";

/**
 * Gravação e consulta do histórico de uso.
 *
 * Duas regras governam este módulo:
 *
 * **Registrar nunca pode derrubar o que estava sendo registrado.** Se o banco
 * estiver fora do ar, a pessoa ainda precisa conseguir salvar a leitura de
 * números — perder uma linha de auditoria é ruim, perder o trabalho dela é pior.
 * Por isso toda falha aqui vira aviso no log do servidor e nada mais. A troca
 * é consciente: este histórico serve para prestar contas do uso normal, não
 * para ser prova em um processo, onde a exigência seria a oposta.
 *
 * **Sem banco, o histórico vive na memória.** A plataforma roda em modo
 * demonstração sem `DATABASE_URL`, e ali um histórico que não existe faria a
 * tela mentir. Em memória ele é limitado e some no restart, o que é dito na
 * própria tela em vez de escondido.
 */

/** Teto do histórico em memória. Alto o bastante para uma sessão de uso real. */
const LIMITE_EM_MEMORIA = 2000;

const globalHistorico = globalThis as typeof globalThis & {
  __socialHistorico?: EventoHistorico[];
};

function memoria(): EventoHistorico[] {
  globalHistorico.__socialHistorico ??= [];
  return globalHistorico.__socialHistorico;
}

export type NovoEvento = {
  acao: AcaoHistorico;
  usuarioId: string | null;
  usuarioNome: string;
  projetoId?: string | null;
  projetoNome?: string | null;
  alvoId?: string | null;
  alvoRotulo?: string | null;
  detalhes?: Record<string, string | number> | null;
};

function novoId(): string {
  // Data no começo para que a ordem alfabética dos ids seja a cronológica —
  // útil ao ler o banco direto, sem consulta ordenada.
  return `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * O endereço de quem fez a requisição.
 *
 * Fora de uma requisição — teste, script — não existe, e isso não é erro.
 */
function ipDaRequisicao(): string | null {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? null;
  } catch {
    return null;
  }
}

/**
 * Anota uma ação no histórico.
 *
 * Deliberadamente sem `await` obrigatório do lado de quem chama: a escrita é
 * disparada e a resposta ao usuário não espera por ela.
 */
export async function registrar(evento: NovoEvento): Promise<void> {
  const completo: EventoHistorico = {
    id: novoId(),
    em: new Date().toISOString(),
    usuarioId: evento.usuarioId,
    usuarioNome: evento.usuarioNome,
    projetoId: evento.projetoId ?? null,
    projetoNome: evento.projetoNome ?? null,
    acao: evento.acao,
    alvoId: evento.alvoId ?? null,
    alvoRotulo: evento.alvoRotulo ?? null,
    detalhes: evento.detalhes ?? null,
    ip: ipDaRequisicao(),
  };

  // A memória recebe sempre: com banco ligado ela serve de reserva se a
  // gravação falhar, e o histórico não fica mudo justamente na hora do problema.
  const lista = memoria();
  lista.unshift(completo);
  if (lista.length > LIMITE_EM_MEMORIA) lista.length = LIMITE_EM_MEMORIA;

  if (!bancoConfigurado()) return;

  try {
    await obterPool().query(
      `insert into historico
         (id, em, usuario_id, usuario_nome, projeto_id, projeto_nome, acao, alvo_id, alvo_rotulo, detalhes, ip)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        completo.id,
        completo.em,
        completo.usuarioId,
        completo.usuarioNome,
        completo.projetoId,
        completo.projetoNome,
        completo.acao,
        completo.alvoId,
        completo.alvoRotulo,
        completo.detalhes ? JSON.stringify(completo.detalhes) : null,
        completo.ip,
      ],
    );
  } catch (erro) {
    console.warn("Não foi possível gravar o histórico:", erro);
  }
}

/**
 * Dispara o registro sem prender a resposta.
 *
 * A rejeição é engolida no `registrar`; o `catch` aqui é a rede contra uma
 * exceção síncrona inesperada, que de outro modo viraria um `unhandledRejection`
 * e derrubaria o processo.
 */
export function anotar(evento: NovoEvento): void {
  void registrar(evento).catch(() => {});
}

export type PaginaDoHistorico = {
  eventos: EventoHistorico[];
  /** Quantos existem no total com estes filtros, para a tela saber se há mais. */
  total: number;
  /** `true` quando o histórico só existe em memória e some no restart. */
  volatil: boolean;
};

export async function consultar(
  filtro: FiltroHistorico & { limite?: number; deslocamento?: number },
): Promise<PaginaDoHistorico> {
  const limite = Math.min(Math.max(filtro.limite ?? 100, 1), 500);
  const deslocamento = Math.max(filtro.deslocamento ?? 0, 0);

  if (!bancoConfigurado()) {
    const todos = filtrar(memoria(), filtro);
    return {
      eventos: todos.slice(deslocamento, deslocamento + limite),
      total: todos.length,
      volatil: true,
    };
  }

  try {
    const { where, parametros } = montarFiltro(filtro);
    const pool = obterPool();

    const [linhas, contagem] = await Promise.all([
      pool.query(
        `select * from historico ${where} order by em desc limit $${parametros.length + 1} offset $${parametros.length + 2}`,
        [...parametros, limite, deslocamento],
      ),
      pool.query(`select count(*)::int as total from historico ${where}`, parametros),
    ]);

    return {
      eventos: linhas.rows.map(paraEvento),
      total: Number(contagem.rows[0]?.total ?? 0),
      volatil: false,
    };
  } catch (erro) {
    // Cair para a memória é melhor que uma tela em branco: mostra o que houver
    // e avisa que a lista está incompleta.
    console.warn("Não foi possível ler o histórico do banco:", erro);
    const todos = filtrar(memoria(), filtro);
    return {
      eventos: todos.slice(deslocamento, deslocamento + limite),
      total: todos.length,
      volatil: true,
    };
  }
}

/**
 * Tudo o que casa com o filtro, sem paginar — para o resumo por pessoa.
 *
 * Teto alto e explícito: um resumo construído sobre uma fatia arbitrária
 * mostraria "quem mais usou" de um pedaço, o que é pior que não mostrar.
 */
export async function consultarTudo(
  filtro: FiltroHistorico,
  teto = 20_000,
): Promise<EventoHistorico[]> {
  const pagina = await consultar({ ...filtro, limite: 500, deslocamento: 0 });
  if (pagina.volatil || pagina.total <= pagina.eventos.length) return pagina.eventos;

  const eventos = [...pagina.eventos];
  while (eventos.length < Math.min(pagina.total, teto)) {
    const proxima = await consultar({ ...filtro, limite: 500, deslocamento: eventos.length });
    if (proxima.eventos.length === 0) break;
    eventos.push(...proxima.eventos);
  }
  return eventos;
}

function montarFiltro(filtro: FiltroHistorico): { where: string; parametros: unknown[] } {
  const condicoes: string[] = [];
  const parametros: unknown[] = [];

  /** Guarda o valor e devolve a posição dele (`$1`, `$2`…) para montar o SQL. */
  const posicao = (valor: unknown): string => {
    parametros.push(valor);
    return `$${parametros.length}`;
  };

  if (filtro.usuarioId) condicoes.push(`usuario_id = ${posicao(filtro.usuarioId)}`);
  if (filtro.acao) condicoes.push(`acao = ${posicao(filtro.acao)}`);
  if (filtro.projetoId) condicoes.push(`projeto_id = ${posicao(filtro.projetoId)}`);
  if (filtro.de) condicoes.push(`em >= ${posicao(filtro.de)}::date`);
  // O dia inteiro: até o começo do dia seguinte, exclusivo. Comparar com
  // `<= data` pegaria só a meia-noite e esconderia o resto do dia.
  if (filtro.ate) condicoes.push(`em < (${posicao(filtro.ate)}::date + interval '1 day')`);
  if (filtro.busca?.trim()) {
    const alvo = posicao(`%${filtro.busca.trim()}%`);
    condicoes.push(`(usuario_nome ilike ${alvo} or coalesce(alvo_rotulo, '') ilike ${alvo})`);
  }

  // A área agrupa várias ações. Traduzir para a lista de ações mantém o filtro
  // dentro do SQL — se ele fosse aplicado depois, sobre a página já lida, o
  // total e a paginação passariam a contar linhas que a tela não mostra.
  if (filtro.area) {
    const daArea = ACOES_CONHECIDAS.filter((acao) => areaDe(acao) === filtro.area);
    condicoes.push(`acao = any(${posicao(daArea)})`);
  }

  return {
    where: condicoes.length > 0 ? `where ${condicoes.join(" and ")}` : "",
    parametros,
  };
}

function paraEvento(linha: Record<string, unknown>): EventoHistorico {
  return {
    id: String(linha.id),
    em: linha.em instanceof Date ? linha.em.toISOString() : String(linha.em),
    usuarioId: linha.usuario_id === null ? null : String(linha.usuario_id),
    usuarioNome: String(linha.usuario_nome),
    projetoId: linha.projeto_id === null ? null : String(linha.projeto_id),
    projetoNome: linha.projeto_nome === null ? null : String(linha.projeto_nome),
    acao: String(linha.acao) as AcaoHistorico,
    alvoId: linha.alvo_id === null ? null : String(linha.alvo_id),
    alvoRotulo: linha.alvo_rotulo === null ? null : String(linha.alvo_rotulo),
    detalhes: (linha.detalhes as Record<string, string | number> | null) ?? null,
    ip: linha.ip === null ? null : String(linha.ip),
  };
}
