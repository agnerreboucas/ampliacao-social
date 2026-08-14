import type { Ponto, Poligono } from "./voronoi.ts";

/**
 * O contorno do estado, tirado das próprias sedes municipais.
 *
 * A envoltória convexa dava um formato errado: São Paulo tem litoral recortado,
 * uma reentrância no Vale do Paraíba e uma ponta no Pontal do Paranapanema —
 * nada disso é convexo, e o mapa saía com bordas retas onde o estado tem
 * curvas. Um mapa que não parece o estado é um mapa em que ninguém confia.
 *
 * A malha oficial do IBGE resolveria, e custa alguns megabytes que a
 * demonstração num arquivo só não tem para gastar. A saída é usar o que já está
 * aqui: **645 sedes espalhadas pelo estado desenham o estado.** O contorno sai
 * da região a menos de um raio de alguma sede — uma envoltória côncava, em
 * termos técnicos, e o formato de São Paulo em termos práticos.
 *
 * Como é feito, e por quê:
 *
 * **Grade e marcha de quadrados.** A alternativa clássica é triangulação de
 * Delaunay com filtro de arestas longas, que exige a triangulação inteira para
 * usar só a borda dela. A grade resolve o mesmo com aritmética de vetor e um
 * laço, e a resolução é um parâmetro em vez de um efeito colateral.
 *
 * **O raio é a única escolha subjetiva.** Grande demais, o estado engorda e o
 * litoral vira uma linha reta; pequeno demais, aparecem buracos no oeste, onde
 * os municípios são grandes e distantes. O valor sai da distribuição real das
 * distâncias entre vizinhos, e não de um número escolhido a olho.
 *
 * Módulo puro.
 */

export type OpcoesDoContorno = {
  /** Quantas células na direção mais longa. Mais células, borda mais fina. */
  resolucao?: number;
  /**
   * Raio de influência de cada sede, em múltiplos da distância típica entre
   * vizinhos. É o que fecha os vãos do oeste sem inchar a região metropolitana.
   */
  raio?: number;
};

/** A distância típica entre uma sede e a mais próxima dela. */
export function distanciaTipica(pontos: Ponto[]): number {
  if (pontos.length < 2) return 0;

  const vizinhas = pontos.map((ponto) => {
    let menor = Infinity;
    for (const outro of pontos) {
      if (outro === ponto) continue;
      const d = Math.hypot(ponto.x - outro.x, ponto.y - outro.y);
      if (d < menor) menor = d;
    }
    return menor;
  });

  // Mediana, e não média: um punhado de municípios isolados no oeste puxaria a
  // média para cima e engordaria o estado inteiro para resolver o caso deles.
  const ordenadas = [...vizinhas].sort((a, b) => a - b);
  return ordenadas[Math.floor(ordenadas.length / 2)];
}

/**
 * Traça o contorno da região coberta pelas sedes.
 *
 * Devolve o maior anel encontrado — o estado. Ilhas de uma sede solta viram
 * anéis pequenos e são descartadas: elas existem por causa da grade, não do
 * território.
 */
export function tracarContorno(pontos: Ponto[], opcoes: OpcoesDoContorno = {}): Poligono {
  if (pontos.length < 3) return [];

  const resolucao = opcoes.resolucao ?? 260;
  const raio = (opcoes.raio ?? 1.9) * distanciaTipica(pontos);

  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  // A margem garante que a borda da grade nunca corte a região: um contorno que
  // encosta na moldura fecha com uma linha reta artificial.
  const margem = raio * 1.5;
  const minX = Math.min(...xs) - margem;
  const maxX = Math.max(...xs) + margem;
  const minY = Math.min(...ys) - margem;
  const maxY = Math.max(...ys) + margem;

  const largura = maxX - minX;
  const altura = maxY - minY;
  const passo = Math.max(largura, altura) / resolucao;
  const colunas = Math.ceil(largura / passo) + 1;
  const linhas = Math.ceil(altura / passo) + 1;

  /**
   * Um índice em grade das sedes, para não medir 645 distâncias por célula.
   *
   * Sem ele são 60 mil células vezes 645 sedes; com ele, cada célula olha só as
   * sedes das caixas vizinhas. É a diferença entre segundos e minutos no build.
   */
  const ladoDaCaixa = raio;
  const caixas = new Map<string, Ponto[]>();
  const chaveDaCaixa = (x: number, y: number) =>
    `${Math.floor(x / ladoDaCaixa)},${Math.floor(y / ladoDaCaixa)}`;
  for (const ponto of pontos) {
    const chave = chaveDaCaixa(ponto.x, ponto.y);
    caixas.set(chave, [...(caixas.get(chave) ?? []), ponto]);
  }

  const dentro = (x: number, y: number): boolean => {
    const cx = Math.floor(x / ladoDaCaixa);
    const cy = Math.floor(y / ladoDaCaixa);
    for (let i = cx - 1; i <= cx + 1; i += 1) {
      for (let j = cy - 1; j <= cy + 1; j += 1) {
        for (const ponto of caixas.get(`${i},${j}`) ?? []) {
          if (Math.hypot(ponto.x - x, ponto.y - y) <= raio) return true;
        }
      }
    }
    return false;
  };

  const campo: boolean[][] = [];
  for (let linha = 0; linha < linhas; linha += 1) {
    const y = minY + linha * passo;
    const atual: boolean[] = [];
    for (let coluna = 0; coluna < colunas; coluna += 1) {
      atual.push(dentro(minX + coluna * passo, y));
    }
    campo.push(atual);
  }

  const segmentos = marcharQuadrados(campo, minX, minY, passo);
  const aneis = costurarAneis(segmentos, passo);
  if (aneis.length === 0) return [];

  return aneis.reduce((maior, anel) => (anel.length > maior.length ? anel : maior), aneis[0]);
}

type Segmento = [Ponto, Ponto];

/**
 * Marcha de quadrados: cada quadrado da grade vira zero, um ou dois segmentos.
 *
 * Os vértices são interpolados no meio da aresta. Poderiam ser interpolados
 * pela distância exata à sede mais próxima, o que suavizaria a linha; o meio
 * basta porque a resolução da grade já é mais fina que a espessura do traço.
 */
function marcharQuadrados(
  campo: boolean[][],
  minX: number,
  minY: number,
  passo: number,
): Segmento[] {
  const segmentos: Segmento[] = [];

  for (let linha = 0; linha < campo.length - 1; linha += 1) {
    for (let coluna = 0; coluna < campo[linha].length - 1; coluna += 1) {
      const x = minX + coluna * passo;
      const y = minY + linha * passo;

      const superiorEsquerdo = campo[linha][coluna];
      const superiorDireito = campo[linha][coluna + 1];
      const inferiorDireito = campo[linha + 1][coluna + 1];
      const inferiorEsquerdo = campo[linha + 1][coluna];

      const caso =
        (superiorEsquerdo ? 8 : 0) +
        (superiorDireito ? 4 : 0) +
        (inferiorDireito ? 2 : 0) +
        (inferiorEsquerdo ? 1 : 0);

      const cima = { x: x + passo / 2, y };
      const direita = { x: x + passo, y: y + passo / 2 };
      const baixo = { x: x + passo / 2, y: y + passo };
      const esquerda = { x, y: y + passo / 2 };

      switch (caso) {
        case 1:
        case 14:
          segmentos.push([esquerda, baixo]);
          break;
        case 2:
        case 13:
          segmentos.push([baixo, direita]);
          break;
        case 3:
        case 12:
          segmentos.push([esquerda, direita]);
          break;
        case 4:
        case 11:
          segmentos.push([cima, direita]);
          break;
        case 6:
        case 9:
          segmentos.push([cima, baixo]);
          break;
        case 7:
        case 8:
          segmentos.push([esquerda, cima]);
          break;
        // Casos 5 e 10 são as selas, em que as duas diagonais são ambíguas.
        // Resolvê-las com dois segmentos cada mantém a linha fechada; a escolha
        // entre as duas leituras muda um pixel e nunca o formato.
        case 5:
          segmentos.push([esquerda, cima], [baixo, direita]);
          break;
        case 10:
          segmentos.push([cima, direita], [esquerda, baixo]);
          break;
        default:
          break;
      }
    }
  }

  return segmentos;
}

/**
 * Junta os segmentos soltos em anéis fechados.
 *
 * A marcha de quadrados devolve os segmentos sem orientação combinada: um pode
 * sair da esquerda para baixo e o vizinho, de baixo para a esquerda. Indexar só
 * pela ponta inicial parte a costura no primeiro segmento invertido — e o anel
 * volta com um pedaço do estado em vez do estado. Por isso o índice guarda as
 * duas pontas, e a caminhada continua pela ponta que sobrou.
 */
function costurarAneis(segmentos: Segmento[], passo: number): Poligono[] {
  const tolerancia = passo / 4;
  const chave = (ponto: Ponto) =>
    `${Math.round(ponto.x / tolerancia)},${Math.round(ponto.y / tolerancia)}`;

  const porPonta = new Map<string, Segmento[]>();
  const guardar = (ponto: Ponto, segmento: Segmento) => {
    const k = chave(ponto);
    porPonta.set(k, [...(porPonta.get(k) ?? []), segmento]);
  };
  for (const segmento of segmentos) {
    guardar(segmento[0], segmento);
    guardar(segmento[1], segmento);
  }

  const usados = new Set<Segmento>();
  const aneis: Poligono[] = [];

  for (const inicial of segmentos) {
    if (usados.has(inicial)) continue;

    usados.add(inicial);
    const anel: Ponto[] = [inicial[0], inicial[1]];
    let ponta = inicial[1];

    // O limite existe para o caso de a costura não fechar por ruído numérico:
    // um laço infinito no build é pior que um anel incompleto descartado.
    for (let passos = 0; passos < segmentos.length + 1; passos += 1) {
      const candidatos = (porPonta.get(chave(ponta)) ?? []).filter(
        (candidato) => !usados.has(candidato),
      );
      if (candidatos.length === 0) break;

      const proximo = candidatos[0];
      usados.add(proximo);
      // Continua pela ponta oposta àquela por onde se entrou.
      ponta = chave(proximo[0]) === chave(ponta) ? proximo[1] : proximo[0];
      anel.push(ponta);
    }

    if (anel.length >= 4) aneis.push(anel);
  }

  return aneis;
}

/**
 * Tira os vértices que não mudam o formato (Ramer–Douglas–Peucker).
 *
 * A marcha de quadrados devolve um vértice por aresta cruzada — milhares deles,
 * quase todos em cima da mesma reta. Simplificar corta o arquivo em uma ordem
 * de grandeza sem que o olho perceba diferença.
 */
export function simplificar(poligono: Poligono, tolerancia: number): Poligono {
  if (poligono.length < 3) return poligono;

  const distanciaDaReta = (ponto: Ponto, a: Ponto, b: Ponto): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const comprimento = Math.hypot(dx, dy);
    if (comprimento === 0) return Math.hypot(ponto.x - a.x, ponto.y - a.y);
    return Math.abs(dy * ponto.x - dx * ponto.y + b.x * a.y - b.y * a.x) / comprimento;
  };

  const reduzir = (pontos: Ponto[]): Ponto[] => {
    if (pontos.length < 3) return pontos;

    let maior = 0;
    let indice = 0;
    for (let i = 1; i < pontos.length - 1; i += 1) {
      const d = distanciaDaReta(pontos[i], pontos[0], pontos[pontos.length - 1]);
      if (d > maior) {
        maior = d;
        indice = i;
      }
    }

    if (maior <= tolerancia) return [pontos[0], pontos[pontos.length - 1]];

    return [...reduzir(pontos.slice(0, indice + 1)).slice(0, -1), ...reduzir(pontos.slice(indice))];
  };

  const simplificado = reduzir(poligono);
  return simplificado.length >= 3 ? simplificado : poligono;
}
