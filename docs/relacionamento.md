# Gerenciamento de relacionamento

Todos os comentários e mensagens de todas as redes em um só lugar, com as
pessoas classificadas por grau de proximidade — e com o que dá e o que não dá
para fazer em massa, dito com clareza.

## O que a tela faz

| Recurso | Como funciona |
| --- | --- |
| Centralização | Comentários e mensagens de Instagram, Facebook, TikTok e YouTube na mesma lista, filtrável por rede |
| Grau de relação | Cada pessoa aparece como não seguidor, seguidor, apoiador ou defensor |
| Resposta individual | O painel de conversa de sempre, agora com modelos sugeridos pelo grau da pessoa |
| Resposta em lote | Marque vários e escreva uma vez; o texto sai personalizado por pessoa |
| Reclassificação | O grau é ajustável à mão e vale para todos os itens daquele `@handle` |

## Os quatro graus

A classificação automática sai do volume de interações da pessoa:

| Grau | A partir de | O que significa |
| --- | --- | --- |
| Não seguidor | 0 interações | Chegou pelo alcance. Uma boa resposta aqui converte. |
| Seguidor | 1 | Acompanha e interage de vez em quando. |
| Apoiador | 6 | Interage com frequência e responde bem a chamado direto. |
| Defensor | 20 | Compartilha, defende, traz gente nova. É quem amplifica. |

É um ponto de partida, não um veredito. A rede não entrega "esta pessoa me
segue" junto de cada comentário, então o número de interações é a melhor
evidência disponível — e a correção manual sempre vence a heurística, porque
quem conhece a base é o time.

Os limiares ficam em `RELACAO_INFO` (`src/lib/social/relacionamento.ts`).
Mudar um número muda a classificação inteira, e os testes acusam a mudança.

## Resposta em lote

Selecione várias interações e escreva **um** texto. Duas coisas acontecem antes
do envio:

**1. O texto é personalizado.** `{nome}` vira o primeiro nome de quem recebe e
`{handle}` vira o @ da pessoa. A prévia mostra exatamente como chega para os
três primeiros. Dez respostas com texto idêntico é o caminho mais curto para o
filtro de spam da rede — e para soar como robô.

**2. Quem não pode receber é separado, com o motivo.** A regra está em
`separarEnviaveis`:

| Situação | Resultado |
| --- | --- |
| Comentário público | Sempre pode ser respondido |
| Mensagem direta, últimas 24h, conta com mensageria aprovada | Pode |
| Mensagem direta fora da janela de 24h | Bloqueada, com o motivo na tela |
| Mensagem direta em conta sem permissão de mensageria | Bloqueada, com o motivo na tela |
| Qualquer item de conta com conexão expirada ou com erro | Bloqueado, com o motivo na tela |

Bloquear aqui evita uma tentativa que a API recusaria — ou, pior, que derrubaria
a conta por envio em massa.

## Mensagem em massa para todos os seguidores: não existe

Esta é a parte que precisa ficar registrada, porque é uma pergunta que sempre
volta.

**Não há como enviar mensagem direta para todos os seguidores.** Não é uma
limitação desta plataforma; é como as APIs funcionam:

- **Não existe API que liste seus seguidores.** Nem no Instagram, nem no
  Facebook, nem no TikTok. Sem a lista, não há para quem enviar.
- **A janela de 24 horas.** A Messenger Platform e a Instagram Messaging API só
  permitem responder alguém **depois** que essa pessoa escreveu, e só nas 24h
  seguintes. Fora disso, apenas *message tags* muito específicas (confirmação
  de evento, atualização pós-compra) — nenhuma serve para convocação ou
  divulgação.
- **Envio em massa não solicitado derruba a conta.** É violação explícita das
  políticas da plataforma. O risco não é a mensagem não sair: é perder o perfil.

Qualquer ferramenta que prometa isso está usando automação de navegador por
fora da API oficial. Funciona por algumas semanas e termina com a conta
restringida ou banida.

## O que funciona para o mesmo objetivo

Mobilizar quem já está do lado é possível — por caminhos que a rede aceita:

| Caminho | O que é | Onde entra na plataforma |
| --- | --- | --- |
| **Convocação dos defensores** | Responder em lote quem já interage, pedindo compartilhamento e reação nas primeiras horas | Pronto: filtre por "Defensor", selecione todos, use o modelo "Convocação" |
| **Resposta dentro da janela** | Quem mandou mensagem nas últimas 24h pode receber sua resposta — e uma resposta pode conter um convite | Pronto: o lote já respeita a janela |
| **Canal de transmissão do Instagram** | O criador manda uma mensagem para todo mundo que optou por entrar. É opt-in, e é o mais próximo do "DM em massa" que existe de forma legítima | Fora da API: criado no app do Instagram |
| **WhatsApp Business** | Listas de transmissão e mensagens de modelo aprovadas, para quem deu o número | Fora do escopo atual |
| **Públicos personalizados de engajamento** | A Meta permite anunciar para quem interagiu com o perfil nos últimos 365 dias. Não é mensagem, mas atinge exatamente o mesmo grupo | Via Meta Ads; a plataforma já lê o resultado pelo Windsor.ai |
| **Lista de e-mail** | O único canal que ninguém pode tirar de você | Fora do escopo atual |

A diferença prática: em vez de uma mensagem para dez mil pessoas que não pediram
nada, uma convocação para as cem que já demonstraram que se importam. O alcance
inicial é menor; o efeito no algoritmo, não — porque o que empurra um conteúdo é
a taxa de interação nas primeiras horas, e é justamente isso que os defensores
entregam.

## Como está implementado

| Arquivo | Papel |
| --- | --- |
| `src/lib/social/relacionamento.ts` | Lógica pura: classificação, consolidação por pessoa, modelos, regra de quem pode receber |
| `src/lib/social/relacionamento.test.ts` | Testes dos limiares, da consolidação e das regras de bloqueio |
| `src/lib/api/social.functions.ts` | `responderEmLote`, `classificarPessoa` |
| `src/routes/social/relacionamento.tsx` | A tela |

## O que foi verificado, e o que não

**Verificado no navegador.** Filtro por rede (incluindo YouTube e TikTok),
seleção múltipla, prévia com variáveis trocadas, envio em lote com retorno na
tela, e ausência de rolagem horizontal em 390px.

**Não verificado.** O envio real para a rede. A plataforma ainda opera com o
store em memória; a resposta é gravada localmente, não postada no Instagram ou
no Facebook. Ligar isso depende da integração direta com a Meta
([integracao-meta.md](./integracao-meta.md)) e da App Review das permissões de
mensageria.
