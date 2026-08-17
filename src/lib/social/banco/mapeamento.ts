import type {
  AtualizacaoManual,
  Boost,
  DailyMetric,
  InboxItem,
  InboxReply,
  PlatformUser,
  Post,
  Project,
  Evento,
  Report,
  SocialAccount,
} from "../types.ts";

/**
 * Tradução entre as linhas do Postgres e o domínio.
 *
 * Separado do acesso ao banco de propósito: é aqui que moram os erros chatos —
 * uma data que volta com um dia a menos, um `numeric` que chega como texto — e
 * módulo puro é módulo que se testa sem subir servidor nenhum.
 *
 * Duas convenções valem para o arquivo inteiro:
 *
 * 1. **Datas (`date`) viajam como texto `AAAA-MM-DD`.** O driver é configurado
 *    para não convertê-las em `Date`. Converter traria o fuso do processo para
 *    dentro de um dado que não tem hora, e "2026-08-08" viraria dia 7 em
 *    qualquer servidor a oeste de Greenwich.
 * 2. **Instantes (`timestamptz`) viajam como `Date` e voltam em ISO.** Aí o
 *    fuso é informação legítima, e o ISO em UTC é o formato que o domínio usa.
 */

/** O que o driver entrega: valores já com os parsers deste módulo aplicados. */
export type Linha = Record<string, unknown>;

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

function textoOuNulo(valor: unknown): string | null {
  return valor === null || valor === undefined ? null : String(valor);
}

function inteiro(valor: unknown): number {
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? Math.round(numero) : 0;
}

/**
 * `numeric` chega como texto no driver, para não perder precisão em valores
 * grandes. Investimento em reais cabe folgado em `number`, então converter aqui
 * é seguro — e evita espalhar `Number()` por toda a aplicação.
 */
export function decimal(valor: unknown): number {
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function booleano(valor: unknown): boolean {
  return valor === true || valor === "t" || valor === "true";
}

/** `timestamptz` → ISO em UTC, que é como o domínio guarda instantes. */
export function instante(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "string" && valor.length > 0) return new Date(valor).toISOString();
  return new Date(0).toISOString();
}

function instanteOuNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return instante(valor);
}

/**
 * `date` → `AAAA-MM-DD`, sem passar por `Date`.
 *
 * Se o driver ainda assim devolver um `Date` (parser não instalado), a data é
 * lida em UTC — nunca em horário local, que é justamente o que desloca o dia.
 */
export function dia(valor: unknown): string {
  if (typeof valor === "string") return valor.slice(0, 10);
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return "";
}

function diaOuNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  return dia(valor);
}

// --- Leitura: linha → domínio -----------------------------------------------

export function paraProjeto(linha: Linha): Project {
  return { id: texto(linha.id), name: texto(linha.nome), client: texto(linha.cliente) };
}

export function paraUsuario(linha: Linha, projectIds: string[]): PlatformUser {
  const senhaHash = textoOuNulo(linha.senha_hash);
  const area = textoOuNulo(linha.area);
  const telefone = textoOuNulo(linha.telefone);
  return {
    id: texto(linha.id),
    name: texto(linha.nome),
    email: texto(linha.email),
    role: texto(linha.papel) as PlatformUser["role"],
    ...(senhaHash === null ? {} : { senhaHash }),
    projectIds,
    lastActiveAt: instante(linha.ultimo_acesso_em),
    avatarGradient: texto(linha.avatar_gradiente),
    ...(area === null ? {} : { area }),
    ...(telefone === null ? {} : { telefone }),
  };
}

export function paraConta(linha: Linha): SocialAccount {
  const idExterno = textoOuNulo(linha.id_externo);
  return {
    id: texto(linha.id),
    projectId: texto(linha.projeto_id),
    networkId: texto(linha.rede) as SocialAccount["networkId"],
    handle: texto(linha.identificador),
    displayName: texto(linha.nome_exibicao),
    status: texto(linha.situacao) as SocialAccount["status"],
    origem: texto(linha.origem) as SocialAccount["origem"],
    ...(idExterno === null ? {} : { externalId: idExterno }),
    adAccountConnected: booleano(linha.conta_anuncios_conectada),
    trackingSince: dia(linha.acompanhando_desde),
    tokenExpiresAt: diaOuNulo(linha.token_expira_em),
    lastSyncAt: instanteOuNulo(linha.ultima_sincronizacao_em),
    messagingApproved: booleano(linha.mensageria_aprovada),
    avatarGradient: texto(linha.avatar_gradiente),
  };
}

export function paraMetrica(linha: Linha): DailyMetric {
  return {
    date: dia(linha.data),
    followers: inteiro(linha.seguidores),
    followersGained: inteiro(linha.seguidores_ganhos),
    followersLost: inteiro(linha.seguidores_perdidos),
    organicReach: inteiro(linha.alcance_organico),
    paidReach: inteiro(linha.alcance_pago),
    organicImpressions: inteiro(linha.impressoes_organicas),
    paidImpressions: inteiro(linha.impressoes_pagas),
    organicEngagement: inteiro(linha.engajamento_organico),
    paidEngagement: inteiro(linha.engajamento_pago),
    adSpend: decimal(linha.investimento),
  };
}

export function paraPublicacao(linha: Linha, accountIds: string[]): Post {
  const republicadoDe = textoOuNulo(linha.republicado_de);
  const motivoFalha = textoOuNulo(linha.motivo_falha);
  const origemEventoId = textoOuNulo(linha.origem_evento_id);
  return {
    id: texto(linha.id),
    projectId: texto(linha.projeto_id),
    ...(republicadoDe === null ? {} : { republicadoDe }),
    accountIds,
    format: texto(linha.formato) as Post["format"],
    caption: texto(linha.legenda),
    media: linha.midia as Post["media"],
    status: texto(linha.situacao) as Post["status"],
    scheduledFor: instanteOuNulo(linha.agendado_para),
    publishedAt: instanteOuNulo(linha.publicado_em),
    createdBy: texto(linha.criado_por),
    approvedBy: textoOuNulo(linha.aprovado_por),
    requiresApproval: booleano(linha.exige_aprovacao),
    ...(motivoFalha === null ? {} : { failureReason: motivoFalha }),
    metrics: (linha.metricas as Post["metrics"]) ?? null,
    coverGradient: texto(linha.capa_gradiente),
    ...(origemEventoId === null ? {} : { origemEventoId }),
  };
}

export function paraImpulsionamento(linha: Linha): Boost {
  return {
    id: texto(linha.id),
    postId: texto(linha.publicacao_id),
    accountId: texto(linha.conta_id),
    objective: texto(linha.objetivo) as Boost["objective"],
    budgetTotal: decimal(linha.orcamento_total),
    durationDays: inteiro(linha.duracao_dias),
    startedAt: dia(linha.iniciado_em),
    endsAt: dia(linha.termina_em),
    status: texto(linha.situacao) as Boost["status"],
    audience: linha.publico_alvo as Boost["audience"],
    results: linha.resultados as Boost["results"],
  };
}

export function paraResposta(linha: Linha): InboxReply {
  return {
    id: texto(linha.id),
    author: texto(linha.autor),
    text: texto(linha.texto),
    sentAt: instante(linha.enviada_em),
  };
}

export function paraInteracao(linha: Linha, replies: InboxReply[]): InboxItem {
  return {
    id: texto(linha.id),
    accountId: texto(linha.conta_id),
    kind: texto(linha.tipo) as InboxItem["kind"],
    authorHandle: texto(linha.autor_identificador),
    authorName: texto(linha.autor_nome),
    avatarGradient: texto(linha.avatar_gradiente),
    text: texto(linha.texto),
    postId: textoOuNulo(linha.publicacao_id),
    receivedAt: instante(linha.recebida_em),
    status: texto(linha.situacao) as InboxItem["status"],
    assignedTo: textoOuNulo(linha.atribuida_a),
    replies,
    relacao: texto(linha.relacao) as InboxItem["relacao"],
    interacoes: inteiro(linha.total_interacoes),
  };
}

export function paraRelatorio(linha: Linha, accountIds: string[]): Report {
  return {
    id: texto(linha.id),
    projectId: texto(linha.projeto_id),
    accountIds,
    title: texto(linha.titulo),
    periodStart: dia(linha.periodo_inicio),
    periodEnd: dia(linha.periodo_fim),
    createdAt: instante(linha.criado_em),
    createdBy: texto(linha.criado_por),
    shareToken: texto(linha.token_compartilhamento),
    shareEnabled: booleano(linha.compartilhamento_ativo),
  };
}

export function paraAtualizacao(linha: Linha): AtualizacaoManual {
  return {
    id: texto(linha.id),
    accountId: texto(linha.conta_id),
    date: dia(linha.data),
    registradaEm: instante(linha.registrada_em),
    autor: texto(linha.autor),
    valores: linha.valores as AtualizacaoManual["valores"],
  };
}

// --- Escrita: domínio → valores de coluna -----------------------------------
//
// Cada função devolve os valores na ordem exata das colunas do INSERT
// correspondente. Manter a ordem aqui, junto do mapeamento de leitura, é o que
// evita o clássico "trocaram duas colunas do mesmo tipo e ninguém percebeu".

export function deProjeto(projeto: Project, ordem = 0): unknown[] {
  return [projeto.id, projeto.name, projeto.client, ordem];
}

export function deUsuario(usuario: PlatformUser, ordem = 0): unknown[] {
  return [
    usuario.id,
    usuario.name,
    usuario.email,
    usuario.role,
    usuario.lastActiveAt,
    usuario.avatarGradient,
    ordem,
    usuario.senhaHash ?? null,
    usuario.area ?? null,
    usuario.telefone ?? null,
  ];
}

export function deConta(conta: SocialAccount, ordem = 0): unknown[] {
  return [
    conta.id,
    conta.projectId,
    conta.networkId,
    conta.handle,
    conta.displayName,
    conta.status,
    conta.origem,
    conta.externalId ?? null,
    conta.adAccountConnected,
    conta.trackingSince,
    conta.tokenExpiresAt,
    conta.lastSyncAt,
    conta.messagingApproved,
    conta.avatarGradient,
    ordem,
  ];
}

export function dePublicacao(post: Post): unknown[] {
  return [
    post.id,
    post.projectId,
    post.republicadoDe ?? null,
    post.format,
    post.caption,
    JSON.stringify(post.media),
    post.status,
    post.scheduledFor,
    post.publishedAt,
    post.createdBy,
    post.approvedBy,
    post.requiresApproval,
    post.failureReason ?? null,
    post.metrics === null ? null : JSON.stringify(post.metrics),
    post.coverGradient,
    post.origemEventoId ?? null,
  ];
}

export function deImpulsionamento(boost: Boost): unknown[] {
  return [
    boost.id,
    boost.postId,
    boost.accountId,
    boost.objective,
    boost.budgetTotal,
    boost.durationDays,
    boost.startedAt,
    boost.endsAt,
    boost.status,
    JSON.stringify(boost.audience),
    JSON.stringify(boost.results),
  ];
}

export function deInteracao(item: InboxItem): unknown[] {
  return [
    item.id,
    item.accountId,
    item.kind,
    item.authorHandle,
    item.authorName,
    item.avatarGradient,
    item.text,
    item.postId,
    item.receivedAt,
    item.status,
    item.assignedTo,
    item.relacao,
    item.interacoes,
  ];
}

export function paraEvento(linha: Linha): Evento {
  const extras = (linha.dados_extras ?? {}) as { postIds?: string[] };
  return {
    id: texto(linha.id),
    projectId: texto(linha.projeto_id),
    titulo: texto(linha.titulo),
    descricao: textoOuNulo(linha.descricao),
    tipo: texto(linha.tipo) as Evento["tipo"],
    comecaEm: instante(linha.comeca_em),
    terminaEm: linha.termina_em ? instante(linha.termina_em) : null,
    diaInteiro: Boolean(linha.dia_inteiro),
    local: textoOuNulo(linha.local),
    municipioCodigo: textoOuNulo(linha.municipio_codigo),
    responsavel: textoOuNulo(linha.responsavel),
    postIds: extras.postIds ?? [],
    origem: texto(linha.origem) as Evento["origem"],
    uidExterno: textoOuNulo(linha.uid_externo) ?? undefined,
    criadoPor: texto(linha.criado_por),
    criadoEm: instante(linha.criado_em),
  };
}

export function deEvento(evento: Evento): unknown[] {
  return [
    evento.id,
    evento.projectId,
    evento.titulo,
    evento.descricao,
    evento.tipo,
    evento.comecaEm,
    evento.terminaEm,
    evento.diaInteiro,
    evento.local,
    evento.municipioCodigo,
    evento.responsavel,
    evento.origem,
    evento.uidExterno ?? null,
    evento.criadoPor,
    evento.criadoEm,
    JSON.stringify({ postIds: evento.postIds }),
  ];
}

export function deRelatorio(report: Report): unknown[] {
  return [
    report.id,
    report.projectId,
    report.title,
    report.periodStart,
    report.periodEnd,
    report.createdAt,
    report.createdBy,
    report.shareToken,
    report.shareEnabled,
  ];
}

export function deAtualizacao(registro: AtualizacaoManual): unknown[] {
  return [
    registro.id,
    registro.accountId,
    registro.date,
    registro.registradaEm,
    registro.autor,
    JSON.stringify(registro.valores),
  ];
}
