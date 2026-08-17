import assert from "node:assert/strict";
import { test } from "node:test";

import {
  horarioDeParede,
  lerCsv,
  lerExportacaoDoInstagram,
  normalizarHorario,
  totalizar,
} from "./instagram-csv.ts";

const CABECALHO =
  '"Identificação do post","Identificação da conta","Nome de usuário da conta","Nome da conta",' +
  'Descrição,"Duração (s)","Horário de publicação","Link permanente","Tipo de post",' +
  '"Comentário de dados",Data,Visualizações,Alcance,Curtidas,Compartilhamentos,Seguimentos,' +
  "Comentários,Salvamentos";

function linha(campos: {
  id: string;
  legenda?: string;
  duracao?: number;
  horario: string;
  tipo: string;
  visualizacoes: number;
  alcance: number;
  curtidas: number;
  compartilhamentos: number;
  seguidores: number;
  comentarios: number;
  salvamentos: number;
}): string {
  return [
    campos.id,
    "17841400276932781",
    "neoncunha",
    '"Neon Cunha"',
    `"${campos.legenda ?? "legenda"}"`,
    String(campos.duracao ?? 0),
    `"${campos.horario}"`,
    '"https://instagram.com/p/x"',
    `"${campos.tipo}"`,
    '""',
    "Total",
    String(campos.visualizacoes),
    String(campos.alcance),
    String(campos.curtidas),
    String(campos.compartilhamentos),
    String(campos.seguidores),
    String(campos.comentarios),
    String(campos.salvamentos),
  ].join(",");
}

/**
 * A exportação real da campanha, de 01/08 a 17/08 de 2026.
 *
 * Os oito registros e os números são os do arquivo que a campanha exportou. Ter
 * o dado verdadeiro no teste é o que permite afirmar que o importador acerta —
 * inclusive o total de 37.898 visualizações e a taxa de 11,2%, que foram
 * conferidos à mão antes de existir código.
 */
const EXPORTACAO_DE_AGOSTO = [
  CABECALHO,
  linha({
    id: "1",
    horario: "08/01/2026 07:10",
    tipo: "Imagem do Instagram",
    visualizacoes: 3423,
    alcance: 2019,
    curtidas: 171,
    compartilhamentos: 10,
    seguidores: 0,
    comentarios: 3,
    salvamentos: 0,
  }),
  linha({
    id: "2",
    duracao: 139,
    horario: "08/03/2026 07:53",
    tipo: "Reel do Instagram",
    visualizacoes: 1774,
    alcance: 1360,
    curtidas: 96,
    compartilhamentos: 16,
    seguidores: 2,
    comentarios: 14,
    salvamentos: 0,
  }),
  linha({
    id: "3",
    horario: "08/04/2026 15:31",
    tipo: "Carrossel do Instagram",
    visualizacoes: 2687,
    alcance: 907,
    curtidas: 114,
    compartilhamentos: 2,
    seguidores: 0,
    comentarios: 8,
    salvamentos: 0,
  }),
  linha({
    id: "4",
    horario: "08/05/2026 06:32",
    tipo: "Imagem do Instagram",
    visualizacoes: 3172,
    alcance: 1657,
    curtidas: 238,
    compartilhamentos: 10,
    seguidores: 2,
    comentarios: 11,
    salvamentos: 6,
  }),
  linha({
    id: "5",
    horario: "08/14/2026 13:34",
    tipo: "Carrossel do Instagram",
    visualizacoes: 11464,
    alcance: 5603,
    curtidas: 238,
    compartilhamentos: 102,
    seguidores: 1,
    comentarios: 6,
    salvamentos: 0,
  }),
  linha({
    id: "6",
    legenda: "Abertura da campanha",
    horario: "08/15/2026 22:31",
    tipo: "Imagem do Instagram",
    visualizacoes: 13303,
    alcance: 8043,
    curtidas: 899,
    compartilhamentos: 71,
    seguidores: 5,
    comentarios: 83,
    salvamentos: 22,
  }),
  linha({
    id: "7",
    horario: "08/17/2026 05:06",
    tipo: "Imagem do Instagram",
    visualizacoes: 1552,
    alcance: 804,
    curtidas: 132,
    compartilhamentos: 8,
    seguidores: 0,
    comentarios: 6,
    salvamentos: 0,
  }),
  linha({
    id: "8",
    horario: "08/17/2026 05:11",
    tipo: "Imagem do Instagram",
    visualizacoes: 523,
    alcance: 268,
    curtidas: 40,
    compartilhamentos: 1,
    seguidores: 0,
    comentarios: 1,
    salvamentos: 0,
  }),
].join("\n");

// --- O CSV -------------------------------------------------------------------

test("legenda com vírgula, aspas e parágrafo não embaralha as colunas", () => {
  // É o que acontece com `split(",")` na primeira legenda de verdade.
  const texto = 'a,b,c\n1,"tem, vírgula e ""aspas""\ne parágrafo",3';
  const linhas = lerCsv(texto);

  assert.equal(linhas.length, 2);
  assert.equal(linhas[1].length, 3);
  assert.equal(linhas[1][1], 'tem, vírgula e "aspas"\ne parágrafo');
  assert.equal(linhas[1][2], "3");
});

test("o BOM do início não vira parte do nome da primeira coluna", () => {
  const linhas = lerCsv('﻿"Identificação do post",b\n1,2');
  assert.equal(linhas[0][0], "Identificação do post");
});

// --- O horário ---------------------------------------------------------------

test("a data é lida como MM/DD, não DD/MM", () => {
  // `08/03/2026` é 3 de agosto. Ler como 8 de março importa em silêncio com a
  // publicação no mês errado, e ninguém descobre até o relatório sair furado.
  const horario = normalizarHorario("08/03/2026 07:53", "America/Los_Angeles", "America/Sao_Paulo");

  assert.match(horario?.publicadoEmLocal ?? "", /^03\/08\/2026/);
});

test("o horário do relatório é trazido para o fuso da campanha", () => {
  // O caso verificado contra o Instagram: o arquivo diz 15/08 22:31 e o
  // aplicativo mostra 16/08 02:31. Quatro horas mudam o dia e o bloco do dia.
  const horario = normalizarHorario("08/15/2026 22:31", "America/Los_Angeles", "America/Sao_Paulo");

  assert.equal(horario?.publicadoEmLocal, "16/08/2026 02:31");
  assert.equal(horario?.deslocamentoHoras, 4);
});

test("fuso da fonte igual ao da campanha não desloca nada", () => {
  const horario = normalizarHorario("08/15/2026 22:31", "America/Sao_Paulo", "America/Sao_Paulo");

  assert.equal(horario?.publicadoEmLocal, "15/08/2026 22:31");
  assert.equal(horario?.deslocamentoHoras, 0);
});

test("horário fora do formato é recusado em vez de adivinhado", () => {
  assert.equal(normalizarHorario("15/08/2026 22:31", "UTC", "UTC"), null, "dia 15 não é mês");
  assert.equal(normalizarHorario("2026-08-15 22:31", "UTC", "UTC"), null);
  assert.equal(normalizarHorario("", "UTC", "UTC"), null);
});

test("o horário de parede sai no formato de quem lê", () => {
  const meiaNoite = Date.UTC(2026, 7, 16, 3, 0);
  assert.equal(horarioDeParede(meiaNoite, "America/Sao_Paulo"), "16/08/2026 00:00");
});

// --- A leitura inteira -------------------------------------------------------

test("a exportação real de agosto entra inteira", () => {
  const leitura = lerExportacaoDoInstagram(EXPORTACAO_DE_AGOSTO);

  assert.deepEqual(leitura.problemas, []);
  assert.equal(leitura.publicacoes.length, 8);
  assert.equal(leitura.fusoDaFonte, "America/Los_Angeles");
});

test("os totais batem com os que foram conferidos à mão", () => {
  const totais = totalizar(lerExportacaoDoInstagram(EXPORTACAO_DE_AGOSTO).publicacoes);

  assert.equal(totais.visualizacoes, 37_898);
  assert.equal(totais.alcance, 20_661);
  assert.equal(totais.curtidas, 1928);
  assert.equal(totais.comentarios, 132);
  assert.equal(totais.compartilhamentos, 220);
  assert.equal(totais.salvamentos, 28);
  assert.equal(totais.seguidoresGanhos, 10);
  assert.equal(totais.interacoes, 2308);
  assert.equal(Number(totais.taxaDeInteracao.toFixed(1)), 11.2);
});

test("cada tipo do arquivo vira o formato certo do domínio", () => {
  const { publicacoes } = lerExportacaoDoInstagram(EXPORTACAO_DE_AGOSTO);
  const contar = (formato: string) => publicacoes.filter((peca) => peca.formato === formato).length;

  assert.equal(contar("video"), 1, "o reel é vídeo");
  assert.equal(contar("carrossel"), 2);
  assert.equal(contar("imagem"), 5);
});

test("a publicação de abertura chega com o horário certo e a procedência", () => {
  const { publicacoes } = lerExportacaoDoInstagram(EXPORTACAO_DE_AGOSTO);
  const abertura = publicacoes.find((peca) => peca.legenda === "Abertura da campanha");

  assert.equal(abertura?.horarioDeOrigem, "08/15/2026 22:31");
  assert.equal(abertura?.publicadoEmLocal, "16/08/2026 02:31");
  assert.equal(abertura?.fusoDaFonte, "America/Los_Angeles");
  assert.equal(abertura?.fusoDaCampanha, "America/Sao_Paulo");
  assert.equal(abertura?.alcance, 8043);
});

test("as publicações voltam na ordem em que aconteceram", () => {
  const { publicacoes } = lerExportacaoDoInstagram(EXPORTACAO_DE_AGOSTO);

  for (let i = 1; i < publicacoes.length; i += 1) {
    assert.ok(publicacoes[i - 1].publicadoEm <= publicacoes[i].publicadoEm);
  }
});

test("reexportar períodos que se sobrepõem não duplica publicação", () => {
  // O normal é exportar 01–17 e depois 10–25. A linha repetida tem o mesmo id.
  const comRepetida = `${EXPORTACAO_DE_AGOSTO}\n${EXPORTACAO_DE_AGOSTO.split("\n")[6]}`;
  const leitura = lerExportacaoDoInstagram(comRepetida);

  assert.equal(leitura.publicacoes.length, 8);
});

test("tipo desconhecido é relatado, não convertido no chute", () => {
  const texto = [
    CABECALHO,
    linha({
      id: "9",
      horario: "08/10/2026 10:00",
      tipo: "Transmissão ao vivo do Instagram",
      visualizacoes: 100,
      alcance: 50,
      curtidas: 1,
      compartilhamentos: 0,
      seguidores: 0,
      comentarios: 0,
      salvamentos: 0,
    }),
  ].join("\n");

  const leitura = lerExportacaoDoInstagram(texto);

  assert.equal(leitura.publicacoes.length, 0);
  assert.equal(leitura.problemas.length, 1);
  assert.match(leitura.problemas[0].motivo, /Transmissão ao vivo/);
  assert.equal(leitura.problemas[0].linha, 2);
});

test("arquivo sem a coluna de horário é recusado com o motivo", () => {
  const leitura = lerExportacaoDoInstagram("Tipo de post,Alcance\nImagem do Instagram,100");

  assert.equal(leitura.publicacoes.length, 0);
  assert.match(leitura.problemas[0].motivo, /horário de publicação/);
});

test("arquivo vazio não derruba nada", () => {
  const leitura = lerExportacaoDoInstagram("");

  assert.equal(leitura.publicacoes.length, 0);
  assert.equal(leitura.problemas.length, 1);
});

test("os totais de um conjunto vazio são zero, sem divisão por zero", () => {
  const totais = totalizar([]);

  assert.equal(totais.publicacoes, 0);
  assert.equal(totais.taxaDeInteracao, 0);
  assert.equal(totais.visualizacoesPorPessoa, 0);
  assert.equal(totais.primeiraPublicacao, null);
});

test("visualizações por pessoa alcançada é a razão, não a soma", () => {
  const totais = totalizar(lerExportacaoDoInstagram(EXPORTACAO_DE_AGOSTO).publicacoes);

  // 37.898 / 20.661 ≈ 1,83 — cada pessoa alcançada viu quase duas vezes.
  assert.equal(Number(totais.visualizacoesPorPessoa.toFixed(2)), 1.83);
});
