# Conectar Instagram e Facebook de verdade

Como sair do modo demonstração e passar a ler e publicar nas contas reais dos
clientes. A parte de código já está pronta — o que falta é criar o aplicativo na
Meta e preencher quatro variáveis.

## O que a pessoa vê no fim

Um botão **Conectar com Facebook** na tela de contas. Ao clicar, ela vai para a
página da Meta, entra com a conta dela **lá**, escolhe quais Páginas autorizar, e
volta para a plataforma com as contas prontas para selecionar. Dois cliques.

**Por que não pedir o login do Instagram direto no nosso formulário:** a Meta
proíbe, e com razão. Coletar a senha de uma rede social em app de terceiro leva a
bloqueio da conta do cliente e do aplicativo. O OAuth resolve melhor para todos:
a senha nunca passa por nós, o cliente vê exatamente quais permissões está dando,
e pode revogar o acesso quando quiser sem trocar de senha.

## Pré-requisitos do lado do cliente

Antes de conectar, a conta do cliente precisa estar assim — vale conferir na
reunião de onboarding, porque é a causa mais comum de "não aparece nenhuma conta":

- O perfil do Instagram é **profissional** (Comercial ou Criador de conteúdo).
- Esse perfil está **vinculado a uma Página do Facebook**.
- A pessoa que vai autorizar é **administradora** dessa Página.
- Para impulsionar: existe uma **conta de anúncios** no Gerenciador de Negócios,
  com a Página associada.

## Passo 1 — Criar o aplicativo na Meta

1. Acesse **developers.facebook.com** → *Meus aplicativos* → *Criar aplicativo*.
2. Tipo: **Empresa**.
3. Adicione os produtos:
   - **Login do Facebook** (é o que faz a autorização)
   - **Instagram** (API com login do Facebook)
   - **Marketing API**, se for usar impulsionamento.
4. Em *Login do Facebook → Configurações*, cadastre em **URIs de
   redirecionamento do OAuth válidos** exatamente a mesma URL que você vai pôr em
   `META_REDIRECT_URI`. Um caractere diferente e a Meta recusa.
   - Desenvolvimento: `http://localhost:5173/oauth/retorno`
   - Produção: `https://seu-dominio.com.br/oauth/retorno`

## Passo 2 — Preencher as variáveis

Copie `.env.example` para `.env` e preencha:

| Variável | Onde encontrar |
| --- | --- |
| `META_APP_ID` | App → Configurações → Básico → ID do aplicativo |
| `META_APP_SECRET` | Mesma tela → Chave secreta do aplicativo |
| `META_REDIRECT_URI` | A URL que você cadastrou no passo 1 |
| `SOCIAL_CRYPTO_KEY` | Gere com `openssl rand -base64 32` |

A chave de criptografia protege os tokens guardados. Um token de Página permite
publicar e ler mensagens em nome do cliente e **não** deixa de valer quando ele
troca a senha — por isso nunca é gravado em texto puro. Trocar essa chave depois
invalida os tokens e exige reconectar as contas.

Reinicie a aplicação. A tela de contas deixa de mostrar o aviso de configuração e
o botão passa a ser *Conectar com Facebook*.

## Passo 3 — Testar em modo desenvolvimento

Enquanto o app está em desenvolvimento na Meta, **só funciona para quem está na
lista de testadores** — o que é ótimo para validar sem esperar revisão:

1. App → *Funções* → adicione sua conta como Administrador ou Testador.
2. Conecte uma Página sua e rode uma sincronização.

Isso já exercita o caminho completo: autorização, escolha de contas, token
cifrado e leitura de métricas.

## Passo 4 — Revisão do aplicativo (App Review)

Para atender contas de clientes, a Meta exige revisão de cada permissão. É aqui
que o prazo mora: verificação do negócio e a análise costumam levar semanas, e a
Meta pede vídeo mostrando o uso de cada permissão dentro do produto.

| Grupo no código | Permissões | Para quê |
| --- | --- | --- |
| `leitura` | `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` | Métricas e curva de crescimento |
| `publicacao` | `pages_manage_posts`, `instagram_content_publish` | Publicar imagem, carrossel e vídeo |
| `atendimento` | `pages_manage_engagement`, `pages_messaging`, `instagram_manage_comments`, `instagram_manage_messages` | Caixa de entrada unificada |
| `anuncios` | `ads_management`, `ads_read`, `business_management` | Impulsionamento |

Os grupos ficam em `src/lib/social/oauth/meta.ts`. Pedir só o que o cliente vai
usar acelera a revisão e reduz o atrito na tela de autorização — a plataforma
solicita por padrão `leitura`, `publicacao` e `atendimento`.

Também será exigido:

- **Verificação do negócio** (documento da empresa).
- **Política de privacidade** publicada em URL própria.
- **URL de exclusão de dados** — a Meta chama esse endereço quando um usuário
  pede remoção. Ainda não implementado; entra junto com o trabalho de LGPD.

## O que acontece quando algo falha

O código traduz os erros da Meta em instrução, não em código:

| Situação | O que a plataforma diz |
| --- | --- |
| Token revogado ou expirado (código 190) | "A autorização desta conta expirou ou foi revogada. Reconecte a conta." |
| Limite de chamadas (429, códigos 4 e 17) | "A Meta está limitando as chamadas agora." |
| Falta permissão (código 200) | "Faltam permissões para esta conta." |
| Nenhuma Página na conta | Explica que o Instagram precisa ser profissional e vinculado a uma Página |

## Como está implementado

| Arquivo | Papel |
| --- | --- |
| `src/lib/social/oauth/meta.ts` | Lógica pura: URL de autorização, escopos, tradução das respostas |
| `src/lib/social/oauth/meta.server.ts` | Chamadas à Graph API, com `fetch` injetável para teste |
| `src/lib/social/cripto.server.ts` | Cifragem dos tokens (AES-256-GCM) |
| `src/lib/social/credenciais.server.ts` | Guarda credenciais, `state` do OAuth e descobertas pendentes |
| `src/routes/oauth.retorno.tsx` | Tela de retorno com a escolha das contas |
| `src/lib/api/social.functions.ts` | `iniciarConexaoMeta`, `concluirConexaoMeta`, `conectarContasEscolhidas`, `sincronizarContaReal` |

Rode `npm test` para exercitar a lógica de OAuth, o mapeamento de insights e a
cifragem — 27 testes, sem depender de rede.

## Limitações conhecidas neste estágio

- **As credenciais vivem na memória do processo.** Reiniciar o servidor exige
  reconectar as contas. É o próximo passo obrigatório: banco de dados.
- **Publicar, impulsionar e responder** ainda não chamam a API — a conexão e a
  leitura de métricas chamam. Os endpoints de escrita entram depois da revisão
  das permissões, que é o que os libera de fato.
- **Renovação automática de token** não está implementada; a plataforma avisa
  quando faltam 15 dias para expirar e a reconexão é manual.
- **TikTok e LinkedIn** têm o modelo pronto, sem integração (Fase 4 do PRD).
