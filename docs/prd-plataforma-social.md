# PRD — Plataforma de Gestão e Métricas de Redes Sociais

**Versão 1.0 · Agosto de 2026**
Preparado para: Ampliação Marketing Digital

> Documento de requisitos que originou o módulo `/social` desta base de código.
> As notas de implementação estão em [`arquitetura-social.md`](./arquitetura-social.md).

## 1. Visão Geral

### 1.1 Contexto

O projeto consiste em uma plataforma web para gestão centralizada de redes sociais, construída
para agências e gestores de marketing que precisam acompanhar, publicar e impulsionar conteúdo em
múltiplas contas sociais a partir de um único painel. A plataforma nasce a partir de um sistema já
iniciado no Lovable, com escopo deliberadamente restrito à camada social — sem qualquer integração
com e-commerce, loja, vendas ou catálogo de produtos.

### 1.2 Problema

Hoje o acompanhamento de redes sociais está fragmentado: métricas de crescimento ficam dentro de
cada rede, o histórico de evolução das contas não é comparável ao longo do tempo, e conversas com
seguidores (comentários e mensagens diretas) exigem alternar entre vários aplicativos nativos para
responder. Isso atrasa a resposta ao público e dificulta enxergar o que está funcionando em
orgânico versus pago.

### 1.3 Proposta de Valor

- Visão unificada e histórica do crescimento de cada conta social, com evolução desde o início do
  acompanhamento.
- Análise detalhada do público (seguidores/perfis que interagem), não apenas números soltos.
- Publicação nativa de formatos simples (imagem única, carrossel e vídeo) sem depender de outra
  ferramenta.
- Impulsionamento de publicações (mídia paga) integrado ao mesmo fluxo do orgânico.
- Caixa de entrada unificada de comentários e mensagens diretas, com resposta em tempo real.

### 1.4 Fora de Escopo

Fica explicitamente fora do escopo desta plataforma: e-commerce, integração com lojas
(WooCommerce, Mercado Livre ou similares), catálogo de produtos, carrinho, pedidos e qualquer
fluxo de vendas. O produto é 100% voltado à operação social (orgânico e pago).

## 2. Personas e Casos de Uso

| Persona | Necessidade principal | Uso na plataforma |
| --- | --- | --- |
| Gestor de tráfego / social media | Ver rapidamente o que está crescendo e o que precisa de ajuste | Dashboards de crescimento, comparação orgânico x pago |
| Criador de conteúdo | Publicar sem fricção nos formatos certos | Editor de post (imagem, carrossel, vídeo) com agendamento |
| Atendimento / community management | Responder comentários e DMs sem perder tempo trocando de app | Caixa de entrada unificada em tempo real |
| Gestor da agência / dono da conta | Enxergar evolução do projeto ao longo do tempo para justificar investimento | Relatórios de evolução histórica por conta |

## 3. Escopo Funcional por Módulo

### 3.1 Autenticação e Contas Conectadas

**Objetivo.** Permitir login seguro e conexão das contas de redes sociais que serão monitoradas e
operadas.

**Funcionalidades**

- Login/cadastro do usuário da plataforma.
- Conexão de contas via OAuth oficial de cada rede (Instagram, Facebook, TikTok, LinkedIn —
  conforme prioridade definida).
- Painel de status de cada conexão (ativa, expirada, com erro de permissão).

**Regras de negócio**

- Uma conta de usuário pode gerenciar múltiplos perfis sociais.
- Tokens de acesso são renovados automaticamente quando a rede permitir; caso contrário, o usuário
  é notificado para reconectar.

### 3.2 Métricas e Análise de Crescimento

**Objetivo.** Dar visibilidade clara e histórica sobre o crescimento das redes, separando origem
orgânica e paga.

**Funcionalidades**

- Dashboard geral por conta: seguidores, alcance, engajamento, evolução no período.
- Linha do tempo de evolução da conta desde o início do acompanhamento (curva de crescimento).
- Comparativo orgânico versus pago (impressões, alcance, engajamento, custo quando aplicável).
- Análise de perfil dos seguidores/público que interage (quando a API da rede disponibilizar o
  dado): novos seguidores, perfis que mais interagem, horários de maior atividade.
- Filtros por período, por rede social e por conta.

**Regras de negócio**

- Dados são sincronizados periodicamente (frequência dependente do limite de cada API oficial).
- Histórico é preservado mesmo que a conta seja desconectada temporariamente.

### 3.3 Publicação de Conteúdo (Orgânico)

**Objetivo.** Permitir criar e publicar conteúdo diretamente nas redes conectadas, nos formatos
mais usados.

**Funcionalidades**

- Editor de publicação para os formatos: imagem única, carrossel (múltiplas imagens) e vídeo.
- Agendamento de publicações com calendário de conteúdo.
- Fluxo de aprovação opcional antes da publicação (rascunho → aprovação → publicado).
- Publicação simultânea em mais de uma rede, quando o conteúdo for compatível.

**Regras de negócio**

- Cada rede social tem limites próprios de formato (proporção de vídeo, número de itens no
  carrossel, tamanho de arquivo); a plataforma valida antes de publicar.

### 3.4 Impulsionamento (Mídia Paga)

**Objetivo.** Permitir transformar uma publicação orgânica em campanha paga sem sair da
plataforma.

**Funcionalidades**

- Impulsionar uma publicação já feita, definindo orçamento, duração e público-alvo básico.
- Acompanhamento do desempenho do impulsionamento dentro do mesmo painel de métricas.
- Histórico de impulsionamentos por conta e por post.

**Regras de negócio**

- O impulsionamento depende da conta de anúncios estar conectada e com permissão ativa na
  respectiva rede.

### 3.5 Caixa de Entrada Unificada (Comentários e Mensagens)

**Objetivo.** Centralizar comentários em publicações e mensagens diretas de todas as contas
conectadas em um só lugar, com resposta em tempo real.

**Funcionalidades**

- Feed único com comentários e mensagens diretas de todas as redes conectadas.
- Resposta direta pela plataforma, refletida na rede de origem em tempo real.
- Marcação de itens como respondidos/pendentes e atribuição a um responsável.
- Notificação de novas interações.

**Regras de negócio**

- Depende de permissões oficiais de mensageria de cada rede (ex.: permissões de gestão de
  comentários e de mensagens da Meta), sujeitas a processo de aprovação do aplicativo.
- Tempo de sincronização das mensagens está limitado pelas políticas de webhook/rate limit de cada
  plataforma.

### 3.6 Relatórios

**Objetivo.** Consolidar os dados de crescimento, publicações e impulsionamento em relatórios
apresentáveis.

**Funcionalidades**

- Geração de relatório por período e por conta.
- Exportação e/ou link de compartilhamento público (somente leitura).

### 3.7 Administração

- Gestão de usuários e permissões de acesso à plataforma.
- Gestão das contas sociais conectadas por cliente/projeto.

## 4. Fluxos Principais

1. **Onboarding:** cadastro → conexão da primeira conta social → primeira sincronização de dados.
2. **Publicar conteúdo:** criar post → escolher formato → (opcional) aprovação → publicar ou
   agendar.
3. **Impulsionar:** selecionar post publicado → definir orçamento/público/duração → acompanhar
   resultado.
4. **Responder interação:** nova mensagem/comentário chega na caixa unificada → responder → status
   atualizado.
5. **Acompanhar evolução:** abrir dashboard da conta → selecionar período → analisar curva de
   crescimento e comparativo orgânico x pago.

## 5. Requisitos Não Funcionais

- **Segurança:** isolamento de dados entre clientes/projetos; tokens de redes sociais armazenados
  de forma criptografada.
- **Performance:** dashboards devem carregar com dados já sincronizados (cache), sem depender de
  chamada síncrona às APIs das redes a cada acesso.
- **Disponibilidade:** sincronizações e respostas de mensagens devem ter reprocessamento
  automático em caso de falha temporária da API externa.
- **Conformidade:** tratamento de dados pessoais de seguidores/público em conformidade com a LGPD.
- **Escalabilidade:** arquitetura preparada para adicionar novas redes sociais sem redesenho do
  modelo de dados.

## 6. Métricas de Sucesso do Produto

| Indicador | Meta (a validar) |
| --- | --- |
| Tempo médio de resposta a comentários/mensagens | _[preencher]_ |
| Contas sociais conectadas ativamente | _[preencher]_ |
| Publicações feitas via plataforma vs. manual | _[preencher]_ |
| Adoção do módulo de impulsionamento | _[preencher]_ |

## 7. Roadmap por Fases

**Fase 1 — Fundação**

- Autenticação, conexão de contas (Instagram e Facebook como prioridade).
- Dashboard básico de métricas de crescimento (orgânico).

**Fase 2 — Publicação**

- Editor de publicação (imagem, carrossel, vídeo) e agendamento.
- Fluxo de aprovação de conteúdo.

**Fase 3 — Pago e Caixa de Entrada**

- Módulo de impulsionamento de publicações.
- Caixa de entrada unificada de comentários e mensagens com resposta em tempo real.

**Fase 4 — Expansão**

- Novas redes sociais (TikTok, LinkedIn).
- Relatórios avançados e compartilhamento público.

> **Observação:** prazos, metas numéricas e orçamento não foram informados e entram como
> estimativas a preencher — nenhum número foi inventado neste documento.
