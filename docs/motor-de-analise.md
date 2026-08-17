# Motor de análise: do dado à decisão

Como o relatório da campanha de agosto entra na plataforma, e o que falta para
ela virar a central de inteligência editorial descrita ali — não um agendador de
posts.

O ciclo que o documento pede é este, e é o que organiza este arquivo:

```
CALENDÁRIO → PRODUÇÃO → PUBLICAÇÃO → DADOS → ANÁLISE → APRENDIZADO → NOVO PLANEJAMENTO
```

## O que a exportação de agosto revelou

Rodei o arquivo real (`Aug012026_Aug172026`, 8 publicações) pelo importador novo.
Os números fecham com os que foram conferidos à mão: **37.898 visualizações,
20.661 de alcance, 2.308 interações, 10 seguidores, taxa de 11,2%**.

E confirmou as duas armadilhas do formato:

**A data vem em MM/DD/AAAA.** `08/03/2026` é 3 de agosto, não 8 de março. Ler
como dia/mês não quebra o arquivo — importa em silêncio com parte das
publicações no mês errado.

**O horário está quatro horas atrás do horário da campanha.** A publicação de
abertura aparece no arquivo como `08/15 22:31` e o Instagram mostra
`16/08 02:31`. Isso não é defeito da exportação: a Meta emite o relatório em
horário do Pacífico, e `America/Los_Angeles` → `America/Sao_Paulo` são
exatamente +4h em agosto. Quatro horas mudam o **dia da semana** e o **bloco do
dia** — jogariam toda a análise de horário para o lado errado.

| Arquivo     | Na campanha     | Formato   | Alcance | Interações |
| ----------- | --------------- | --------- | ------- | ---------- |
| 08/01 07:10 | 01/08 11:10     | imagem    | 2.019   | 184        |
| 08/03 07:53 | 03/08 11:53     | vídeo     | 1.360   | 126        |
| 08/04 15:31 | 04/08 19:31     | carrossel | 907     | 124        |
| 08/05 06:32 | 05/08 10:32     | imagem    | 1.657   | 265        |
| 08/14 13:34 | 14/08 17:34     | carrossel | 5.603   | 346        |
| 08/15 22:31 | **16/08 02:31** | imagem    | 8.043   | 1.075      |
| 08/17 05:06 | 17/08 09:06     | imagem    | 804     | 146        |
| 08/17 05:11 | 17/08 09:11     | imagem    | 268     | 42         |

Repare no que a correção faz com a leitura: a publicação de abertura não saiu às
22h de sexta, saiu às **2h31 de sábado**. A conclusão "publique às 22h" seria
tirada de um horário que não existiu.

O importador guarda os quatro campos que o relatório pede — horário de origem,
fuso da fonte, fuso da campanha e horário normalizado — porque alguém vai
desconfiar do número, e desconfiar sem poder reconferir é o mesmo que não ter o
número.

## O que já existe na plataforma

| Item do relatório                      | Onde está hoje                                           |
| -------------------------------------- | -------------------------------------------------------- |
| §2 Métricas agregadas do período       | Painel, com filtro de período                            |
| §3 Ranking de conteúdos                | Conteúdo → "Peça a peça", ordenado por alcance           |
| §5 Normalização de fuso                | `instagram-csv.ts` + `fuso.ts` — feito e testado         |
| §6 Cruzar horário com formato          | Conteúdo → "Quando publicar"; Painel → gráfico de barras |
| §7 Janelas de teste                    | Mapa de calor dia × faixa de 3h, com tamanho da amostra  |
| §9 Fluxo de produção                   | Quadro Kanban na Agenda, com 6 fases                     |
| §10 Status dos conteúdos               | As fases do quadro                                       |
| §13 Análise individual                 | Tela da publicação, com quebra por rede                  |
| §16 Análise por formato                | Conteúdo → "Por formato", com ressalva de amostra        |
| §17 Análise temporal (dia, horário)    | Mapa de calor e gráfico de barras hora a hora            |
| §10 Aprovação como estado visível      | Semáforo no calendário e visão "Aprovações"              |
| §18 Amostra pequena não vira conclusão | Regra do módulo de horários, com testes                  |
| §19 Resumo do dia                      | `resumirDia` no domínio — falta a tela                   |

## O que falta, em ordem

A ordem não é a do documento: é a que faz cada etapa destravar a seguinte.

### 1. Importar a exportação do Instagram pela tela

O módulo está pronto e testado. Falta a tela: escolher o arquivo, ver o que vai
entrar — com o horário corrigido lado a lado com o do arquivo —, e confirmar. Sem
isso, os dados de agosto não existem dentro da plataforma, e nenhuma análise
abaixo tem o que analisar.

Junto vem a persistência dos quatro campos de horário no banco, e as duas
métricas que faltam no modelo: **visualizações** (hoje a plataforma guarda
impressões, que não é a mesma coisa para reels) e **visualizações por pessoa
alcançada**.

### 2. Narrativa como campo da peça

Descoberta, Lei/Solução, Voto, Fechamento, Agenda, Bastidores. É um campo, mas
destrava metade das análises do documento: "qual narrativa gera mais
compartilhamento" não tem como ser respondido sem ele, e é uma das perguntas mais
úteis da lista.

O calendário editorial já traz a narrativa de cada dia — então o passo 3 preenche
este campo sozinho para 122 peças.

### 3. Importar o calendário editorial de 45 dias

O calendário de 16/08 a 29/09 vira as peças no quadro de produção: 108 reels, 12
carrosséis, 2 posts de fechamento, mais stories diários. Cada célula do
calendário já diz o dia, o formato e a narrativa — é exatamente o que a pauta
precisa.

Isso é o que transforma a agenda em **cronograma de produção**: com 122 peças no
quadro, as três visões que você descreveu (pré-produção, produção, agendado)
passam a ter conteúdo.

### 4. As nove fases de produção

Hoje o quadro tem seis: ideia → rascunho → aguardando aprovação → aprovado →
agendado → publicado. O documento pede nove, e a diferença importa porque cada
uma tem responsável e prazo próprios:

```
ROTEIRO → GRAVAÇÃO → EDIÇÃO → DESIGN → APROVAÇÃO → AGENDAMENTO → PUBLICAÇÃO → MONITORAMENTO → ANÁLISE
```

Com nove fases e 122 peças, o quadro recolhível já construído passa a ser
necessário, não conveniente.

### 5. Estoque de conteúdo e alertas

`estoque = peças aprovadas ou agendadas ÷ peças necessárias por dia`

É o indicador que responde "quando precisamos gravar de novo?", e é o único da
lista que previne um problema em vez de descrevê-lo. Verde, amarelo, vermelho.

### 6. Produção por lotes

Ver o quadro por **fase** em vez de por peça: todos os roteiros a fazer, todas as
gravações pendentes. Com mais de cem peças, produzir uma a uma não é viável, e a
plataforma deve empurrar para o lote.

### 7. O motor de análise

Aqui está o pedido central do documento, e vale ser preciso sobre como fazê-lo.

A plataforma vai gerar as frases — destaque, atenção, tendência, hipótese, ação —
**a partir de regras**, não de prosa gerada. A diferença não é estilística:

- Uma regra é auditável. "Este conteúdo está acima da média em
  compartilhamentos" pode ser conferido contra o número, e a regra que a produziu
  pode ser discutida e corrigida.
- Uma frase gerada por modelo de linguagem soa igual e não pode ser conferida.
  Num relatório de campanha, uma frase que soa certa e está errada é pior do que
  nenhuma frase.

As quatro classes que o documento pede caem bem em regras:

| Classe        | Regra                                                               |
| ------------- | ------------------------------------------------------------------- |
| **FATO**      | O número, com a data. Sempre verdadeiro.                            |
| **DESTAQUE**  | Acima da média do perfil em alguma métrica, com amostra suficiente. |
| **ATENÇÃO**   | Publicado há pouco tempo — não classificar ainda.                   |
| **TENDÊNCIA** | O mesmo padrão em três ou mais peças comparáveis.                   |
| **HIPÓTESE**  | Padrão visível, amostra insuficiente. Diz quantas peças faltam.     |
| **AÇÃO**      | O que testar, e por quê, com a frase da regra que a sustenta.       |

**"Tempo desde a publicação" é a regra que falta e que mais protege.** Os dois
conteúdos de hoje têm 804 e 268 de alcance; compará-los com um de 8.043 que teve
dois dias para acumular não é análise, é erro de leitura. A plataforma precisa
saber a idade da peça antes de classificá-la — e é uma regra, não um ajuste.

Se depois quisermos uma camada de linguagem por cima, ela explica o que as regras
concluíram. Nunca o contrário.

### 8. Fase da campanha

Fase 1 Descoberta → Fase 2 +Lei/Solução → Fase 3 +Voto → Fase 4 Fechamento. O
desempenho comparado **dentro** de cada fase, porque o público e o objetivo
mudam entre elas e a média geral mistura coisas diferentes.

### 9. Tela Hoje e relatório semanal

O resumo diário (§19) e o semanal (§20). O do dia já tem o cálculo pronto no
domínio; falta a tela e a notificação. O semanal é o mesmo cálculo com outra
janela, mais a comparação com a semana anterior.

### 10. A tela principal do §23

O desenho que você fez — desempenho, destaque, tendência, horários, produção,
alertas, análise — é o Painel depois que os nove itens acima existirem. Montá-lo
antes seria desenhar as caixas e preenchê-las com nada.

## Sobre as janelas de teste

As três janelas do documento — 13h–14h, 19h–20h, 21h30–22h30 — entram como
**hipóteses marcadas**, não como recomendação. Com 8 publicações, nenhuma delas
tem amostra para virar regra, e o próprio relatório diz isso. A plataforma vai
mostrá-las com o número de peças ao lado e ir apertando a conclusão conforme o
volume crescer.

Vale notar uma coisa que os dados já mostram: o carrossel de 14/08 teve **102
compartilhamentos contra 238 curtidas** — uma proporção muito acima do resto da
base. Isso é um sinal de circulação, e é o tipo de padrão que a análise por
narrativa e por formato vai capturar sozinha quando houver mais peças. Hoje é
hipótese, com uma peça.

## Onde isto vive no código

| Arquivo                           | Papel                                                    |
| --------------------------------- | -------------------------------------------------------- |
| `src/lib/social/instagram-csv.ts` | Leitura da exportação, com normalização de fuso          |
| `src/lib/social/fuso.ts`          | Aritmética de fuso, compartilhada com o leitor de `.ics` |
| `src/lib/social/horarios.ts`      | Mapa dia × faixa, melhores horários, barras do quadro    |
| `src/lib/social/conteudo.ts`      | Avaliação peça a peça, cortes por formato e assunto      |
| `src/lib/social/agenda.ts`        | Quadro de produção, calendário, resumo do dia            |
