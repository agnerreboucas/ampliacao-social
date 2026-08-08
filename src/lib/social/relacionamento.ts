import type { InboxItem, NetworkId, RelacaoPessoa } from "./types";

/**
 * Regras da área de Relacionamento.
 *
 * A ideia central: uma caixa de entrada trata cada mensagem como um chamado a
 * resolver; o relacionamento trata cada mensagem como uma *pessoa* — a mesma
 * pessoa que já comentou outras dez vezes, ou que apareceu hoje pela primeira
 * vez. Quem já está do lado merece um convite; quem chegou agora merece uma
 * resposta que aproxime.
 *
 * Módulo puro de propósito: nenhuma dependência de servidor, testável direto.
 */

export const RELACOES: RelacaoPessoa[] = ["nao_seguidor", "seguidor", "apoiador", "defensor"];

export type RelacaoInfo = {
  label: string;
  descricao: string;
  /** Quantas interações bastam para a classificação automática sugerir este grau. */
  minimoInteracoes: number;
  color: string;
};

export const RELACAO_INFO: Record<RelacaoPessoa, RelacaoInfo> = {
  nao_seguidor: {
    label: "Não seguidor",
    descricao: "Chegou pelo alcance, ainda não acompanha. Uma boa resposta aqui converte.",
    minimoInteracoes: 0,
    color: "oklch(0.62 0.02 260)",
  },
  seguidor: {
    label: "Seguidor",
    descricao: "Acompanha e interage de vez em quando.",
    minimoInteracoes: 1,
    color: "oklch(0.68 0.14 240)",
  },
  apoiador: {
    label: "Apoiador",
    descricao: "Interage com frequência e responde bem a chamados diretos.",
    minimoInteracoes: 6,
    color: "oklch(0.72 0.16 150)",
  },
  defensor: {
    label: "Defensor",
    descricao: "Compartilha, defende e traz gente nova. É quem amplifica a causa.",
    minimoInteracoes: 20,
    color: "oklch(0.74 0.18 70)",
  },
};

/**
 * Classificação automática a partir do volume de interações.
 *
 * É um ponto de partida, não um veredito: a rede não expõe "esta pessoa me
 * segue" junto de cada comentário, então o número de interações é a melhor
 * evidência disponível. A tela permite corrigir à mão, e a correção manual
 * vence — quem conhece a base é o time, não a heurística.
 */
export function classificarPorInteracoes(interacoes: number): RelacaoPessoa {
  if (interacoes >= RELACAO_INFO.defensor.minimoInteracoes) return "defensor";
  if (interacoes >= RELACAO_INFO.apoiador.minimoInteracoes) return "apoiador";
  if (interacoes >= RELACAO_INFO.seguidor.minimoInteracoes) return "seguidor";
  return "nao_seguidor";
}

/** Uma pessoa, consolidada a partir de tudo que ela mandou. */
export type Pessoa = {
  handle: string;
  nome: string;
  avatarGradient: string;
  relacao: RelacaoPessoa;
  interacoes: number;
  /** Redes em que essa pessoa apareceu. */
  redes: NetworkId[];
  /** Itens dessa pessoa, do mais recente para o mais antigo. */
  itemIds: string[];
  pendentes: number;
  ultimoContatoEm: string;
};

/**
 * Junta os itens da caixa por pessoa.
 *
 * O mesmo `@handle` comentando no Instagram e mandando mensagem no Facebook é
 * uma pessoa só — sem isso, o time responde duas vezes e classifica dois graus
 * diferentes para quem, do outro lado, é a mesma gente.
 */
export function consolidarPessoas(
  items: InboxItem[],
  redePorConta: Record<string, NetworkId>,
): Pessoa[] {
  const porHandle = new Map<string, Pessoa>();

  for (const item of items) {
    const rede = redePorConta[item.accountId];
    const atual = porHandle.get(item.authorHandle);

    if (!atual) {
      porHandle.set(item.authorHandle, {
        handle: item.authorHandle,
        nome: item.authorName,
        avatarGradient: item.avatarGradient,
        relacao: item.relacao,
        interacoes: item.interacoes,
        redes: rede ? [rede] : [],
        itemIds: [item.id],
        pendentes: item.status === "pendente" ? 1 : 0,
        ultimoContatoEm: item.receivedAt,
      });
      continue;
    }

    // O grau mais alto encontrado vale: se em algum canal a pessoa já foi
    // marcada como defensora, ela não vira seguidora por causa de outro item.
    if (RELACOES.indexOf(item.relacao) > RELACOES.indexOf(atual.relacao)) {
      atual.relacao = item.relacao;
    }
    atual.interacoes = Math.max(atual.interacoes, item.interacoes);
    if (rede && !atual.redes.includes(rede)) atual.redes.push(rede);
    atual.itemIds.push(item.id);
    if (item.status === "pendente") atual.pendentes += 1;
    if (item.receivedAt > atual.ultimoContatoEm) atual.ultimoContatoEm = item.receivedAt;
  }

  return [...porHandle.values()].sort((a, b) => b.ultimoContatoEm.localeCompare(a.ultimoContatoEm));
}

export function contarPorRelacao(items: InboxItem[]): Record<RelacaoPessoa, number> {
  const contagem: Record<RelacaoPessoa, number> = {
    nao_seguidor: 0,
    seguidor: 0,
    apoiador: 0,
    defensor: 0,
  };
  for (const item of items) contagem[item.relacao] += 1;
  return contagem;
}

/** Variáveis aceitas no texto de uma resposta em lote. */
export const VARIAVEIS_MODELO = [
  { chave: "{nome}", descricao: "Primeiro nome de quem recebe" },
  { chave: "{handle}", descricao: "@ da pessoa" },
] as const;

/**
 * Troca as variáveis do modelo pelos dados de quem vai receber.
 *
 * Responder dez pessoas com o texto idêntico é o caminho mais curto para o
 * filtro de spam da rede — e para soar como robô. O modelo com variáveis
 * mantém a mensagem pessoal mesmo quando sai de uma seleção múltipla.
 */
export function aplicarModelo(modelo: string, pessoa: { nome: string; handle: string }): string {
  const primeiroNome = pessoa.nome.trim().split(/\s+/)[0] ?? pessoa.nome;
  return modelo.replaceAll("{nome}", primeiroNome).replaceAll("{handle}", pessoa.handle);
}

/**
 * Modelos prontos por grau de relação. Servem de ponto de partida na tela —
 * o texto continua editável antes de enviar.
 */
export const MODELOS_POR_RELACAO: Record<RelacaoPessoa, { titulo: string; texto: string }[]> = {
  nao_seguidor: [
    {
      titulo: "Boas-vindas",
      texto:
        "Oi {nome}, obrigado por comentar! Se quiser acompanhar o que vem por aí, é só seguir a página — postamos novidade toda semana.",
    },
  ],
  seguidor: [
    {
      titulo: "Agradecimento",
      texto: "Valeu, {nome}! Fico feliz que você tenha curtido. Qualquer dúvida, é só chamar.",
    },
  ],
  apoiador: [
    {
      titulo: "Convite para compartilhar",
      texto:
        "{nome}, você sempre acompanha a gente por aqui — obrigado mesmo. Se puder compartilhar esse último conteúdo, ajuda muito a alcançar mais gente.",
    },
  ],
  defensor: [
    {
      titulo: "Convocação",
      texto:
        "{nome}, você é uma das pessoas que mais ajuda a levar isso adiante. Publicamos um conteúdo novo hoje: compartilhar, comentar e reagir nas primeiras horas é o que faz a mensagem chegar em quem ainda não conhece. Conto com você?",
    },
  ],
};

export type ResultadoLote = {
  enviados: string[];
  ignorados: { itemId: string; motivo: string }[];
};

/**
 * Decide, item a item, quem pode receber a resposta em lote.
 *
 * Comentário público é sempre respondível. Mensagem direta não: a rede só
 * permite responder dentro da janela de 24h depois que a pessoa escreveu, e
 * apenas em contas com a permissão de mensageria aprovada. Bloquear aqui é o
 * que evita uma tentativa que a API recusaria — ou pior, que derrubaria a
 * conta por envio em massa.
 */
export function separarEnviaveis(
  items: InboxItem[],
  contexto: {
    agoraMs: number;
    mensageriaPorConta: Record<string, boolean>;
    janelaHoras?: number;
  },
): ResultadoLote {
  const janelaMs = (contexto.janelaHoras ?? 24) * 3600_000;
  const enviados: string[] = [];
  const ignorados: { itemId: string; motivo: string }[] = [];

  for (const item of items) {
    if (item.kind === "comentario") {
      enviados.push(item.id);
      continue;
    }

    if (!contexto.mensageriaPorConta[item.accountId]) {
      ignorados.push({
        itemId: item.id,
        motivo: "A conta não tem permissão de mensageria aprovada pela rede.",
      });
      continue;
    }

    const idadeMs = contexto.agoraMs - new Date(item.receivedAt).getTime();
    if (idadeMs > janelaMs) {
      ignorados.push({
        itemId: item.id,
        motivo: "Fora da janela de 24h: a rede só permite responder mensagens recentes.",
      });
      continue;
    }

    enviados.push(item.id);
  }

  return { enviados, ignorados };
}
