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
| `carla@ampliacao.com.br` | Editor | Métricas, publicação e caixa de entrada |
| `diego@ampliacao.com.br` | Atendimento | Somente a caixa de entrada |

## Mapa de rotas

| Rota | Módulo do PRD |
| --- | --- |
| `/social/entrar` | 3.1 — autenticação |
| `/social` | 3.2 — painel consolidado do projeto |
| `/social/contas` | 3.1 — conexões OAuth, tokens, permissões |
| `/social/conta/$accountId` | 3.2 — evolução histórica, orgânico x pago, público |
| `/social/publicacoes` | 3.3 — editor, calendário e fluxo de aprovação |
| `/social/impulsionamentos` | 3.4 — mídia paga |
| `/social/caixa` | 3.5 — caixa de entrada unificada |
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
- **Autenticação.** `autenticar` valida o e-mail contra os usuários semeados e o cliente guarda a
  sessão no `localStorage`. Ao plugar um provedor de identidade (ou cookie de sessão assinado), só
  `session.tsx` e essa função mudam.
- **Sincronização automática.** `sincronizarContaReal` lê a Graph API de verdade
  quando a conta foi conectada por OAuth, mas ainda é disparada por botão: falta
  o job periódico. As contas de demonstração continuam com histórico gerado por
  um PRNG semeado pelo id da conta — mesma entrada, mesma curva.
- **Tempo real da inbox.** A tela consulta o servidor a cada 15s e o store libera interações de uma
  fila para demonstrar a chegada de mensagens novas. Em produção isso vira webhook.
- **Persistência.** O store e o cofre de credenciais vivem em memória do
  processo: reiniciar o servidor recompõe a semente e exige reconectar as contas.
  É o próximo passo obrigatório antes de operar com clientes.

## Próximos passos para produção

1. Banco (Postgres) com as tabelas espelhando `types.ts`; `store.server.ts` e
   `credenciais.server.ts` viram repositórios.
2. App na Meta e App Review das permissões — o passo a passo está em
   [integracao-meta.md](./integracao-meta.md).
3. Rotação automática de token antes de `tokenExpiresAt` (a cifragem em repouso
   já existe).
4. Autorização por sessão nas funções de servidor: hoje elas confiam no
   `projectId` que o cliente envia.
5. Fila de jobs para sincronização, publicação agendada e reprocessamento em falha de API.
6. Webhooks de comentários e mensagens substituindo o polling da caixa de entrada.
7. Retenção e anonimização dos dados de público conforme a LGPD.

Adicionar uma rede nova exige apenas uma entrada em `NETWORKS` (`networks.ts`) com seus limites e
capacidades — nenhum outro módulo precisa mudar.
