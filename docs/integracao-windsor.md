# Windsor.ai — dados reais sem esperar a Meta

Caminho alternativo (e mais curto) para trazer números reais para a plataforma.

## Por que este caminho existe

A integração direta com a Meta ([integracao-meta.md](./integracao-meta.md)) é a
mais completa, mas depende de **App Review**: verificação do negócio, vídeo
demonstrando cada permissão, semanas de espera. Enquanto isso, a plataforma fica
sem dado real.

O Windsor.ai resolve esse intervalo. Ele é um agregador: o cliente conecta as
contas **lá** — Meta Ads, Google Ads, TikTok Ads, GA4, Instagram orgânico e mais
de 350 fontes — e a plataforma lê tudo com **uma única chave de API**. Nenhuma
revisão de aplicativo envolvida, porque quem tem a relação com a Meta é o
Windsor, não a gente.

| | Meta direto | Windsor.ai |
| --- | --- | --- |
| Prazo para o primeiro dado | semanas (App Review) | minutos |
| O que o cliente faz | autoriza no OAuth da nossa plataforma | conecta a conta no painel do Windsor |
| Custo | só o desenvolvimento | assinatura do Windsor |
| Publicar e responder mensagens | sim, depois da revisão | não (o Windsor é leitura + ações de anúncio) |

Os dois convivem: o Windsor cobre a mídia paga desde já, e a integração direta
com a Meta entra quando a revisão sair, para publicar e atender.

## Como ligar

1. Conecte as contas do cliente em **windsor.ai** (ou peça para ele conectar as
   dele — o Windsor tem um link de autorização por conector).
2. Copie a chave de API do painel do Windsor.
3. Preencha no ambiente:

```
WINDSOR_API_KEY=sua-chave
# Opcional: aponta para um proxy interno ou ambiente de testes
# WINDSOR_BASE_URL=https://connectors.windsor.ai
```

Reinicie a aplicação. Em **Impulsionamentos**, a seção "Mídia paga real
(Windsor.ai)" passa a listar as campanhas de verdade, com investido, alcance,
CPM e CPC — e um seletor de período de 30 dias a 2 anos.

## O que a plataforma faz com esses dados

| Função | O que faz |
| --- | --- |
| `situacaoWindsor` | Diz se a chave está configurada e lista os conectores relevantes ao escopo social |
| `listarCampanhasWindsor` | Campanhas consolidadas: investido, alcance, impressões, cliques, CPM, CPC, dias de veiculação |
| `sincronizarPagoWindsor` | Traz a mídia paga para o histórico de uma conta, preenchendo **só** os campos pagos |

Essa última separação é deliberada: o orgânico continua vindo da rede e o pago
vem do Windsor. Misturar as duas origens quebraria justamente o comparativo
orgânico x pago que o PRD 3.2 pede.

## Conectores mapeados

Só os que pertencem ao escopo social do produto — e-commerce, CRM e finanças
ficam de fora por decisão do PRD (seção 1.4):

| Conector | O que traz |
| --- | --- |
| `facebook` | Meta Ads (Facebook e Instagram) — pago |
| `tiktok` | TikTok Ads — pago |
| `linkedin` | LinkedIn Ads — pago |
| `instagram_public` | Instagram orgânico |
| `facebook_organic` | Facebook orgânico |

A lista fica em `CONECTORES_SOCIAIS` (`src/lib/social/windsor/windsor.ts`).

## Como está implementado

| Arquivo | Papel |
| --- | --- |
| `src/lib/social/windsor/windsor.ts` | Lógica pura: agrupar por dia, consolidar campanhas, calcular CPM e CPC |
| `src/lib/social/windsor/cliente.server.ts` | Chamada HTTP, com `fetch` injetável e erros traduzidos |
| `src/lib/api/social.functions.ts` | As três funções da tabela acima |
| `src/routes/social/impulsionamentos.tsx` | A seção "Mídia paga real" |

## O que foi verificado, e o que não

**Verificado com dados reais.** Os testes de mapeamento usam linhas copiadas de
uma resposta de verdade do Windsor para a conta de Meta Ads conectada — não são
dados inventados. Se o formato mudar, os testes acusam. Rode `npm test`.

**Não verificado.** A chamada HTTP a partir da aplicação não foi executada
contra o Windsor: exige a chave de API no ambiente, que não existe aqui. O
tratamento de resposta e de erro está coberto por teste com `fetch` simulado,
mas a primeira chamada real é o teste que falta.

## Limitações

- **O Windsor lê; publicar continua sendo com a Meta.** Ele oferece ações de
  anúncio (pausar campanha, ajustar orçamento, impulsionar publicação), mas não
  publica conteúdo orgânico nem responde mensagens.
- **A granularidade é de campanha por dia.** Métricas por publicação exigem
  campos adicionais do conector.
- **Plano.** A conta usada na verificação está em Trial; limites de volume e de
  histórico dependem do plano contratado.
