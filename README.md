# Social Hub — Ampliação Marketing Digital

Plataforma web para gestão centralizada de redes sociais: acompanhar crescimento, publicar,
impulsionar e responder comentários e mensagens de várias contas a partir de um único painel.

O escopo é deliberadamente restrito à camada social (orgânico e pago) — sem e-commerce, catálogo,
carrinho ou qualquer fluxo de vendas.

- [PRD completo](./docs/prd-plataforma-social.md)
- [Arquitetura e estado atual](./docs/arquitetura-social.md) — inclui o que já é real e o que
  ainda é simulado neste estágio

## Rodando localmente

```bash
bun install     # ou npm install
bun run dev     # ou npm run dev
```

A aplicação sobe em `http://localhost:5173` e a raiz já abre o painel.

Na tela de login qualquer senha é aceita; o e-mail define o papel e, com ele, os módulos visíveis:

| E-mail | Papel | Enxerga |
| --- | --- | --- |
| `ana@ampliacao.com.br` | Administrador | tudo, inclusive Equipe |
| `bruno@ampliacao.com.br` | Gestor | métricas, publicação, impulsionamento, relatórios |
| `carla@ampliacao.com.br` | Editor | métricas, publicação, caixa de entrada |
| `diego@ampliacao.com.br` | Atendimento | somente a caixa de entrada |

## Módulos

| Rota | O que faz |
| --- | --- |
| `/social` | Painel consolidado: seguidores, alcance, engajamento, investimento e curva de crescimento |
| `/social/contas` | Conexões OAuth: status, expiração de token, mensageria e conta de anúncios |
| `/social/conta/$id` | Evolução desde o início do acompanhamento, orgânico x pago e perfil do público |
| `/social/publicacoes` | Editor (imagem, carrossel, vídeo), calendário e fluxo de aprovação |
| `/social/impulsionamentos` | Mídia paga sobre publicações já feitas |
| `/social/caixa` | Comentários e mensagens diretas unificados, com resposta e atribuição |
| `/social/relatorios` | Geração de relatórios e link público somente leitura |
| `/social/equipe` | Usuários, papéis e projetos |
| `/relatorio/$token` | Relatório público, sem sessão |

## Stack

TanStack Start (SSR + rotas por arquivo), React 19, Tailwind CSS v4 com shadcn/ui, TanStack Query,
recharts e Zod. Os dados hoje vivem em um store em memória semeado de forma determinística; toda
leitura e escrita passa por server functions, então trocá-lo por um banco ou pelos conectores
oficiais das redes não afeta rotas nem componentes.

## Scripts

| Comando | Para quê |
| --- | --- |
| `bun run dev` | Servidor de desenvolvimento |
| `bun run build` | Build de produção |
| `bun run lint` | ESLint + Prettier |
| `bun run format` | Formata o projeto |
