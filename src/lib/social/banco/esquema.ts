/**
 * Esquema relacional da plataforma.
 *
 * Por que normalizado, e não um documento JSON em uma coluna: o histórico
 * diário é a parte que cresce. Regravar o estado inteiro a cada leitura manual
 * significaria escrever ~600 KB três vezes por dia — mais de 600 MB em um ano,
 * quando o plano gratuito do Neon oferece 0,5 GB. Em linhas, os mesmos dados
 * ocupam alguns megabytes e ainda dá para consultar por conta e por período.
 *
 * O DDL é idempotente de propósito: roda na subida da aplicação e não faz nada
 * se as tabelas já existirem. Enquanto o esquema não mudar de forma, isto
 * dispensa uma ferramenta de migração.
 */
export const ESQUEMA_SQL = `
-- A coluna "ordem" existe em projetos, usuários e contas porque a ordem da
-- lista é decisão de produto, não do banco. Sem ela, migrar do arquivo para o
-- Postgres reordenaria em silêncio todas as telas do cliente.
create table if not exists projetos (
  id text primary key,
  nome text not null,
  cliente text not null,
  ordem integer not null default 0
);

create table if not exists usuarios (
  id text primary key,
  nome text not null,
  email text not null,
  papel text not null,
  ultimo_acesso_em timestamptz not null,
  avatar_gradiente text not null,
  ordem integer not null default 0,
  -- Derivação scrypt da senha, nunca a senha. Só existe aqui: o snapshot em
  -- JSON, que vai para o Git, omite esta coluna de propósito.
  senha_hash text,
  -- A frente em que a pessoa atua na campanha. Não é o papel.
  area text,
  telefone text
);

create unique index if not exists usuarios_email_unico on usuarios (lower(email));

create table if not exists usuario_projetos (
  usuario_id text not null references usuarios (id) on delete cascade,
  projeto_id text not null,
  primary key (usuario_id, projeto_id)
);

create table if not exists contas (
  id text primary key,
  projeto_id text not null,
  rede text not null,
  identificador text not null,
  nome_exibicao text not null,
  situacao text not null,
  origem text not null,
  id_externo text,
  conta_anuncios_conectada boolean not null,
  acompanhando_desde date not null,
  token_expira_em date,
  ultima_sincronizacao_em timestamptz,
  mensageria_aprovada boolean not null,
  avatar_gradiente text not null,
  ordem integer not null default 0
);

create index if not exists contas_por_projeto on contas (projeto_id);

-- A tabela que cresce. Chave por conta e dia: registrar o mesmo dia de novo
-- atualiza a linha em vez de criar outra, que é a regra da atualização manual.
create table if not exists metricas_diarias (
  conta_id text not null references contas (id) on delete cascade,
  data date not null,
  seguidores integer not null,
  seguidores_ganhos integer not null,
  seguidores_perdidos integer not null,
  alcance_organico integer not null,
  alcance_pago integer not null,
  impressoes_organicas integer not null,
  impressoes_pagas integer not null,
  engajamento_organico integer not null,
  engajamento_pago integer not null,
  investimento numeric(12,2) not null,
  primary key (conta_id, data)
);

create index if not exists metricas_por_data on metricas_diarias (data);

-- Perfil de público é um retrato calculado, sem consulta por dentro: jsonb serve.
create table if not exists publico (
  conta_id text primary key references contas (id) on delete cascade,
  dados jsonb not null
);

create table if not exists publicacoes (
  id text primary key,
  projeto_id text not null,
  republicado_de text,
  formato text not null,
  legenda text not null,
  midia jsonb not null,
  situacao text not null,
  agendado_para timestamptz,
  publicado_em timestamptz,
  criado_por text not null,
  aprovado_por text,
  exige_aprovacao boolean not null,
  motivo_falha text,
  metricas jsonb,
  capa_gradiente text not null,
  -- O compromisso da agenda que virou esta pauta. Nulo para peça criada à mão.
  origem_evento_id text
);

create index if not exists publicacoes_por_projeto on publicacoes (projeto_id);
create index if not exists publicacoes_por_publicacao_em on publicacoes (publicado_em);

-- Uma publicação sai em várias contas; a ordem importa para reproduzir a lista.
create table if not exists publicacao_contas (
  publicacao_id text not null references publicacoes (id) on delete cascade,
  conta_id text not null,
  ordem integer not null,
  primary key (publicacao_id, conta_id)
);

create table if not exists impulsionamentos (
  id text primary key,
  publicacao_id text not null,
  conta_id text not null,
  objetivo text not null,
  orcamento_total numeric(12,2) not null,
  duracao_dias integer not null,
  iniciado_em date not null,
  termina_em date not null,
  situacao text not null,
  publico_alvo jsonb not null,
  resultados jsonb not null
);

create index if not exists impulsionamentos_por_conta on impulsionamentos (conta_id);

create table if not exists interacoes (
  id text primary key,
  conta_id text not null,
  tipo text not null,
  autor_identificador text not null,
  autor_nome text not null,
  avatar_gradiente text not null,
  texto text not null,
  publicacao_id text,
  recebida_em timestamptz not null,
  situacao text not null,
  atribuida_a text,
  relacao text not null,
  total_interacoes integer not null
);

create index if not exists interacoes_por_conta on interacoes (conta_id, recebida_em desc);
create index if not exists interacoes_por_autor on interacoes (autor_identificador);

-- Compromissos da campanha no calendário.
--
-- A coluna dados_extras guarda a lista de publicações vinculadas como JSON em
-- vez de uma tabela de ligação: a lista é curta, sempre lida junto com o evento,
-- e nunca consultada de trás para frente ("quais eventos citam esta peça?").
-- Uma tabela a mais aqui custaria duas consultas para não responder pergunta
-- nenhuma.
create table if not exists eventos (
  id text primary key,
  projeto_id text not null references projetos (id) on delete cascade,
  titulo text not null,
  descricao text,
  tipo text not null,
  comeca_em timestamptz not null,
  termina_em timestamptz,
  dia_inteiro boolean not null default false,
  local text,
  municipio_codigo text,
  responsavel text,
  origem text not null default 'manual',
  uid_externo text,
  criado_por text not null,
  criado_em timestamptz not null,
  dados_extras jsonb not null default '{}'::jsonb
);

create index if not exists eventos_por_projeto on eventos (projeto_id, comeca_em);
-- O identificador externo é o que impede a reimportação de duplicar a agenda.
create unique index if not exists eventos_por_uid on eventos (projeto_id, uid_externo)
  where uid_externo is not null;

create table if not exists respostas (
  id text primary key,
  interacao_id text not null references interacoes (id) on delete cascade,
  autor text not null,
  texto text not null,
  enviada_em timestamptz not null,
  ordem integer not null
);

create table if not exists relatorios (
  id text primary key,
  projeto_id text not null,
  titulo text not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  criado_em timestamptz not null,
  criado_por text not null,
  token_compartilhamento text not null,
  compartilhamento_ativo boolean not null
);

create index if not exists relatorios_por_token on relatorios (token_compartilhamento);

create table if not exists relatorio_contas (
  relatorio_id text not null references relatorios (id) on delete cascade,
  conta_id text not null,
  primary key (relatorio_id, conta_id)
);

-- O log das leituras manuais: várias por dia, e é a diferença entre elas que
-- mostra como o dia evoluiu.
create table if not exists atualizacoes_manuais (
  id text primary key,
  conta_id text not null,
  data date not null,
  registrada_em timestamptz not null,
  autor text not null,
  valores jsonb not null
);

create index if not exists atualizacoes_por_conta_dia on atualizacoes_manuais (conta_id, data);

-- Histórico de uso
--
-- Fica de fora de TABELAS_EM_ORDEM_DE_LIMPEZA de propósito: a regravação do
-- estado apaga e reinsere tudo, e um histórico que o próprio sistema reescreve
-- a cada salvamento não serve para prestar contas de nada. Aqui só se acrescenta.
--
-- Sem chave estrangeira para usuários e contas, também de propósito. O nome de
-- quem agiu e o rótulo do alvo são copiados no momento do registro; amarrá-los
-- por referência faria o histórico apagar-se junto com quem saiu da equipe —
-- exatamente quem se quer poder auditar.
create table if not exists historico (
  id text primary key,
  em timestamptz not null,
  usuario_id text,
  usuario_nome text not null,
  projeto_id text,
  projeto_nome text,
  acao text not null,
  alvo_id text,
  alvo_rotulo text,
  detalhes jsonb,
  ip text
);

create index if not exists historico_por_data on historico (em desc);
create index if not exists historico_por_usuario on historico (usuario_id, em desc);
create index if not exists historico_por_acao on historico (acao, em desc);

-- Evolução do esquema
--
-- "create table if not exists" cria a tabela nova, mas não toca em tabela que
-- já existe: um banco criado antes de uma coluna nova continuaria sem ela, e a
-- aplicação quebraria na primeira consulta — falhando na leitura do estado, que
-- é o pior lugar para falhar. "add column if not exists" é idempotente e
-- resolve o caso aditivo, que é a esmagadora maioria.
--
-- Mudança que remove ou renomeia coluna não cabe aqui: aí é migração de
-- verdade, com passo de conversão dos dados.
alter table projetos add column if not exists ordem integer not null default 0;
alter table usuarios add column if not exists ordem integer not null default 0;
alter table contas add column if not exists ordem integer not null default 0;
alter table usuarios add column if not exists senha_hash text;
alter table publicacoes add column if not exists origem_evento_id text;
alter table usuarios add column if not exists area text;
alter table usuarios add column if not exists telefone text;
`;

/**
 * Ordem de remoção para a regravação completa do estado.
 *
 * Da folha para a raiz: mesmo com `on delete cascade` declarado, apagar na
 * ordem certa mantém o comportamento previsível se alguém remover uma
 * referência do esquema no futuro.
 *
 * `historico` não está aqui e não deve entrar — ver o comentário da tabela.
 */
export const TABELAS_EM_ORDEM_DE_LIMPEZA = [
  "respostas",
  "interacoes",
  "eventos",
  "relatorio_contas",
  "relatorios",
  "impulsionamentos",
  "publicacao_contas",
  "publicacoes",
  "atualizacoes_manuais",
  "metricas_diarias",
  "publico",
  "contas",
  "usuario_projetos",
  "usuarios",
  "projetos",
] as const;
