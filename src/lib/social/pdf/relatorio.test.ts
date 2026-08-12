import assert from "node:assert/strict";
import { test } from "node:test";

import { gerarRelatorioPdf, type DadosDoRelatorio } from "./relatorio.ts";
import type { DailyMetric } from "../types.ts";

function comoTexto(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function serie(quantidade: number): DailyMetric[] {
  return Array.from({ length: quantidade }, (_, indice) => ({
    date: new Date(Date.parse("2026-07-01T12:00:00Z") + indice * 86400000)
      .toISOString()
      .slice(0, 10),
    followers: 10_000 + indice * 40,
    followersGained: 50,
    followersLost: 10,
    organicReach: 4000,
    paidReach: 1500,
    organicImpressions: 6000,
    paidImpressions: 2200,
    organicEngagement: 220,
    paidEngagement: 60,
    adSpend: 35,
  }));
}

function dados(parcial: Partial<DadosDoRelatorio> = {}): DadosDoRelatorio {
  return {
    titulo: "Resultados de agosto",
    projeto: "Campanha Neon Cunha",
    cliente: "Neon Cunha",
    periodoInicio: "2026-07-01",
    periodoFim: "2026-07-30",
    geradoEm: new Date("2026-08-12T14:30:00Z"),
    geradoPor: "Ana Ribeiro",
    resumo: {
      followers: 11_200,
      followersDelta: 1200,
      followersDeltaPct: 12,
      reach: 165_000,
      reachDelta: 8.4,
      engagement: 8400,
      engagementDelta: 3.2,
      engagementRate: 5.1,
      adSpend: 1050,
    },
    split: {
      organic: { reach: 120_000, impressions: 180_000, engagement: 6600 },
      paid: { reach: 45_000, impressions: 66_000, engagement: 1800, spend: 1050 },
    },
    canais: [
      {
        accountId: "acc-1",
        nome: "Neon Cunha",
        handle: "@neoncunha",
        networkId: "instagram",
        avatarGradient: "",
        seguidores: 8000,
        variacaoSeguidores: 900,
        alcance: 120_000,
        engajamento: 6000,
        taxaEngajamento: 5,
        investido: 700,
        participacao: 0.72,
        diasComDados: 30,
      },
      {
        accountId: "acc-2",
        nome: "Neon Cunha",
        handle: "/neoncunha",
        networkId: "facebook",
        avatarGradient: "",
        seguidores: 3200,
        variacaoSeguidores: 300,
        alcance: 45_000,
        engajamento: 2400,
        taxaEngajamento: 5.3,
        investido: 350,
        participacao: 0.28,
        diasComDados: 30,
      },
    ],
    serie: serie(30),
    recomendacoes: [
      {
        id: "perda-acc-2",
        area: "Audiência",
        peso: "risco",
        titulo: "O Facebook está perdendo seguidores",
        acao: "Olhe os dias de maior perda e o que foi publicado neles.",
        evidencia: "820 saíram contra 300 que entraram, em 30 dias.",
      },
      {
        id: "formato-vencedor",
        area: "Conteúdo",
        peso: "oportunidade",
        titulo: "Vídeo está rendendo mais",
        acao: "Aumente a proporção de vídeo na pauta.",
        evidencia: "Vídeo alcança em média 5.000 por publicação, contra 1.000 de imagem.",
      },
    ],
    publicacoes: 14,
    origemDosDados: "leitura manual",
    ...parcial,
  };
}

test("o relatório sai como um PDF válido e com conteúdo", () => {
  const bytes = gerarRelatorioPdf(dados());
  const texto = comoTexto(bytes);

  assert.match(texto, /^%PDF-1\.4/);
  assert.match(texto, /%%EOF\n$/);
  assert.ok(bytes.length > 3000, `o arquivo saiu pequeno demais: ${bytes.length} bytes`);
});

test("o índice continua correto depois de toda a diagramação", () => {
  // A diagramação acrescenta páginas e objetos; se a contagem de bytes se
  // perder no caminho, o arquivo abre corrompido. Este é o teste que pega isso.
  const bytes = gerarRelatorioPdf(dados());
  const texto = comoTexto(bytes);

  const posicaoDoIndice = texto.search(/(?<=\n)xref\n/);
  assert.equal(Number(texto.match(/startxref\n(\d+)/)![1]), posicaoDoIndice);

  const entradas = [...texto.slice(posicaoDoIndice).matchAll(/^(\d{10}) 00000 n $/gm)];
  entradas.forEach((entrada, indice) => {
    assert.match(
      texto.slice(Number(entrada[1]), Number(entrada[1]) + 20),
      new RegExp(`^${indice + 1} 0 obj`),
    );
  });
});

test("o título, o cliente e o período aparecem no documento", () => {
  const texto = comoTexto(gerarRelatorioPdf(dados()));

  assert.match(texto, /Resultados de agosto/);
  assert.match(texto, /NEON CUNHA/);
  assert.match(texto, /01\/07\/2026/);
  assert.match(texto, /30\/07\/2026/);
});

test("toda recomendação leva a evidência junto para o PDF", () => {
  // A mesma regra da tela: no papel ela importa mais, porque o PDF chega a
  // quem não estava na conversa.
  const texto = comoTexto(gerarRelatorioPdf(dados()));

  assert.match(texto, /820 saíram contra 300/);
  assert.match(texto, /5\.000 por publica/);
});

test("o rodapé diz quem gerou, quando e de onde vieram os números", () => {
  const texto = comoTexto(gerarRelatorioPdf(dados()));

  assert.match(texto, /Gerado em 12\/08\/2026/);
  assert.match(texto, /Ana Ribeiro/);
  assert.match(texto, /leitura manual/);
});

test("todas as páginas são numeradas com o total certo", () => {
  const texto = comoTexto(gerarRelatorioPdf(dados()));
  const total = Number(texto.match(/\/Count (\d+)/)![1]);

  assert.ok(total >= 1);
  for (let pagina = 1; pagina <= total; pagina += 1) {
    assert.ok(
      texto.includes(`${pagina} de ${total}`),
      `faltou a numeração "${pagina} de ${total}"`,
    );
  }
});

test("muitos canais e recomendações viram várias páginas, sem perder ninguém", () => {
  const muitos = Array.from({ length: 26 }, (_, indice) => ({
    ...dados().canais[0],
    accountId: `acc-${indice}`,
    nome: `Canal número ${indice}`,
    handle: `@canal${indice}`,
  }));
  const conselhos = Array.from({ length: 12 }, (_, indice) => ({
    ...dados().recomendacoes[0],
    id: `rec-${indice}`,
    titulo: `Observação de número ${indice} sobre o desempenho recente`,
  }));

  const texto = comoTexto(gerarRelatorioPdf(dados({ canais: muitos, recomendacoes: conselhos })));
  const total = Number(texto.match(/\/Count (\d+)/)![1]);

  assert.ok(total > 1, "26 canais e 12 recomendações deveriam passar de uma página");
  // Nenhum canal pode ter sido engolido pela quebra de página.
  for (let indice = 0; indice < 26; indice += 1) {
    assert.ok(texto.includes(`Canal número ${indice}`), `sumiu o canal ${indice}`);
  }
  // Os títulos de seção saem em caixa alta, e os parênteses saem escapados
  // dentro do literal do PDF.
  assert.ok(
    texto.includes("CANAL A CANAL \\(CONTINUAÇÃO\\)"),
    "faltou o cabeçalho de continuação na página seguinte",
  );
});

test("projeto sem histórico gera relatório sem inventar gráfico", () => {
  const vazio = dados({
    serie: [],
    canais: [],
    recomendacoes: [],
    resumo: {
      followers: 0,
      followersDelta: 0,
      followersDeltaPct: 0,
      reach: 0,
      reachDelta: 0,
      engagement: 0,
      engagementDelta: 0,
      engagementRate: 0,
      adSpend: 0,
    },
    split: {
      organic: { reach: 0, impressions: 0, engagement: 0 },
      paid: { reach: 0, impressions: 0, engagement: 0, spend: 0 },
    },
  });

  const texto = comoTexto(gerarRelatorioPdf(vazio));
  assert.match(texto, /%%EOF/);
  assert.match(texto, /base suficiente/, "deveria dizer por que não há recomendações");
});

test("uma série plana não divide por zero", () => {
  const plana = serie(20).map((dia) => ({ ...dia, followers: 5000 }));
  const texto = comoTexto(gerarRelatorioPdf(dados({ serie: plana })));

  assert.match(texto, /%%EOF/);
  assert.equal(/NaN|Infinity/.test(texto), false, "número inválido escapou para o arquivo");
});

test("nomes muito longos são cortados em vez de invadir a coluna vizinha", () => {
  const comprido = {
    ...dados().canais[0],
    nome: "Um nome de canal absurdamente comprido que jamais caberia na coluna reservada a ele",
  };
  const bytes = gerarRelatorioPdf(dados({ canais: [comprido] }));

  // As reticências viram o byte 133 do WinAnsi, não o caractere Unicode.
  assert.ok(bytes.includes(133), "o nome deveria ter sido cortado com reticências");
  assert.equal(
    comoTexto(bytes).includes("reservada a ele"),
    false,
    "o fim do nome não deveria ter sido desenhado",
  );
});
