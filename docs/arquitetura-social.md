# Plataforma social — arquitetura e estado atual

Implementação do [PRD](./prd-plataforma-social.md) dentro desta base TanStack Start. O módulo vive
sob a rota `/social` e é independente do app de rádio que já existia no repositório: eles apenas
compartilham o design system (Tailwind v4 + shadcn/ui) e o shell do TanStack Router.

## Como abrir

```bash
bun install   # ou npm install
bun run dev
```

Acesse `http://localhost:5173/social`. A tela de login aceita qualquer senha para os usuários
semeados — cada um exerce um papel diferente:

| E-mail | Papel | O que enxerga |
| --- | --- | --- |
| `ana@ampliacao.com.br` | Administrador | Todos os módulos, incluindo Equipe |
| `bruno@ampliacao.com.br` | Gestor | Métricas, publicação, impulsionamento, relatórios |
| `carla@ampliacao.com.br` | Editor | Métricas, publicação e relacionamento |
| `diego@ampliacao.com.br` | Atendimento | Somente o relacionamento |

## Mapa de rotas

| Rota | Módulo do PRD |
| --- | --- |
| `/social/entrar` | 3.1 — autenticação |
| `/social` | 3.2 — painel consolidado do projeto |
| `/social/contas` | 3.1 — conexões OAuth, tokens, permissões |
| `/social/conta/$accountId` | 3.2 — evolução histórica, orgânico x pago, público |
| `/social/publicacoes` | 3.3 — editor, calendário e fluxo de aprovação |
| `/social/publicacao/$postId` | 3.3 — detalhe da publicação, desempenho e republicação |
| `/social/impulsionamentos` | 3.4 — mídia paga |
| `/social/relacionamento` | 3.5 — comentários e mensagens de todas as redes, com graus de relação e resposta em lote |
| `/social/atualizar` | 3.2 — entrada manual dos números, com exportação para o Git |
| `/social/relatorios` | 3.6 — geração e compartilhamento |
| `/social/equipe` | 3.7 — usuários e permissões |
| `/relatorio/$token` | 3.6 — página pública somente leitura (sem sessão) |
| `/oauth/retorno` | 3.1 — retorno da autorização da Meta e escolha das contas |

## Camadas

```
src/lib/social/types.ts        modelo de domínio (contas, métricas, posts, boosts, inbox…)
src/lib/social/networks.ts     capacidades e limites por rede + validação de rascunho
src/lib/social/analytics.ts    recorte por período, resumo, orgânico x pago, séries
src/lib/social/format.ts       formatação pt-BR (números, moeda, datas, rótulos)
src/lib/social/permissions.ts  o que cada papel pode acessar na interface
src/lib/social/relacionamento.ts  graus de relação, consolidação por pessoa e regra de envio em lote
src/lib/social/atualizacao.ts  entrada manual: aplicar valores ao histórico e comparar leituras do dia
src/lib/social/snapshot.ts     o estado como arquivo JSON, versionado e validado
src/lib/social/snapshot.server.ts  escolhe entre banco e arquivo, e grava
src/lib/social/banco/*        esquema, mapeamento e acesso ao Postgres
src/lib/social/post-analytics.ts  desempenho por publicação (divisão por conta, curva, engajamento)
src/lib/social/session.tsx     sessão do cliente + seletor de projeto
src/lib/social/store.server.ts persistência (hoje em memória, semeada de forma determinística)
src/lib/social/oauth/*         integração oficial com a Meta (OAuth + Graph API)
src/lib/social/cripto.server.ts  cifragem dos tokens das redes
src/lib/social/credenciais.server.ts  cofre de credenciais e state do OAuth
src/lib/api/social.functions.ts  API: toda leitura/escrita passa por server functions
src/components/social/*        primitivas de UI, gráficos (recharts) e editor de post
```

A regra que sustenta o resto: **a UI nunca toca no store**. Todo acesso a dado passa por uma
server function em `social.functions.ts`, então trocar o store em memória por um banco real — ou
pelos conectores oficiais das redes — fica restrito à camada de dados.

## O que é real e o que é simulado

Real, e implementado como o produto pede:

- Validação de formato por rede antes de publicar (limite de itens no carrossel, duração e
  proporção de vídeo, tamanho de arquivo, tamanho da legenda), com erros bloqueantes e avisos.
- Fluxo de aprovação: rascunho → aguardando aprovação → aprovado/agendado → publicado, com
  devolução para ajustes e registro de quem aprovou.
- Regras do impulsionamento: só publicações já feitas, em conta ativa, com conta de anúncios
  conectada e em rede que suporta anúncios via API; a campanha nasce em análise.
- Caixa de entrada com atribuição de responsável, marcação de status, notificação de novas
  interações e bloqueio de resposta quando a mensageria da conta não está aprovada.
- Isolamento por projeto em todos os módulos e permissões por papel.
- Preservação do histórico: desconectar uma conta não apaga suas métricas.
- Relatório público somente leitura, que responde apenas enquanto o link estiver ativo.

**Acesso e senhas.** A senha é conferida contra um hash scrypt e nunca entra no
repositório — ver [acesso.md](./acesso.md). Sem banco, a plataforma está em modo
demonstração e dispensa senha; com banco, conta sem senha não entra.

**Banco de dados.** Com `DATABASE_URL` definida, o estado vive em Postgres
(Neon, Supabase, qualquer um) em vez do arquivo JSON — ver
[banco-de-dados.md](./banco-de-dados.md). A troca acontece em um ponto só:
`snapshot.server.ts`. Nenhuma função de servidor mudou por causa dela.

**Atualização manual dos números.** Enquanto a leitura automática depende da
App Review, os números entram à mão e o estado vive em `dados/plataforma.json`,
que vai para o Git — ver [atualizacao-manual.md](./atualizacao-manual.md),
inclusive por que atualizar três vezes por dia não multiplica os pontos do
histórico.

**Relacionamento e envio em massa.** A área de relacionamento, os graus (não
seguidor, seguidor, apoiador, defensor) e a resposta em lote estão documentados
em [relacionamento.md](./relacionamento.md) — inclusive por que mensagem direta
para todos os seguidores não é possível em nenhuma rede, e o que funciona no
lugar disso.

**Conexão real com a Meta** (Instagram e Facebook) está implementada e é ligada por
variáveis de ambiente — ver [integracao-meta.md](./integracao-meta.md). Sem elas a
plataforma segue em modo demonstração e a tela de contas explica o que falta; com
elas, o botão passa a abrir a autorização oficial da Meta:

| Etapa | Onde |
| --- | --- |
| URL do diálogo e escopos por funcionalidade | `src/lib/social/oauth/meta.ts` |
| Troca de código, token longo, descoberta de contas, insights | `src/lib/social/oauth/meta.server.ts` |
| Tokens cifrados em repouso (AES-256-GCM) | `src/lib/social/cripto.server.ts` |
| Cofre de credenciais e `state` anti-CSRF | `src/lib/social/credenciais.server.ts` |
| Tela de retorno com escolha das contas | `src/routes/oauth.retorno.tsx` |

Simulado, porque este ambiente não tem credenciais nem banco:

- **Publicar, impulsionar e responder nas redes.** A conexão e a leitura de
  métricas chamam a Graph API de verdade; os endpoints de escrita entram depois
  da revisão das permissões pela Meta, que é o que os libera.
- **Autenticação.** A senha agora é real (scrypt com sal, ver
  [acesso.md](./acesso.md)). O que continua pendente é a sessão: ela vive no
  `localStorage`, sem expiração e sem cookie assinado.
- **Sincronização automática.** `sincronizarContaReal` lê a Graph API de verdade
  quando a conta foi conectada por OAuth, mas ainda é disparada por botão: falta
  o job periódico. As contas de demonstração continuam com histórico gerado por
  um PRNG semeado pelo id da conta — mesma entrada, mesma curva.
- **Tempo real da inbox.** A tela consulta o servidor a cada 15s e o store libera interações de uma
  fila para demonstrar a chegada de mensagens novas. Em produção isso vira webhook.
- **Persistência.** Resolvida: com `DATABASE_URL` o estado fica em Postgres, e
  sobrevive a reinício, deploy e troca de máquina. Sem ela, fica em
  `dados/plataforma.json`. O que continua em memória é o cofre de credenciais das
  redes — reiniciar ainda exige reconectar as contas conectadas por OAuth.

## Próximos passos para produção

1. ~~Banco (Postgres) com as tabelas espelhando `types.ts`.~~ Feito — falta
   mover `credenciais.server.ts` (os tokens das redes) para o banco também.
2. App na Meta e App Review das permissões — o passo a passo está em
   [integracao-meta.md](./integracao-meta.md).
3. Rotação automática de token antes de `tokenExpiresAt` (a cifragem em repouso
   já existe).
4. **Autorização por sessão nas funções de servidor** — hoje elas confiam no
   `projectId` que o cliente envia. É o item mais importante da lista: com dois
   clientes na mesma instalação, um consegue pedir os dados do outro.
5. Fila de jobs para sincronização, publicação agendada e reprocessamento em falha de API.
6. Webhooks de comentários e mensagens substituindo o polling do relacionamento.
7. Retenção e anonimização dos dados de público conforme a LGPD.

Adicionar uma rede nova exige apenas uma entrada em `NETWORKS` (`networks.ts`) com seus limites e
capacidades — nenhum outro módulo precisa mudar.
