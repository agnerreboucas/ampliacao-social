# Acesso e senhas

Quem entra na plataforma, como a senha é guardada, e por que ela não está neste
repositório.

## A regra que vale para tudo aqui

**Senha nunca entra no repositório** — nem em texto, nem como hash.

Um hash de frase memorável ("@AlgumaCoisa2026") é quebrável por dicionário em
tempo razoável, e repositório privado hoje é repositório compartilhado amanhã. A
senha vive no banco de dados, e só lá.

Isso é garantido pelo código, não pela disciplina: `paraSnapshot` remove o campo
`senhaHash` antes de gerar o JSON. O arquivo `dados/plataforma.json`, que vai
para o Git, sai sem ele — sempre.

## Duas situações, dois comportamentos

| | Sem `DATABASE_URL` | Com `DATABASE_URL` |
| --- | --- | --- |
| Chamamos de | modo demonstração | operação real |
| Conta sem senha definida | entra com qualquer senha | **não entra** |
| Conta com senha definida | precisa da senha certa | precisa da senha certa |

A regra está amarrada à existência de banco, e não a uma variável separada, de
propósito: uma variável a mais é uma variável a mais para alguém esquecer de
ligar — e o esquecimento aqui custa caro.

No modo demonstração não há dado de cliente para proteger, e a graça é
justamente qualquer pessoa poder abrir e olhar.

## Primeiro acesso

Com o banco configurado, ninguém tem senha ainda. O script resolve:

```bash
export DATABASE_URL='postgresql://...'
npm run senha -- campanha.neoncunha@gmail.com
```

Ele pergunta a senha duas vezes, sem mostrar na tela. A senha **não** vai como
argumento na linha de comando — argumento fica no histórico do shell e na lista
de processos da máquina.

Depois disso, **reinicie a aplicação** se ela já estava no ar. O estado é lido
uma vez, na subida; uma instância em execução continua com o que leu antes.

## Depois do primeiro acesso

Em **Equipe**, cada pessoa tem um botão "Definir senha". Um administrador define
a de qualquer um; trocar a própria exige a atual.

Feito por ali, a troca vale na hora — memória e banco juntos, sem reiniciar
nada. O script é só para o caso em que ninguém consegue entrar ainda.

## Como a senha é guardada

`scrypt`, da biblioteca padrão do Node — sem dependência externa, e resistente a
ataque com placa de vídeo.

```
scrypt$16384$8$1$<sal>$<derivação>
```

- **Sal aleatório por usuário.** Duas pessoas com a mesma senha têm hashes
  diferentes; o vazamento de um não entrega o outro.
- **Parâmetros no próprio hash.** Quando o custo precisar subir, hashes antigos
  continuam verificáveis.
- **Comparação em tempo constante.** Comparar com `===` vazaria, pelo tempo de
  resposta, quantos bytes iniciais estavam certos.
- **Mínimo de 8 caracteres**, verificado na hora de definir.

## Duas decisões de mensagem

**"E-mail ou senha incorretos"** é a resposta tanto para e-mail que não existe
quanto para senha errada. Distinguir entregaria, a quem ficasse tentando, a
lista de quem tem conta na plataforma.

**"Esta conta ainda não tem senha definida"** é a exceção deliberada: aqui a
informação já está do lado de quem pergunta (a conta é dele), e sem ela a pessoa
ficaria tentando senhas para sempre.

## O que ainda falta — e é importante

**A autorização por projeto ainda não é verificada no servidor.** Quando você
troca de projeto na barra lateral, é o navegador que informa qual projeto quer, e
o servidor aceita. Quem souber chamar a API diretamente consegue pedir os dados
de outro projeto.

Enquanto houver um cliente só, isso não muda nada na prática. Com dois clientes
na mesma instalação, é o próximo item obrigatório — cada função de servidor
precisa conferir a sessão em vez de confiar no que chega.

**A sessão vive no `localStorage`**, sem expiração e sem cookie assinado. Uma
sessão esquecida aberta continua válida.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `src/lib/social/senha.server.ts` | Derivar e conferir senha |
| `src/lib/social/senha.test.ts` | Testes |
| `src/lib/api/social.functions.ts` | `autenticar`, `definirSenha` |
| `scripts/definir-senha.mjs` | Primeiro acesso, pela linha de comando |
| `src/routes/social/equipe.tsx` | Definir senha pela tela |

## O que foi verificado

Pelo navegador, contra um Postgres real:

- entra com a senha certa;
- **não** entra com a senha errada;
- **não** entra com conta sem senha definida, quando há banco;
- e-mail inexistente e senha errada dão exatamente a mesma resposta;
- senha definida pela tela de Equipe vale na hora, sem reiniciar;
- senha definida pelo script exige reiniciar — que é o que a mensagem do script
  diz.

E, nos testes automatizados: senha certa confere, errada não, o hash não contém
a senha, a mesma senha gera hashes diferentes, acentos funcionam, e hash
corrompido ou de outro formato não deixa ninguém entrar.
