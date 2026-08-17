# Conectar as contas de verdade

O plano para sair da demonstração e passar a ler e publicar nas contas reais da
campanha — as seis redes, em que ordem, e o que custa cada uma.

Este documento é o mapa. O detalhe da Meta, que é a maior parte do trabalho,
está em [`integracao-meta.md`](integracao-meta.md).

## A regra que vale para todas

**Ninguém digita a senha da rede social aqui.** Nunca haverá um campo "senha do
Instagram" nesta plataforma. Todas as redes proíbem, e por um motivo prático
antes de ser jurídico: coletar senha de rede em aplicativo de terceiro leva ao
bloqueio da conta do cliente **e** do aplicativo. O caminho é sempre o mesmo —
a pessoa é levada ao site da rede, entra lá, escolhe o que autorizar, e volta.

A consequência boa: a senha nunca passa por nós, o cliente vê exatamente quais
permissões está dando, e revoga quando quiser sem trocar de senha.

**O token nunca vai para o navegador nem para o log.** Ele é cifrado com
AES-256-GCM (`SOCIAL_CRYPTO_KEY`) antes de encostar no banco. Um token de Página
publica e lê mensagens em nome do cliente e **não** deixa de valer quando ele
troca a senha — é credencial de verdade, tratada como tal.

## O que muda de trabalho para trabalho

Conectar uma rede tem sempre as mesmas quatro etapas. O que varia é quanto cada
uma custa:

1. **Criar o aplicativo** no portal de desenvolvedores da rede. Meia hora.
2. **Ligar o OAuth** — cadastrar a URL de retorno e preencher as variáveis.
   Meia hora, e o código já existe.
3. **Testar com a própria conta**, enquanto o app está em modo de
   desenvolvimento. É aqui que se descobre se o caminho inteiro funciona.
4. **Revisão do aplicativo**, para atender contas que não são a sua. **Esta é a
   etapa que leva semanas**, e é a única que não depende de programar.

A etapa 4 é o motivo de a ordem importar. Enquanto ela não termina, a rede só
funciona para contas na lista de testadores — o que já é o suficiente para
validar tudo com a conta da própria campanha.

## Ordem sugerida

### 1. Instagram e Facebook — começar por aqui, hoje

São o mesmo aplicativo na Meta e cobrem a maior parte do que a campanha faz. O
código está pronto: autorização, escolha de contas, token cifrado e leitura de
métricas. Falta criar o app e preencher `META_APP_ID`, `META_APP_SECRET`,
`META_REDIRECT_URI` e `SOCIAL_CRYPTO_KEY`.

A revisão da Meta pede verificação do negócio (documento da empresa), política
de privacidade publicada e um vídeo mostrando cada permissão em uso. **Comece a
verificação do negócio antes de tudo** — ela roda em paralelo e é a que mais
demora.

Falta implementar, além da revisão: publicar de verdade (hoje a conexão e a
leitura chamam a API; a escrita não), renovação automática de token, e a URL de
exclusão de dados que a Meta exige.

### 2. YouTube — a segunda mais simples

OAuth do Google, mesma mecânica. A YouTube Data API tem cota diária generosa
para leitura e o processo de verificação é mais previsível que o da Meta. Vale
como segunda porque as métricas de vídeo da campanha entram sem depender do
calendário da Meta.

### 3. LinkedIn — depende de aprovação de produto

O LinkedIn não libera as APIs de páginas por autoatendimento: é preciso pedir
acesso ao produto **Community Management API** e ser aprovado. Sem isso, o
OAuth conecta e não devolve nada de útil. Peça cedo, use depois.

### 4. TikTok — leitura primeiro

A Content Posting API exige revisão específica e tem regras próprias sobre o que
pode ser publicado por terceiro. A API de leitura (perfil e vídeos) entra bem
antes. Conectar só para ler já resolve o painel.

### 5. Threads — a mais nova

Tem API oficial, ligada à mesma conta Meta, e é a menos madura das seis.
Conectar depois que Instagram e Facebook estiverem estáveis evita misturar dois
problemas.

## Enquanto a revisão não sai

Duas saídas, e as duas já funcionam:

**Atualização manual.** A tela de Atualizar números aceita os valores digitados
de qualquer rede, com data. Não é o ideal, mas mantém a curva de crescimento
verdadeira desde o primeiro dia — e é o que evita o relatório com um mês de
buraco. Ver [`atualizacao-manual.md`](atualizacao-manual.md).

**Importar histórico.** Os arquivos que as próprias redes exportam entram pela
tela de Importar histórico, o que recupera o passado de uma vez.

## O que fazer nesta semana

1. Criar o aplicativo na Meta e iniciar a **verificação do negócio** — é o
   relógio mais longo, e ele só começa a correr quando alguém aperta o botão.
2. Publicar a **política de privacidade** num endereço próprio. É exigência da
   Meta e do Google, e ninguém escreve isso na véspera.
3. Preencher as quatro variáveis e conectar a conta da própria campanha em modo
   de desenvolvimento. Isso já exercita o caminho inteiro.
4. Decidir quais permissões pedir. Pedir só o que a campanha vai usar acelera a
   revisão e reduz o atrito na tela de autorização — os grupos estão em
   `src/lib/social/oauth/meta.ts`.

## Onde isso vive no código

| Arquivo                                | Papel                                                      |
| -------------------------------------- | ---------------------------------------------------------- |
| `src/lib/social/oauth/meta.ts`         | Lógica pura: URL de autorização, escopos, tradução de erro |
| `src/lib/social/oauth/meta.server.ts`  | Chamadas à Graph API                                       |
| `src/lib/social/cripto.server.ts`      | Cifragem dos tokens                                        |
| `src/lib/social/credenciais.server.ts` | Credenciais, `state` do OAuth e descobertas pendentes      |
| `src/routes/oauth.retorno.tsx`         | Tela de retorno, com a escolha das contas                  |
| `src/lib/social/networks.ts`           | Limites e capacidades de cada rede                         |

Acrescentar uma rede nova é acrescentar uma entrada em `networks.ts` e um módulo
de OAuth. Nenhum outro módulo precisa mudar.
