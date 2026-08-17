import { FASES_DE_PRODUCAO } from "./types.ts";
import type { Evento, InboxItem, Post, PostStatus } from "./types";

/**
 * A agenda da campanha: eventos, produção e publicação no mesmo eixo do tempo.
 *
 * A plataforma tinha uma lista de publicações e nada mais. Quem organiza uma
 * campanha não pensa em lista: pensa em **dias**. Sábado tem caminhada, e da
 * caminhada saem três peças que precisam estar prontas até sexta. Nenhuma
 * dessas três frases cabia no modelo antigo.
 *
 * Três visões, porque são três perguntas diferentes e não vale forçá-las numa
 * tela só:
 *
 * **Produção** — em que pé está cada peça. É o quadro, com uma coluna por fase.
 * **Publicação** — o que vai ao ar e quando. É o calendário, por dia e hora.
 * **Tudo** — a semana como ela é: evento, produção e publicação misturados,
 * porque é assim que a semana chega para quem trabalha nela.
 *
 * A decisão que vale para o módulo inteiro: **o dia é a unidade**. Toda função
 * daqui agrupa por dia (`YYYY-MM-DD`), e não por semana nem por período — é o
 * dia que a pessoa clica, e é do dia que ela quer a lista inteira.
 *
 * Módulo puro.
 */

/** A chave de um dia, no fuso de quem está olhando. */
export function chaveDoDia(data: Date | string): string {
  const d = typeof data === "string" ? new Date(data) : data;
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}

export function lerDia(chave: string): Date {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

function somarDias(data: Date, dias: number): Date {
  const proxima = new Date(data);
  proxima.setDate(proxima.getDate() + dias);
  return proxima;
}

/**
 * O que uma peça faz num dia.
 *
 * A mesma publicação aparece em dias diferentes por motivos diferentes: no dia
 * do prazo ela é trabalho a fazer; no dia da publicação ela é entrega. Separar
 * os dois papéis é o que impede o calendário de mentir sobre a carga da semana.
 */
export type PapelNoDia = "evento" | "producao" | "agendado" | "publicado";

export type ItemDoDia =
  | { papel: "evento"; dia: string; evento: Evento }
  | { papel: "producao" | "agendado" | "publicado"; dia: string; post: Post };

/**
 * Coloca cada peça e cada evento no dia a que pertencem.
 *
 * Uma peça publicada entra pelo dia da publicação. Uma agendada, pelo dia
 * marcado. Uma em produção sem data não entra em dia nenhum — e é isso que a
 * separa: ela mora no quadro, não no calendário, e forçá-la para "hoje" encheria
 * o dia de hoje com trabalho que não vence hoje.
 */
export function distribuirPorDia(eventos: Evento[], posts: Post[]): Map<string, ItemDoDia[]> {
  const dias = new Map<string, ItemDoDia[]>();

  const guardar = (dia: string, item: ItemDoDia) => {
    dias.set(dia, [...(dias.get(dia) ?? []), item]);
  };

  for (const evento of eventos) {
    const dia = chaveDoDia(evento.comecaEm);
    guardar(dia, { papel: "evento", dia, evento });

    // Evento de vários dias aparece em cada um deles: quem olha a quarta-feira
    // de uma caravana de três dias precisa vê-la ali.
    if (evento.terminaEm) {
      const fim = chaveDoDia(evento.terminaEm);
      let cursor = somarDias(lerDia(dia), 1);
      while (chaveDoDia(cursor) <= fim) {
        const chave = chaveDoDia(cursor);
        guardar(chave, { papel: "evento", dia: chave, evento });
        cursor = somarDias(cursor, 1);
      }
    }
  }

  for (const post of posts) {
    if (post.status === "publicado" && post.publishedAt) {
      const dia = chaveDoDia(post.publishedAt);
      guardar(dia, { papel: "publicado", dia, post });
      continue;
    }
    if (post.scheduledFor) {
      const dia = chaveDoDia(post.scheduledFor);
      const papel = post.status === "agendado" ? "agendado" : "producao";
      guardar(dia, { papel, dia, post });
    }
  }

  return dias;
}

/** Tudo o que acontece num dia, na ordem em que acontece. */
export function itensDoDia(dia: string, eventos: Evento[], posts: Post[]): ItemDoDia[] {
  const doDia = distribuirPorDia(eventos, posts).get(dia) ?? [];

  const quando = (item: ItemDoDia): string =>
    item.papel === "evento"
      ? item.evento.comecaEm
      : (item.post.publishedAt ?? item.post.scheduledFor ?? "");

  return [...doDia].sort((a, b) => quando(a).localeCompare(quando(b)));
}

export type ColunaDoQuadro = {
  fase: Exclude<PostStatus, "falhou">;
  posts: Post[];
};

/**
 * O quadro de produção: uma coluna por fase, na ordem do trabalho.
 *
 * Colunas vazias continuam aparecendo. Um quadro que esconde a coluna vazia
 * esconde justamente a informação de que ninguém está produzindo nada — que é
 * quando alguém precisa saber.
 */
export function montarQuadro(posts: Post[]): ColunaDoQuadro[] {
  return FASES_DE_PRODUCAO.map((fase) => ({
    fase,
    posts: posts
      .filter((post) => post.status === fase)
      .sort((a, b) =>
        (a.scheduledFor ?? a.publishedAt ?? "9999").localeCompare(
          b.scheduledFor ?? b.publishedAt ?? "9999",
        ),
      ),
  }));
}

/** As transições que fazem sentido a partir de cada fase. */
const PROXIMAS_FASES: Record<PostStatus, PostStatus[]> = {
  ideia: ["rascunho"],
  rascunho: ["ideia", "aguardando_aprovacao", "aprovado"],
  aguardando_aprovacao: ["rascunho", "aprovado"],
  aprovado: ["aguardando_aprovacao", "agendado", "publicado"],
  agendado: ["aprovado", "publicado"],
  // Publicado é fim de linha: despublicar não é operação que a rede ofereça de
  // volta, e fingir que oferece produziria um estado que a plataforma não
  // consegue sustentar.
  publicado: [],
  falhou: ["rascunho", "aprovado"],
};

export function podeMoverPara(de: PostStatus, para: PostStatus): boolean {
  return PROXIMAS_FASES[de].includes(para);
}

export type ResumoDoDia = {
  dia: string;
  eventos: Evento[];
  /** Peças que vão ao ar hoje, agendadas. */
  publicaHoje: Post[];
  /** Já foram publicadas hoje. */
  publicadas: Post[];
  /** Esperando alguém aprovar — a fila que trava o resto. */
  esperandoAprovacao: Post[];
  /** Em produção com prazo para hoje ou já vencido. */
  produzindo: Post[];
  /** Interações sem resposta. */
  conversasPendentes: number;
  /** Nada a fazer hoje: muda a tela inteira, então é decidido aqui. */
  vazio: boolean;
};

/**
 * O dia, do jeito que alguém quer receber ao acordar.
 *
 * A ordem dos campos é a ordem da urgência, e não é acaso: evento acontece com
 * ou sem a plataforma; publicação agendada sai sozinha; aprovação pendente
 * trava outra pessoa; produção depende de quem lê. Quem tiver trinta segundos
 * lê os dois primeiros e já sabe o que o dia é.
 */
export function resumirDia(
  dia: string,
  eventos: Evento[],
  posts: Post[],
  inbox: InboxItem[] = [],
): ResumoDoDia {
  const noDia = (iso: string | null) => iso !== null && chaveDoDia(iso) === dia;

  const doDia = eventos
    .filter((evento) => {
      const inicio = chaveDoDia(evento.comecaEm);
      const fim = evento.terminaEm ? chaveDoDia(evento.terminaEm) : inicio;
      return dia >= inicio && dia <= fim;
    })
    .sort((a, b) => a.comecaEm.localeCompare(b.comecaEm));

  const publicaHoje = posts.filter(
    (post) => post.status === "agendado" && noDia(post.scheduledFor),
  );
  const publicadas = posts.filter((post) => post.status === "publicado" && noDia(post.publishedAt));
  const esperandoAprovacao = posts.filter((post) => post.status === "aguardando_aprovacao");

  // "Atrasado" conta como produção de hoje: prazo vencido não some da lista, ou
  // a peça esquecida fica esquecida.
  const produzindo = posts.filter(
    (post) =>
      (post.status === "ideia" || post.status === "rascunho") &&
      post.scheduledFor !== null &&
      chaveDoDia(post.scheduledFor) <= dia,
  );

  const conversasPendentes = inbox.filter((item) => item.status === "pendente").length;

  return {
    dia,
    eventos: doDia,
    publicaHoje,
    publicadas,
    esperandoAprovacao,
    produzindo,
    conversasPendentes,
    vazio:
      doDia.length === 0 &&
      publicaHoje.length === 0 &&
      publicadas.length === 0 &&
      esperandoAprovacao.length === 0 &&
      produzindo.length === 0,
  };
}

/**
 * A grade do mês, começando no domingo e fechando a última semana.
 *
 * Devolve sempre semanas inteiras — 35 ou 42 dias — porque um calendário com a
 * última linha pela metade quebra o alinhamento das colunas.
 */
export function gradeDoMes(ano: number, mes: number): string[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = somarDias(primeiro, -primeiro.getDay());

  const ultimo = new Date(ano, mes + 1, 0);
  const fim = somarDias(ultimo, 6 - ultimo.getDay());

  const dias: string[] = [];
  let cursor = inicio;
  while (cursor <= fim) {
    dias.push(chaveDoDia(cursor));
    cursor = somarDias(cursor, 1);
  }
  return dias;
}

/** A semana de um dia, de domingo a sábado. */
export function semanaDe(dia: string): string[] {
  const data = lerDia(dia);
  const domingo = somarDias(data, -data.getDay());
  return Array.from({ length: 7 }, (_, i) => chaveDoDia(somarDias(domingo, i)));
}

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function nomeDoDiaDaSemana(dia: string): string {
  return DIAS_DA_SEMANA[lerDia(dia).getDay()];
}

export function nomeDoMes(mes: number): string {
  return MESES[mes];
}

/** "sábado, 16 de agosto" — o dia como cabeçalho do painel expandido. */
export function tituloDoDia(dia: string): string {
  const data = lerDia(dia);
  const porExtenso = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ][data.getDay()];
  return `${porExtenso}, ${data.getDate()} de ${MESES[data.getMonth()]}`;
}

/** A hora de um item, para a linha do tempo do dia. Nulo em dia inteiro. */
export function horaDoItem(item: ItemDoDia): string | null {
  if (item.papel === "evento") {
    if (item.evento.diaInteiro) return null;
    const data = new Date(item.evento.comecaEm);
    return `${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
  }
  const iso = item.post.publishedAt ?? item.post.scheduledFor;
  if (!iso) return null;
  const data = new Date(iso);
  return `${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
}

// --- Da agenda para a pauta --------------------------------------------------

/**
 * Todo compromisso da campanha é conteúdo em potencial.
 *
 * A caminhada de sábado não é só um horário na agenda: é reels, é carrossel, é
 * story. Antes, a pessoa importava a agenda inteira do Google e depois digitava
 * de novo, uma a uma, as pautas correspondentes — o mesmo trabalho duas vezes, e
 * a segunda vez sempre incompleta.
 *
 * Agora o evento entra no quadro como **pauta**, na coluna de ideias, marcada
 * como vinda da agenda. O que a pauta ainda **não** tem é formato: quem decide
 * se aquilo vira carrossel ou reels é uma pessoa olhando, e é por isso que
 * `a_definir` existe como formato de verdade em vez de um chute qualquer.
 *
 * A ligação é `origemEventoId`. É ela que faz a reimportação do mesmo
 * calendário — que o Google exporta inteiro, sempre — não criar a mesma pauta
 * pela segunda vez.
 */
export function eventosSemPauta(eventos: Evento[], posts: Post[]): Evento[] {
  const jaGeraram = new Set(
    posts.map((post) => post.origemEventoId).filter((id): id is string => Boolean(id)),
  );
  return eventos.filter((evento) => !jaGeraram.has(evento.id));
}

/** As pautas que nasceram de um compromisso. */
export function pautasDoEvento(evento: Evento, posts: Post[]): Post[] {
  return posts.filter((post) => post.origemEventoId === evento.id);
}

/**
 * O texto com que a pauta nasce.
 *
 * Não é a legenda final — é o bilhete que faz alguém entender, uma semana
 * depois, de que compromisso aquilo saiu. Por isso carrega quando e onde: sem a
 * data, "Caminhada" no meio de trinta pautas não diz qual caminhada.
 */
export function pautaDoEvento(evento: Evento): string {
  const partes = [evento.titulo];

  const data = new Date(evento.comecaEm);
  const dia = `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`;
  partes.push(
    evento.diaInteiro
      ? `${dia}, dia inteiro`
      : `${dia} às ${String(data.getHours()).padStart(2, "0")}h${String(data.getMinutes()).padStart(2, "0")}`,
  );

  if (evento.local) partes.push(evento.local);

  return partes.join(" · ");
}

/**
 * O que impede uma peça de avançar de fase, além da ordem das fases.
 *
 * Existe uma regra só, e ela é o motivo de `a_definir` existir: **pauta sem
 * formato não vira produção**. Deixar avançar produziria uma peça agendada que
 * nenhuma rede aceita — o erro apareceria na hora de publicar, que é o pior
 * momento possível para descobrir que ninguém decidiu se aquilo era um reels.
 *
 * Devolve o motivo em texto, e não `false`, porque o botão que recusa sem dizer
 * por quê é o botão que a pessoa clica de novo.
 */
export function motivoParaNaoAvancar(post: Post, destino: PostStatus): string | null {
  if (destino === "ideia" || destino === "rascunho") return null;
  if (post.format !== "a_definir") return null;
  return "Escolha o formato da peça antes de avançar: carrossel, imagem, vídeo ou story.";
}

// --- A marcação de cada peça no calendário ----------------------------------

/**
 * O que a cor de uma peça no calendário significa.
 *
 * Três estados, e a escolha deles é sobre **o que exige ação de quem olha**, não
 * sobre a fase interna da produção:
 *
 * `aprovar` — vermelho. Alguém precisa aprovar, e a peça já tem data. É o único
 * estado urgente do calendário: sem a aprovação, o horário passa e a peça não
 * sai. Vermelho porque é o que precisa ser visto de longe.
 *
 * `aguardando` — amarelo. Aprovada e ainda não publicada. Não exige ação hoje,
 * exige memória: está no forno, vai sair.
 *
 * `publicada` — verde. Foi ao ar. Não há nada a fazer, e é isso que o verde diz.
 *
 * `rascunho` — cinza. Ainda em produção, sem data marcada para aprovar. Aparece
 * porque ocupa o dia, mas não compete por atenção com o que tem prazo.
 */
export type MarcaDaPeca = "aprovar" | "aguardando" | "publicada" | "rascunho";

export function marcaDaPeca(post: Post): MarcaDaPeca {
  if (post.status === "publicado") return "publicada";
  if (post.status === "aguardando_aprovacao") return "aprovar";
  if (post.status === "aprovado" || post.status === "agendado") return "aguardando";
  return "rascunho";
}

export const ROTULO_DA_MARCA: Record<MarcaDaPeca, string> = {
  aprovar: "Precisa aprovar",
  aguardando: "Aprovada, ainda não publicada",
  publicada: "Publicada",
  rascunho: "Em produção",
};

/**
 * As peças que travam o calendário: já têm data e ainda não foram aprovadas.
 *
 * É a lista que responde "o que eu preciso resolver hoje para nada furar". A
 * ordem é pela data de publicação, da mais próxima para a mais distante — o que
 * vence primeiro é o que aparece primeiro, e não o que foi criado primeiro.
 */
export function esperandoAprovacao(posts: Post[]): Post[] {
  return posts
    .filter((post) => marcaDaPeca(post) === "aprovar")
    .sort((a, b) =>
      (a.scheduledFor ?? a.publishedAt ?? "9999").localeCompare(
        b.scheduledFor ?? b.publishedAt ?? "9999",
      ),
    );
}
