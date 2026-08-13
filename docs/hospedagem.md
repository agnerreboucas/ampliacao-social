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
NITRO_PRESET=node-server npm run build
```

Sem a variável, o build continua como sempre foi — o fluxo do Lovable não muda.
Com ela, sai `dist/` com o servidor e os arquivos estáticos:

```bash
node dist/server/index.mjs
```

## Variáveis de ambiente

| Variável                                              | Obrigatória   | Para quê                                                                                      |
| ----------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | sim           | Endereço do Postgres. Sem ela a plataforma sobe em modo demonstração, com dados semeados.     |
| `SESSION_SECRET`                                      | sim           | Chave que sela o cookie de sessão. Mínimo de 32 caracteres.                                   |
| `PORT`                                                | não           | Porta onde escutar. Padrão 3000.                                                              |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | não           | Conexão com Instagram e Facebook. Sem elas, a tela de conexão avisa que não está configurada. |
| `WINDSOR_API_KEY`                                     | não           | Números de mídia paga pelo Windsor.ai.                                                        |
| `CREDENCIAIS_CHAVE`                                   | se usar OAuth | Cifra os tokens das redes guardados no banco.                                                 |

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
SESSAO_SEM_TLS=sim NODE_ENV=production node dist/server/index.mjs
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
3. Subir com as duas variáveis. O esquema é criado e a semente entra.
4. Definir a senha do primeiro administrador:
   ```bash
   DATABASE_URL=... npm run senha -- pessoa@exemplo.com.br
   ```
   O comando pede a senha duas vezes e nunca a guarda em lugar nenhum além do
   hash.
5. Reiniciar, para a aplicação reler o banco.
6. Entrar, criar o projeto do cliente e cadastrar as contas dele.
7. Importar o histórico pela tela de Importar histórico.
8. Ligar o backup do banco.

## Contêiner

O `Dockerfile` na raiz existe para a aplicação rodar igual em qualquer lugar que
aceite uma imagem — Render, Railway, Fly, Cloud Run, Coolify, ou um Docker
Compose no servidor da agência:

```bash
docker build -t ampliacao-social .
docker run -p 3000:3000 -e DATABASE_URL=... -e SESSION_SECRET=... ampliacao-social
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
