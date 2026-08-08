# Atualização manual — e por que três vezes ao dia funciona

O caminho para ter números reais na plataforma **hoje**, sem pagar agregador e
sem esperar a App Review da Meta.

## A pergunta que originou isto

> "Posso atualizar 3 vezes ao dia?"

Pode. E muda menos coisa do que parece, por um motivo técnico que vale entender:

**As redes reportam números acumulados do dia.** O alcance que o Instagram mostra
às 9h da manhã e o que ele mostra às 21h são a mesma medida, em dois momentos —
não são dois dados diferentes para somar. Por isso a segunda leitura do dia
**substitui** a primeira em vez de virar um ponto novo.

O efeito prático:

| | 1 leitura por dia | 3 leituras por dia |
| --- | --- | --- |
| Pontos no gráfico | 1 por dia | 1 por dia (igual) |
| Precisão do número do dia | o que era às 9h | o que era às 21h |
| Dá para ver o dia evoluindo | não | sim |
| Trabalho | 1 rodada | 3 rodadas |

Ou seja: o histórico não incha, o gráfico não muda de forma, e o número do dia
fica mais certo. O ganho de verdade é o **registro de como o dia evoluiu** — a
tela mostra "+40 seguidores e +650 de alcance desde a leitura das 09:12". Isso
não existe com uma leitura só.

Não há limite técnico. Três é a escolha de quem opera, não uma regra da
plataforma. Cinco funciona igual; o custo é o seu tempo digitando.

## Como usar

Em **Atualizar números**, cada conta é um cartão. Abrindo, aparecem os oito
campos que a rede mostra no painel dela:

| Campo | O que digitar |
| --- | --- |
| Seguidores | O total agora, não o quanto cresceu |
| Alcance orgânico / pago | Contas alcançadas, acumulado do dia |
| Impressões orgânicas / pagas | Exibições |
| Engajamento orgânico / pago | Curtidas, comentários, salvamentos, compartilhamentos |
| Investimento do dia | Quanto saiu do bolso, em reais |

Os campos vêm **pré-preenchidos** com a leitura anterior — na segunda e na
terceira rodada do dia você só corrige o que mudou.

Ganho e perda de seguidores a plataforma calcula sozinha, pela diferença para o
dia anterior. Ninguém lê isso de cabeça no painel da rede.

As três faixas — Manhã, Tarde, Noite — são só orientação visual de quais leituras
do dia já foram feitas. Nada trava se você pular uma.

## Como os números chegam ao HTML publicado

```
digita na tela  →  dados/plataforma.json  →  commit + push  →  Actions  →  HTML no ar
```

1. **Digite e salve.** O arquivo `dados/plataforma.json` é gravado na hora — a
   gravação não depende de você lembrar de clicar em nada.
2. **Baixe para o Git.** O botão gera o mesmo arquivo para download. Substitua
   `dados/plataforma.json` no repositório.
3. **Commit e push.** O workflow `.github/workflows/publicar.yml` reconstrói o
   HTML com os números embutidos e publica no GitHub Pages.

Uma execução leva cerca de um minuto. O plano gratuito do Actions cobre três por
dia com folga.

O efeito colateral mais útil: **o histórico das atualizações vira histórico do
Git.** Dá para ver quem mudou qual número, quando, e voltar atrás — sem banco de
dados.

## O arquivo

`dados/plataforma.json` guarda o estado inteiro: contas, histórico diário,
publicações, impulsionamentos, relacionamento e o log de todas as leituras
manuais.

- **Indentado de propósito**, para o diff do Git ficar legível.
- **Versionado** (`versao: 1`). Um arquivo de versão futura é recusado em vez de
  lido pela metade — carregar dado que não se entende é pior do que recomeçar,
  porque o estrago só apareceria depois, num número errado dentro de um
  relatório.
- **Trocável de lugar** com `SOCIAL_DADOS_ARQUIVO`, para hospedagem com o
  diretório de trabalho em outro canto.

O botão **Carregar arquivo** faz o caminho inverso: sobe um JSON e substitui o
estado. Serve para restaurar um backup ou levar os dados de uma máquina para
outra.

## No HTML único

O HTML autocontido não tem disco. Lá os dados vêm embutidos numa tag
`<script type="application/json">` que o `build-html.mjs` gera a partir do
`dados/plataforma.json`. Você continua podendo digitar na tela, mas o aviso é
explícito: **salvar ali não grava em lugar nenhum** — use "Baixar para o Git".

## Como está implementado

| Arquivo | Papel |
| --- | --- |
| `src/lib/social/atualizacao.ts` | Lógica pura: aplicar valores ao histórico, janelas do dia, variação entre leituras |
| `src/lib/social/snapshot.ts` | Serializar e ler o estado, com validação de versão |
| `src/lib/social/snapshot.server.ts` | Leitura e gravação do arquivo em disco |
| `src/lib/api/social.functions.ts` | `situacaoAtualizacao`, `registrarAtualizacao`, `exportarDados`, `importarDados` |
| `src/routes/social/atualizar.tsx` | A tela |
| `src/static/dados-embutidos.ts` | O substituto no build estático (só em `ampliacao-social`) |
| `.github/workflows/publicar.yml` | Reconstrói e publica o HTML no push (só em `ampliacao-social`) |

## O que foi verificado, e o que não

**Verificado no navegador.** Três leituras seguidas no mesmo dia, o histórico
mostrando as três com as variações entre elas, o gráfico continuando com o mesmo
número de pontos (60 antes, 60 depois), o arquivo gravado com 3 registros e
**1** linha no histórico do dia, e o HTML publicado abrindo com esses números —
offline, sem nenhuma requisição externa.

**Não verificado.** O workflow do GitHub Actions não foi executado: o repositório
`ampliacao-social` ainda não existe no GitHub. O arquivo está escrito e usa ações
oficiais, mas a primeira execução é o teste que falta.
