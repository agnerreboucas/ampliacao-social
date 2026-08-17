/**
 * Histórico de uso da plataforma.
 *
 * Quem fez o quê, quando, e sobre o quê. Existe por dois motivos que costumam
 * ser confundidos: **prestar contas** — numa campanha, alguém vai perguntar quem
 * publicou aquilo, e "acho que fui eu" não é resposta — e **notar o que não
 * deveria ter acontecido**, que é uma entrada recusada às três da manhã.
 *
 * Duas decisões moldam o formato:
 *
 * O nome de quem agiu e a descrição do alvo são **copiados no momento do
 * registro**, não referenciados. Um histórico que diz "u-3 alterou c-7" vira
 * lixo no dia em que u-3 sai da equipe e c-7 é desconectada — justamente o dia
 * em que alguém vai querer lê-lo. Redundância aqui é a diferença entre um
 * registro e um enigma.
 *
 * O histórico é **somente acréscimo**. Nada nele é editado ou apagado pelo uso
 * normal da plataforma; ele não faz parte da regravação do estado. Um registro
 * que o próprio sistema reescreve não serve para prestar contas de nada.
 *
 * Módulo puro: o vocabulário e a redação vivem aqui, para que servidor, tela e
 * PDF digam a mesma coisa com as mesmas palavras.
 */

export type AcaoHistorico =
  // Acesso
  | "entrou"
  | "saiu"
  | "entrada_recusada"
  | "senha_definida"
  // Números
  | "leitura_registrada"
  | "sincronizacao_rede"
  | "sincronizacao_paga"
  | "historico_importado"
  // Contas
  | "conta_conectada"
  | "conta_desconectada"
  | "conexao_alterada"
  // Publicações
  | "publicacao_criada"
  | "publicacao_alterada"
  | "publicacao_republicada"
  | "publicacao_movida"
  // Agenda
  | "evento_criado"
  | "evento_editado"
  | "evento_removido"
  | "agenda_importada"
  // Mídia paga
  | "impulsionamento_criado"
  | "impulsionamento_encerrado"
  // Relacionamento
  | "interacao_respondida"
  | "resposta_em_lote"
  | "relacao_alterada"
  // Relatórios
  | "relatorio_gerado"
  | "relatorio_compartilhado"
  | "relatorio_fechado"
  // Equipe e dados
  | "usuario_convidado"
  | "usuario_alterado"
  | "perfil_editado"
  | "dados_exportados"
  | "dados_importados";

/**
 * Como cada ação é lida por uma pessoa, e o quanto ela pesa.
 *
 * `peso: "atencao"` não é gravidade no sentido de erro — é o que merece um
 * segundo olhar numa lista longa: mexer em gente, em permissão, em dado que sai
 * da plataforma, ou uma entrada que não deu certo.
 */
export const ACOES: Record<
  AcaoHistorico,
  { verbo: string; area: string; peso: "normal" | "atencao" }
> = {
  entrou: { verbo: "entrou na plataforma", area: "Acesso", peso: "normal" },
  saiu: { verbo: "saiu da plataforma", area: "Acesso", peso: "normal" },
  entrada_recusada: { verbo: "teve a entrada recusada", area: "Acesso", peso: "atencao" },
  senha_definida: { verbo: "definiu uma senha", area: "Acesso", peso: "atencao" },

  leitura_registrada: {
    verbo: "registrou uma leitura de números",
    area: "Números",
    peso: "normal",
  },
  sincronizacao_rede: { verbo: "sincronizou com a rede", area: "Números", peso: "normal" },
  sincronizacao_paga: { verbo: "sincronizou a mídia paga", area: "Números", peso: "normal" },
  historico_importado: {
    verbo: "importou histórico por planilha",
    area: "Números",
    // Reescreve muitos dias de uma vez: é a ação de números com maior alcance.
    peso: "atencao",
  },

  conta_conectada: { verbo: "conectou uma conta", area: "Contas", peso: "atencao" },
  conta_desconectada: { verbo: "desconectou uma conta", area: "Contas", peso: "atencao" },
  conexao_alterada: { verbo: "alterou a conexão de uma conta", area: "Contas", peso: "normal" },

  publicacao_criada: { verbo: "criou uma publicação", area: "Publicações", peso: "normal" },
  publicacao_alterada: { verbo: "alterou uma publicação", area: "Publicações", peso: "normal" },
  publicacao_movida: {
    verbo: "moveu uma publicação de fase",
    area: "Publicações",
    peso: "normal",
  },

  evento_criado: { verbo: "criou um compromisso", area: "Agenda", peso: "normal" },
  evento_editado: { verbo: "alterou um compromisso", area: "Agenda", peso: "normal" },
  evento_removido: { verbo: "removeu um compromisso", area: "Agenda", peso: "atencao" },
  // Importar agenda mexe em vários compromissos de uma vez: quem for prestar
  // contas de uma mudança de horário precisa achar a importação que a causou.
  agenda_importada: { verbo: "importou uma agenda", area: "Agenda", peso: "atencao" },

  publicacao_republicada: {
    verbo: "republicou uma publicação",
    area: "Publicações",
    peso: "normal",
  },

  impulsionamento_criado: {
    verbo: "criou um impulsionamento",
    area: "Mídia paga",
    peso: "atencao",
  },
  impulsionamento_encerrado: {
    verbo: "encerrou um impulsionamento",
    area: "Mídia paga",
    peso: "normal",
  },

  interacao_respondida: {
    verbo: "respondeu uma interação",
    area: "Relacionamento",
    peso: "normal",
  },
  resposta_em_lote: {
    verbo: "respondeu várias interações",
    area: "Relacionamento",
    peso: "normal",
  },
  relacao_alterada: { verbo: "reclassificou uma pessoa", area: "Relacionamento", peso: "normal" },

  relatorio_gerado: { verbo: "gerou um relatório", area: "Relatórios", peso: "normal" },
  relatorio_compartilhado: {
    verbo: "abriu o link público de um relatório",
    area: "Relatórios",
    peso: "atencao",
  },
  relatorio_fechado: {
    verbo: "fechou o link público de um relatório",
    area: "Relatórios",
    peso: "normal",
  },

  usuario_convidado: { verbo: "convidou alguém para a equipe", area: "Equipe", peso: "atencao" },
  usuario_alterado: { verbo: "alterou o acesso de alguém", area: "Equipe", peso: "atencao" },
  perfil_editado: { verbo: "atualizou o próprio perfil", area: "Equipe", peso: "normal" },
  dados_exportados: { verbo: "exportou os dados da plataforma", area: "Dados", peso: "atencao" },
  dados_importados: { verbo: "substituiu os dados da plataforma", area: "Dados", peso: "atencao" },
};

export const ACOES_CONHECIDAS = Object.keys(ACOES) as AcaoHistorico[];

export const AREAS = [...new Set(Object.values(ACOES).map((acao) => acao.area))];

export type EventoHistorico = {
  id: string;
  /** ISO datetime. */
  em: string;
  /**
   * Quem agiu. `null` quando não havia sessão — é o caso da entrada recusada,
   * que é exatamente quando saber o que aconteceu importa mais.
   */
  usuarioId: string | null;
  /** O nome no momento do registro. Ver a nota do topo sobre redundância. */
  usuarioNome: string;
  projetoId: string | null;
  projetoNome: string | null;
  acao: AcaoHistorico;
  /** Id do que sofreu a ação: conta, publicação, relatório, pessoa. */
  alvoId: string | null;
  /** Como o alvo se chamava no momento. */
  alvoRotulo: string | null;
  /** Números e escolhas que dão contexto à linha. Sem dado sensível. */
  detalhes: Record<string, string | number> | null;
  /**
   * Endereço de onde a ação partiu.
   *
   * Guardado porque, na única situação em que o histórico vira investigação,
   * "de onde" é metade da pergunta. É dado pessoal: aparece só para
   * administrador e não sai em relatório.
   */
  ip: string | null;
};

/** A linha do histórico como uma frase. */
export function frase(evento: EventoHistorico): string {
  const acao = ACOES[evento.acao];
  const verbo = acao ? acao.verbo : evento.acao;
  const alvo = evento.alvoRotulo ? `: ${evento.alvoRotulo}` : "";
  return `${evento.usuarioNome} ${verbo}${alvo}`;
}

export function areaDe(acao: AcaoHistorico): string {
  return ACOES[acao]?.area ?? "Outros";
}

export function pesoDe(acao: AcaoHistorico): "normal" | "atencao" {
  return ACOES[acao]?.peso ?? "normal";
}

/** Os detalhes como texto curto, na ordem em que foram escritos. */
export function detalhesEmTexto(evento: EventoHistorico): string {
  if (!evento.detalhes) return "";
  return Object.entries(evento.detalhes)
    .map(([chave, valor]) => `${chave}: ${valor}`)
    .join(" · ");
}

export type FiltroHistorico = {
  usuarioId?: string;
  acao?: AcaoHistorico;
  area?: string;
  projetoId?: string;
  /** YYYY-MM-DD, inclusivo. */
  de?: string;
  /** YYYY-MM-DD, inclusivo — o dia inteiro, até 23:59. */
  ate?: string;
  /** Busca livre no nome de quem agiu e no rótulo do alvo. */
  busca?: string;
};

/**
 * Aplica os filtros a uma lista já carregada.
 *
 * Vive no módulo puro para que o mesmo critério valha na memória e sobre o
 * resultado do banco — e para poder ser testado sem Postgres.
 */
export function filtrar(eventos: EventoHistorico[], filtro: FiltroHistorico): EventoHistorico[] {
  const busca = filtro.busca?.trim().toLowerCase();

  return eventos.filter((evento) => {
    if (filtro.usuarioId && evento.usuarioId !== filtro.usuarioId) return false;
    if (filtro.acao && evento.acao !== filtro.acao) return false;
    if (filtro.area && areaDe(evento.acao) !== filtro.area) return false;
    if (filtro.projetoId && evento.projetoId !== filtro.projetoId) return false;
    // Comparar o ISO por prefixo funciona porque "2026-08-09T…" ordena como
    // texto na mesma ordem que como data, e evita construir Date por linha.
    if (filtro.de && evento.em.slice(0, 10) < filtro.de) return false;
    if (filtro.ate && evento.em.slice(0, 10) > filtro.ate) return false;
    if (busca) {
      const alvo = `${evento.usuarioNome} ${evento.alvoRotulo ?? ""}`.toLowerCase();
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

export type ResumoDeUso = {
  usuarioId: string | null;
  usuarioNome: string;
  acoes: number;
  ultimaEm: string;
  /** Quantas ações de cada área, da mais frequente para a menos. */
  porArea: { area: string; acoes: number }[];
};

/**
 * Quanto cada pessoa usou a plataforma no conjunto informado.
 *
 * É a pergunta que o administrador faz primeiro — "quem está usando isto?" — e
 * que uma lista cronológica responde mal.
 */
export function resumirPorPessoa(eventos: EventoHistorico[]): ResumoDeUso[] {
  const porPessoa = new Map<
    string,
    { evento: EventoHistorico; total: number; areas: Map<string, number> }
  >();

  for (const evento of eventos) {
    const chave = evento.usuarioId ?? `anonimo:${evento.usuarioNome}`;
    const atual = porPessoa.get(chave);
    const area = areaDe(evento.acao);

    if (!atual) {
      porPessoa.set(chave, { evento, total: 1, areas: new Map([[area, 1]]) });
      continue;
    }
    atual.total += 1;
    atual.areas.set(area, (atual.areas.get(area) ?? 0) + 1);
    // A lista chega da mais recente para a mais antiga, mas não depender disso
    // custa uma comparação e evita um resumo errado se a ordem mudar.
    if (evento.em > atual.evento.em) atual.evento = evento;
  }

  return [...porPessoa.values()]
    .map(({ evento, total, areas }) => ({
      usuarioId: evento.usuarioId,
      usuarioNome: evento.usuarioNome,
      acoes: total,
      ultimaEm: evento.em,
      porArea: [...areas.entries()]
        .map(([area, acoes]) => ({ area, acoes }))
        .sort((a, b) => b.acoes - a.acoes || a.area.localeCompare(b.area)),
    }))
    .sort((a, b) => b.acoes - a.acoes || a.usuarioNome.localeCompare(b.usuarioNome));
}
