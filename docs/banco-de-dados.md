# Banco de dados (Neon)

Como ligar a plataforma a um Postgres — e o que muda quando você liga.

## Por que ligar

Sem banco, o estado vive em `dados/plataforma.json`, que vai para o Git. Funciona
e custa zero, mas tem um preço: cada atualização exige um commit, e duas pessoas
digitando ao mesmo tempo geram conflito de arquivo.

Com banco:

| | Arquivo no Git | Postgres (Neon) |
| --- | --- | --- |
| O que você salva | precisa de commit e push para valer | já está valendo |
| Duas pessoas ao mesmo tempo | conflito de arquivo | cada uma grava a sua |
| Sobrevive a reinício e deploy | só depois do commit | sempre |
| Backup | histórico do Git | do provedor, mais o botão de baixar |
| Custo | zero | plano gratuito do Neon cobre este uso |

Os dois convivem. A demonstração em HTML continua no arquivo; quem opera com
cliente usa o banco.

## Como ligar

1. Em **neon.tech**, crie um projeto (o plano gratuito basta).
2. Copie a **connection string** em *Connection string → Node.js*. Ela se parece
   com:

```
postgresql://usuario:senha@ep-algo-123.us-east-2.aws.neon.tech/neondb?sslmode=require
```

3. Coloque no ambiente de quem roda a aplicação:

```
DATABASE_URL=postgresql://...
```

Só isso. Na primeira subida a plataforma cria as tabelas sozinha e, como o banco
está vazio, abre com os dados de demonstração. A partir da primeira leitura
manual salva, tudo passa a vir do banco.

> **A string contém a senha.** Ela vai na configuração de ambiente da hospedagem
> (Vercel, Railway, Fly, o que for) — nunca em arquivo commitado. `.env` está no
> `.gitignore` justamente por isso.

### Levando os dados que já existem

Se você já tem um `dados/plataforma.json` com números reais: suba a aplicação
com o `DATABASE_URL` configurado, vá em **Atualizar números → Carregar arquivo**
e escolha o JSON. Ele entra no banco em uma transação só.

## O que a tela mostra

Em **Atualizar números**, o rodapé diz onde os dados estão indo — o host e o nome
do banco, **sem a senha**. Com banco ligado, o passo a passo do "commit e push"
some, porque deixou de existir.

## Como está feito

**Esquema normalizado**, não um JSON dentro de uma coluna. O motivo é aritmética:
o histórico diário é a parte que cresce, e regravar o estado inteiro a cada
leitura significaria escrever ~600 KB três vezes por dia — mais de 600 MB por
ano, contra os 0,5 GB do plano gratuito. Em linhas, os mesmos dados ocupam alguns
megabytes.

**Tudo é lido na subida da aplicação.** Alguns milhares de linhas cabem em
memória sem esforço, e ler de uma vez mantém o resto do código igual: nenhuma das
quarenta funções de servidor precisou mudar por causa do banco. Quando um cliente
crescer a ponto de isso pesar, dá para substituir consulta a consulta.

**Cada escrita é uma transação que regrava o estado.** Parece grosseiro, e seria
se a escrita fosse frequente — ela acontece poucas vezes por dia. Em troca, some
a classe de erro mais cara: o estado meio atualizado, com uma publicação nova
apontando para uma conta que a gravação anterior removeu. Ou entra tudo, ou não
entra nada.

**O esquema se conserta sozinho no caso aditivo.** `create table if not exists`
cria tabela nova mas não toca em tabela existente — um banco criado por uma
versão anterior ficaria sem a coluna nova e quebraria na leitura. Por isso o DDL
termina com `alter table ... add column if not exists`. Remover ou renomear
coluna, isso sim exigiria migração de verdade.

### Duas armadilhas que o código já desarma

**Datas escorregando um dia.** O driver converte `date` para `Date` por padrão, o
que joga o fuso do processo dentro de um dado que não tem hora: "2026-08-08" lido
em São Paulo vira 7 de agosto às 21h. Um parser explícito mantém `date` como
texto `AAAA-MM-DD`. Há teste para isso.

**`numeric` chegando como texto.** O driver preserva precisão devolvendo string.
Investimento em reais cabe em `number` com folga, então a conversão acontece em
um lugar só, no mapeamento.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/lib/social/banco/esquema.ts` | O DDL, idempotente |
| `src/lib/social/banco/mapeamento.ts` | Linha ↔ domínio, com as conversões de tipo |
| `src/lib/social/banco/postgres.server.ts` | Pool, leitura, escrita transacional |
| `src/lib/social/snapshot.server.ts` | Escolhe entre banco e arquivo |
| `src/lib/social/banco/postgres.test.ts` | Testes de integração |

## O que foi verificado, e o que não

**Verificado contra um Postgres 16 de verdade** — 13 testes de integração, mais
um teste de ponta a ponta pelo navegador:

- ida e volta do estado inteiro, comparado campo a campo;
- datas sem deslocamento (`2026-08-06` continua `2026-08-06`);
- `numeric` voltando como número (`42.5`, não `"42.5"`);
- instantes em ISO, no mesmo momento;
- ordem das listas preservada — migrar não reordena as telas do cliente;
- gravar de novo substitui em vez de duplicar;
- uma escrita que falha no meio deixa o estado anterior intacto;
- 5.000 dias de histórico gravados e lidos;
- um banco de esquema antigo ganhando a coluna nova na subida;
- **o teste que importa:** digitar um número na tela, matar o processo do
  servidor, subir outro, e o número voltar do banco.

**Não verificado.** A conexão com o Neon em si. Este ambiente de
desenvolvimento não alcança `neon.tech` (o proxy bloqueia), então os testes
rodaram contra um Postgres local. O Neon fala o protocolo padrão e o esquema não
usa nada específico de fornecedor, mas a primeira conexão real é o teste que
falta — e é um teste de um minuto: preencher `DATABASE_URL` e subir.
