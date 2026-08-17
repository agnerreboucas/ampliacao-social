# Hospedagem

Como colocar a plataforma no ar, e por que as escolhas são estas.

## O formato que a aplicação pede

**Um processo Node que fica de pé.** Não serverless, não edge. Três coisas
levam a isso:

- O estado é lido do banco **uma vez, na subida**, e mantido em memória para que
  as consultas das telas não voltem ao Postgres a cada clique. Num modelo de
  função efêmera, essa leitura aconteceria a cada partida a frio — devagar e
  caro em conexões.
- A senha usa `scrypt` e os tokens das redes usam cifra do `node:crypto`. Nem
  tudo isso existe nos runtimes de edge.
- O driver do Postgres (`pg`) abre conexão TCP, que edge não oferece.

O pacote de configuração do projeto vem apontado para Cloudflare Workers por
padrão. Rodar ali é possível, mas exigiria trocar o driver do banco, abandonar a
derivação de senha atual e repensar a leitura do estado — reescrita de camada de
dados, não ajuste de implantação.

Qualquer hospedagem que rode um processo Node serve: um VPS, Render, Railway,
Fly, App Runner, ou uma máquina na infraestrutura da agência.

## Gerar o pacote

```bash
npm run build
npm start
```

O build sai em **`.output`** — `.output/server/index.mjs` é o servidor e
`.output/client` são os arquivos do navegador. É a convenção do nitro, que é
onde toda hospedagem procura.

Duas coisas acontecem aí, e vale saber por quê:

**O alvo padrão fora do sandbox do Lovable é `node-server`.** O plugin do nitro
só liga sozinho quando reconhece aquele ambiente; em qualquer outro lugar um
`npm run build` cru terminava com sucesso e não gerava servidor nenhum — só um
aviso no meio do log e uma implantação que não achava o que publicar. Dentro do
sandbox nada muda: o fluxo de lá continua publicando de `dist`.

**`scripts/preparar-saida.mjs` move o build de `dist` para `.output`** depois do
`vite build`. O vite escreve em `dist` e o bundle do servidor referencia os
arquivos do navegador por caminho relativo, então a pasta é movida inteira, com
os nomes preservados.

`NITRO_PRESET` continua valendo para quem quiser outro alvo.

## Variáveis de ambiente

| Variável                                              | Obrigatória   | Para quê                                                                                      |
| ----------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | sim           | Endereço do Postgres. Sem ela a plataforma sobe em modo demonstração, com dados semeados.     |
| `SESSION_SECRET`                                      | sim           | Chave que sela o cookie de sessão. Mínimo de 32 caracteres.                                   |
| `ADMIN_EMAIL`                                         | sim           | Quem vira o primeiro administrador numa instalação nova.                                      |
| `NODE_ENV`                                            | sim           | `production`. É o que liga a conferência de subida e o cookie seguro.                         |
| `ADMIN_NOME`                                          | não           | Nome desse administrador. Sem ela, a parte do e-mail antes do @.                              |
| `PROJETO_INICIAL`                                     | não           | Nome do primeiro projeto. Padrão: "Campanha".                                                 |
| `PORT`                                                | não           | Porta onde escutar. Padrão 3000.                                                              |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | não           | Conexão com Instagram e Facebook. Sem elas, a tela de conexão avisa que não está configurada. |
| `WINDSOR_API_KEY`                                     | não           | Números de mídia paga pelo Windsor.ai.                                                        |
| `SOCIAL_CRYPTO_KEY`                                   | se usar OAuth | Cifra os tokens das redes guardados no banco. `openssl rand -base64 32`.                      |

### A subida é interrompida se faltar o obrigatório

Com `NODE_ENV=production`, a aplicação **não atende requisição nenhuma** sem
`DATABASE_URL`, `ADMIN_EMAIL` e um `SESSION_SECRET` de pelo menos 32 caracteres.
O log diz qual variável falta, por que ela importa e como gerar o valor.

Derrubar em vez de avisar é deliberado: **sem banco a plataforma entra em modo
demonstração, e em demonstração qualquer senha entra.** Num arquivo que se manda
por mensagem isso é correto; num endereço público é catastrófico — quem
descobrir a URL entra como administrador da campanha. Um aviso no log de uma
hospedagem é um aviso que ninguém lê.

Gerar a chave de sessão:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

**Nenhuma dessas variáveis pode entrar no repositório.** O `.env` está no
`.gitignore`; em servidor, elas são configuradas no painel do provedor.

## HTTPS não é opcional

O cookie de sessão é emitido com `Secure` na build de produção. Servir em
**http puro quebra o login em silêncio**: o navegador não devolve o cookie, e
cada ação responde "sua sessão expirou" sem qualquer pista da causa.

Praticamente todo provedor entrega HTTPS junto com o domínio. Num servidor
próprio, um proxy com certificado do Let's Encrypt resolve.

Para conferir a build de produção **na própria máquina**, onde não há
certificado, existe uma saída explícita:

```bash
SESSAO_SEM_TLS=sim NODE_ENV=production npm start
```

Ela imprime um aviso no log a cada requisição de sessão. Não use em servidor
exposto.

## Conferir antes de anunciar

Os três roteiros de verificação aceitam o endereço, então dá para apontá-los
para a instalação real e ver o comportamento verdadeiro, não o de
desenvolvimento:

```bash
BASE=https://seu-endereco \
EMAIL=... SENHA=... PROJETO=proj-x ALHEIOS=proj-y \
  node scripts/verificar-autorizacao.mjs

BASE=https://seu-endereco ADMIN_EMAIL=... ADMIN_SENHA=... \
  node scripts/verificar-historico.mjs

BASE=https://seu-endereco EMAIL=... SENHA=... \
  node scripts/verificar-pdf.mjs
```

O de autorização precisa de uma conta com acesso a **um** projeto só, e de pelo
menos um projeto ao qual ela não tenha acesso — é isso que ele tenta invadir.

## Banco de dados

Qualquer Postgres 14 ou mais novo. O esquema é criado sozinho na primeira
subida; não há passo de migração para rodar à mão.

Serviços gerenciados (Neon, Supabase, RDS) exigem TLS, e o driver já trata
disso. Postgres na mesma máquina normalmente não usa TLS — nesse caso o
endereço leva `?sslmode=disable`.

**Cópia de segurança.** Nada na plataforma faz isso. Configure o backup
automático no provedor do banco antes do primeiro dado real entrar. Um mês de
leituras diárias de uma campanha não se recupera digitando de novo.

## Primeira subida

1. Criar o banco e anotar o `DATABASE_URL`.
2. Gerar o `SESSION_SECRET`.
3. Subir com as variáveis obrigatórias. O esquema é criado sozinho.
4. Definir a senha do primeiro administrador:
   ```bash
   DATABASE_URL=... ADMIN_NOME="Nome de quem administra" \
   PROJETO_INICIAL="Campanha do cliente" \
     npm run senha -- pessoa@exemplo.com.br
   ```
   Com o banco vazio, este comando **cria a instalação**: um projeto e um
   administrador, e mais nada. Depois pede a senha duas vezes, e nunca a guarda
   em lugar nenhum além do hash.
5. Reiniciar, para a aplicação reler o banco.
6. Entrar, conferir o projeto e cadastrar as contas do cliente.
7. Importar o histórico pela tela de Importar histórico.
8. Ligar o backup do banco.

**Produção não recebe a semente de demonstração.** A semente tem três projetos
fictícios e cinco pessoas que não existem; gravá-la no banco de um cliente real
seria entregar a plataforma com dados de mentira dentro, para alguém apagar um
por um no dia em que a pressa é maior. Instalação nova nasce com um projeto e um
administrador — só isso.

## Hostinger, passo a passo

A Hostinger publica direto do GitHub. O que ela precisa saber:

| Campo             | Valor                     |
| ----------------- | ------------------------- |
| Comando de build  | `npm ci && npm run build` |
| Pasta de saída    | `.output`                 |
| Comando de início | `npm start`               |
| Versão do Node    | 20 ou mais nova           |
| Health check      | `/api/saude`              |

As variáveis de ambiente vão no painel da hospedagem, **nunca no repositório**.
No mínimo: `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`,
`ADMIN_EMAIL`.

Depois da primeira publicação, rode o `npm run senha` **com o mesmo
`DATABASE_URL`** — do terminal da Hostinger ou da sua máquina, tanto faz, porque
o comando fala com o banco e não com a aplicação. Reinicie e entre.

Se a implantação falhar dizendo que não achou a pasta de saída, confira se o
comando de build é o `npm run build` deste repositório: é ele que gera o
`.output`.

## Contêiner

O `Dockerfile` na raiz existe para a aplicação rodar igual em qualquer lugar que
aceite uma imagem — Render, Railway, Fly, Cloud Run, Coolify, ou um Docker
Compose no servidor da agência:

```bash
docker build -t ampliacao-social .
docker run -p 3000:3000 \
  -e NODE_ENV=production -e DATABASE_URL=... \
  -e SESSION_SECRET=... -e ADMIN_EMAIL=... \
  ampliacao-social
```

A imagem final leva só o pacote gerado e o driver do Postgres; TypeScript,
ESLint e Playwright ficam para trás. O processo não roda como root.

> Este Dockerfile foi escrito e revisado, mas **não foi construído** — o
> ambiente onde a plataforma foi desenvolvida não tem Docker disponível. Espere
> precisar de um ajuste na primeira construção.

## Teste de saúde

`GET /api/saude` responde:

```json
{ "ok": true, "banco": "ok", "emPeHa": 24 }
```

Ele **toca o banco de verdade**, com uma consulta trivial. Isso é de propósito:
a página inicial responde 200 mesmo com o banco fora do ar, porque a tela de
entrada é renderizada de qualquer jeito — um teste de saúde que aponta para ela
manteria no ar uma instalação quebrada.

Quando o banco não responde, o endereço devolve **503**, que é o código que faz
o provedor tirar a instância do balanceamento. Verificado nos dois sentidos: com
o banco derrubado devolveu 503 com a aplicação de pé, e voltou a 200 quando o
banco subiu, sem reiniciar o processo.

Configure este caminho como _health check_ no painel do provedor.
