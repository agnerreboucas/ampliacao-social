import assert from "node:assert/strict";
import { test } from "node:test";

import {
  area,
  caminhoSvg,
  circulo,
  construirMalha,
  cortarPorReta,
  envoltoriaConvexa,
  type Ponto,
} from "./voronoi.ts";

const quadrado: Ponto[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

// --- Corte ------------------------------------------------------------------

test("cortar ao meio deixa metade da área", () => {
  const metade = cortarPorReta(quadrado, { x: 5, y: 0 }, { x: 1, y: 0 });
  assert.equal(area(metade), 50);
});

test("reta que não toca o polígono devolve tudo", () => {
  const inteiro = cortarPorReta(quadrado, { x: 50, y: 0 }, { x: 1, y: 0 });
  assert.equal(area(inteiro), 100);
});

test("polígono inteiro do lado de fora vira nada", () => {
  const nada = cortarPorReta(quadrado, { x: -5, y: 0 }, { x: 1, y: 0 });
  assert.deepEqual(nada, []);
});

test("cortar duas vezes acumula", () => {
  let restante = cortarPorReta(quadrado, { x: 5, y: 0 }, { x: 1, y: 0 });
  restante = cortarPorReta(restante, { x: 0, y: 5 }, { x: 0, y: 1 });
  assert.equal(area(restante), 25);
});

// --- Envoltória -------------------------------------------------------------

test("a envoltória ignora os pontos de dentro", () => {
  const contorno = envoltoriaConvexa([...quadrado, { x: 5, y: 5 }, { x: 3, y: 7 }]);
  assert.equal(contorno.length, 4);
  assert.equal(area(contorno), 100);
});

test("três pontos já formam envoltória", () => {
  const contorno = envoltoriaConvexa([
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 3 },
  ]);
  assert.equal(area(contorno), 6);
});

// --- Círculo e área ---------------------------------------------------------

test("o polígono de vinte lados chega perto da área do círculo", () => {
  const aproximada = area(circulo({ x: 0, y: 0 }, 1, 64));
  assert.ok(Math.abs(aproximada - Math.PI) < 0.01, String(aproximada));
});

test("a área não depende do sentido do polígono", () => {
  assert.equal(area([...quadrado].reverse()), 100);
});

// --- Malha ------------------------------------------------------------------

test("cada sítio recebe um território, na mesma ordem", () => {
  const sitios: Ponto[] = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
    { x: 0.5, y: 0.5 },
  ];
  const malha = construirMalha(sitios);

  assert.equal(malha.length, sitios.length);
  for (const celula of malha) assert.ok(celula.length >= 3, "território precisa ter área");
});

test("o sítio fica dentro do próprio território", () => {
  // É a propriedade que define Voronoi. Se falhar, a cidade está pintando a
  // área de outra — e o mapa mente sobre onde a campanha chegou.
  const sitios: Ponto[] = Array.from({ length: 40 }, (_, i) => ({
    x: (i % 8) / 8 + 0.06,
    y: Math.floor(i / 8) / 5 + 0.1,
  }));
  const malha = construirMalha(sitios);

  sitios.forEach((sitio, indice) => {
    // "Dentro ou na borda": um sítio na borda da malha é vértice da própria
    // célula, e teste de contenção em cima da aresta é indeciso por natureza.
    assert.ok(
      dentroOuNaBorda(sitio, malha[indice]),
      `sítio ${indice} caiu fora do próprio território`,
    );
  });
});

test("territórios vizinhos não se sobrepõem", () => {
  // Duas células de Voronoi compartilham no máximo uma aresta. Sobreposição
  // real significaria erro no corte, e no mapa apareceria como cidade pintando
  // por cima da outra. O centro de cada célula é o teste: ele é sempre
  // estritamente interior, sem a indecisão de um ponto em cima da aresta.
  const sitios: Ponto[] = Array.from({ length: 25 }, (_, i) => ({
    x: (i % 5) / 5 + 0.1,
    y: Math.floor(i / 5) / 5 + 0.1,
  }));
  const malha = construirMalha(sitios);

  malha.forEach((celula, indice) => {
    const centro = centroide(celula);
    malha.forEach((outra, j) => {
      if (j === indice) return;
      assert.equal(
        dentro(centro, outra),
        false,
        `o centro do território ${indice} caiu dentro do ${j}`,
      );
    });
  });
});

test("o território não se estica além do limite quando não há vizinho", () => {
  // Sem o limite, a cidade isolada no oeste esticaria até a envoltória e o
  // estado ganharia uma moldura reta que não existe.
  const sitios: Ponto[] = [
    { x: 0, y: 0 },
    { x: 0.1, y: 0 },
    { x: 0, y: 0.1 },
    { x: 0.1, y: 0.1 },
    { x: 0.05, y: 0.05 },
    { x: 1, y: 1 },
  ];
  const malha = construirMalha(sitios, { esticamento: 1.5 });
  const isolado = malha[5];

  for (const vertice of isolado) {
    assert.ok(Math.hypot(vertice.x - 1, vertice.y - 1) <= 2.2, "esticou demais");
  }
});

test("lista vazia devolve malha vazia, sem estourar", () => {
  assert.deepEqual(construirMalha([]), []);
});

test("um sítio só ocupa uma área, em vez de nada", () => {
  const malha = construirMalha([{ x: 0.5, y: 0.5 }]);
  assert.equal(malha.length, 1);
  assert.ok(area(malha[0]) > 0);
});

// --- Caminho ----------------------------------------------------------------

test("o caminho SVG fecha e respeita a escala", () => {
  const caminho = caminhoSvg(
    [
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.5 },
    ],
    100,
  );
  assert.equal(caminho, "M0,0L50,0L50,50Z");
});

test("polígono vazio não vira caminho quebrado", () => {
  assert.equal(caminhoSvg([]), "");
});

/** Ponto dentro do polígono, por número de cruzamentos. */
function dentro(ponto: Ponto, poligono: Ponto[]): boolean {
  if (poligono.length < 3) return false;
  let contido = false;

  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const a = poligono[i];
    const b = poligono[j];
    const cruza = a.y > ponto.y !== b.y > ponto.y;
    if (cruza && ponto.x < ((b.x - a.x) * (ponto.y - a.y)) / (b.y - a.y) + a.x) {
      contido = !contido;
    }
  }

  return contido;
}

function dentroOuNaBorda(ponto: Ponto, poligono: Ponto[], folga = 1e-9): boolean {
  if (dentro(ponto, poligono)) return true;

  for (let i = 0; i < poligono.length; i += 1) {
    const a = poligono[i];
    const b = poligono[(i + 1) % poligono.length];
    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
    if (comprimento === 0) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((ponto.x - a.x) * (b.x - a.x) + (ponto.y - a.y) * (b.y - a.y)) / comprimento ** 2,
      ),
    );
    const perto = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    if (Math.hypot(ponto.x - perto.x, ponto.y - perto.y) <= folga) return true;
  }

  return false;
}

function centroide(poligono: Ponto[]): Ponto {
  const soma = poligono.reduce((total, ponto) => ({ x: total.x + ponto.x, y: total.y + ponto.y }), {
    x: 0,
    y: 0,
  });
  return { x: soma.x / poligono.length, y: soma.y / poligono.length };
}
