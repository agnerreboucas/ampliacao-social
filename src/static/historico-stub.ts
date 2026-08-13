import { filtrar, type EventoHistorico, type FiltroHistorico } from "@/lib/social/historico";

/**
 * Histórico de uso na demonstração.
 *
 * O módulo real grava numa tabela do Postgres. Aqui as ações ficam numa lista
 * em memória, que some quando a aba fecha — e a tela já diz isso, porque o
 * mesmo aviso existe na versão com servidor quando o banco não está
 * configurado. Não é uma mentira nova: é o mesmo estado de "sem banco".
 *
 * O que interessa é que o histórico da demonstração seja **de verdade**: as
 * ações registradas são as que a pessoa acabou de fazer clicando, não uma lista
 * decorativa semeada. É isso que mostra o recurso funcionando.
 */

const eventos: EventoHistorico[] = [];

/** O mesmo teto do módulo real. */
const LIMITE = 2000;

export type NovoEvento = {
  acao: EventoHistorico["acao"];
  usuarioId: string | null;
  usuarioNome: string;
  projetoId?: string | null;
  projetoNome?: string | null;
  alvoId?: string | null;
  alvoRotulo?: string | null;
  detalhes?: Record<string, string | number> | null;
};

export async function registrar(evento: NovoEvento): Promise<void> {
  eventos.unshift({
    id: `h-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    em: new Date().toISOString(),
    usuarioId: evento.usuarioId,
    usuarioNome: evento.usuarioNome,
    projetoId: evento.projetoId ?? null,
    projetoNome: evento.projetoNome ?? null,
    acao: evento.acao,
    alvoId: evento.alvoId ?? null,
    alvoRotulo: evento.alvoRotulo ?? null,
    detalhes: evento.detalhes ?? null,
    // Não existe endereço de origem sem servidor, e inventar um seria pior que
    // deixar em branco.
    ip: null,
  });
  if (eventos.length > LIMITE) eventos.length = LIMITE;
}

export function anotar(evento: NovoEvento): void {
  void registrar(evento);
}

export async function consultar(
  filtro: FiltroHistorico & { limite?: number; deslocamento?: number },
): Promise<{ eventos: EventoHistorico[]; total: number; volatil: boolean }> {
  const limite = Math.min(Math.max(filtro.limite ?? 100, 1), 500);
  const deslocamento = Math.max(filtro.deslocamento ?? 0, 0);
  const todos = filtrar(eventos, filtro);

  return {
    eventos: todos.slice(deslocamento, deslocamento + limite),
    total: todos.length,
    volatil: true,
  };
}

export async function consultarTudo(filtro: FiltroHistorico): Promise<EventoHistorico[]> {
  return filtrar(eventos, filtro);
}
