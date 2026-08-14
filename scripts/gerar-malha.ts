import { writeFile } from "node:fs/promises";

import { simplificar, tracarContorno } from "../src/lib/social/contorno.ts";
import { projetar } from "../src/lib/social/mapa.ts";
import { MUNICIPIOS_SP } from "../src/lib/social/municipios-sp.ts";
import { area, construirMalha, type Ponto } from "../src/lib/social/voronoi.ts";

/**
 * Gera `src/lib/social/malha-sp.ts`: o território de cada município.
 *
 * O cálculo roda aqui e não no navegador porque é O(n²) sobre 645 sedes — um
 * segundo de processador que não faz sentido gastar toda vez que alguém abre a
 * tela, para um resultado que nunca muda.
 *
 * As coordenadas saem com três casas decimais, sobre uma caixa de 0 a 1. Numa
 * tela de mil pixels isso dá um pixel de precisão, e cortar o resto derruba o
 * arquivo para menos de um terço do tamanho.
 *
 *   node --experimental-strip-types scripts/gerar-malha.ts
 */

const CASAS = 3;

const sitios: Ponto[] = MUNICIPIOS_SP.map((municipio) => projetar(municipio.lat, municipio.lon));

/**
 * As células crescem de propósito além do contorno.
 *
 * Quem recorta é o contorno do estado, no navegador, com `clip-path`. Deixar a
 * célula transbordar garante que não sobre um fio branco entre o último
 * município e a borda — e o recorte devolve a forma exata sem geometria
 * nenhuma do nosso lado. O valor é generoso porque a conta é assimétrica:
 * transbordar demais não custa nada, e transbordar de menos deixa buraco.
 */
const malha = construirMalha(sitios, { esticamento: 9, limitarPelaEnvoltoria: false });

/**
 * O raio precisa fundir os municípios isolados do oeste com o continente.
 *
 * Abaixo de 2,7 o contorno sai com excursões finas até uma sede solta, e no
 * mapa elas viram fios cinzas saindo do estado. Acima de 3,2 o litoral perde o
 * recorte e vira uma reta.
 */
const contorno = simplificar(tracarContorno(sitios, { raio: 2.9, resolucao: 420 }), 0.0008);
if (contorno.length < 30) {
  console.error("O contorno saiu curto demais para ser o estado.");
  process.exit(1);
}

const vazias = malha.filter((celula) => celula.length < 3).length;
if (vazias > 0) {
  console.error(`${vazias} municípios ficaram sem território — a malha está errada.`);
  process.exit(1);
}

const arredondar = (valor: number) => Number(valor.toFixed(CASAS));

/**
 * Vértices repetidos depois do arredondamento viram um só.
 *
 * Três casas juntam pontos que estavam a menos de um pixel de distância, e um
 * polígono com vértice duplicado desenha uma aresta de comprimento zero.
 */
function limpar(celula: Ponto[]): [number, number][] {
  const pontos: [number, number][] = [];
  for (const ponto of celula) {
    const par: [number, number] = [arredondar(ponto.x), arredondar(ponto.y)];
    const ultimo = pontos[pontos.length - 1];
    if (ultimo && ultimo[0] === par[0] && ultimo[1] === par[1]) continue;
    pontos.push(par);
  }
  // O primeiro e o último podem ter colidido também.
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  if (pontos.length > 1 && primeiro[0] === ultimo[0] && primeiro[1] === ultimo[1]) pontos.pop();
  return pontos;
}

const territorios = malha.map(limpar);

const semArea = territorios.filter((celula) => celula.length < 3).length;
if (semArea > 0) {
  console.error(`${semArea} territórios ficaram sem área depois do arredondamento.`);
  process.exit(1);
}

const caminhoDoContorno = `M${contorno
  .map(({ x, y }) => `${arredondar(x)},${arredondar(y)}`)
  .join("L")}Z`;

const linhas = territorios.map(
  (celula, indice) =>
    `  // ${MUNICIPIOS_SP[indice].nome}\n  [${celula.map(([x, y]) => `[${x},${y}]`).join(",")}],`,
);

const conteudo = `// Arquivo gerado por scripts/gerar-malha.ts. Não edite à mão.
//
// O território de cada um dos ${MUNICIPIOS_SP.length} municípios de São Paulo, na mesma ordem de
// MUNICIPIOS_SP, numa caixa de 0 a 1 (o Y vai até a proporção do estado).
//
// São células de Voronoi das sedes municipais — cada ponto pertence ao
// município cuja sede está mais perto. **Não são os limites do IBGE.** Servem
// para ler alcance e prioridade no espaço, não para medir área nem para dizer
// por onde passa uma divisa. A tela do mapa diz isso a quem olha.

export type Territorio = [number, number][];

export const MALHA_SP: Territorio[] = [
${linhas.join("\n")}
];

/**
 * O contorno do estado, como caminho SVG na mesma caixa de 0 a 1.
 *
 * Sai da envoltória côncava das ${MUNICIPIOS_SP.length} sedes — a região a menos de um raio de
 * alguma delas. É o que dá ao mapa o formato de São Paulo, com litoral
 * recortado e a ponta do Pontal, que uma envoltória convexa achatava em retas.
 * Serve de recorte para os territórios e de traço da borda.
 */
export const CONTORNO_SP = "${caminhoDoContorno}";
`;

const destino = new URL("../src/lib/social/malha-sp.ts", import.meta.url);
await writeFile(destino, conteudo, "utf-8");

const vertices = territorios.reduce((total, celula) => total + celula.length, 0);
const areaTotal = malha.reduce((total, celula) => total + area(celula), 0);

console.log(`malha-sp.ts: ${territorios.length} territórios, ${vertices} vértices`);
console.log(`média de ${(vertices / territorios.length).toFixed(1)} vértices por município`);
console.log(`área somada: ${areaTotal.toFixed(4)} (a caixa do estado tem ~0.67)`);
console.log(`contorno: ${contorno.length} vértices`);
console.log(`${(conteudo.length / 1024).toFixed(0)} kB`);
