/**
 * A malha do estado: um território por município, a partir das sedes.
 *
 * O mapa em bolinhas responde "quanto", e responde bem. Não responde "quanto do
 * estado" — e é essa a pergunta de uma campanha estadual. Território pintado
 * responde: dá para ver a mancha crescer, ver onde ela para, e ver o vazio ao
 * lado dela com o mesmo peso visual que a área ocupada.
 *
 * **O que estas áreas são, e o que não são.** São células de Voronoi das sedes
 * municipais: cada ponto do estado pertence ao município cuja sede está mais
 * perto. Não são os limites do IBGE. A diferença é pequena onde as cidades se
 * distribuem com regularidade e cresce onde um município é comprido ou tem a
 * sede num canto. Serve para ler alcance e prioridade no espaço; não serve para
 * medir área nem para dizer onde uma divisa passa — e a tela diz isso.
 *
 * A escolha é deliberada: a malha oficial do estado custa alguns megabytes, e
 * a demonstração precisa continuar cabendo num arquivo que se manda por
 * mensagem. Voronoi sobre coordenadas que já estão no repositório custa zero
 * bytes de download.
 *
 * Módulo puro.
 */

export type Ponto = { x: number; y: number };
export type Poligono = Ponto[];

/**
 * Corta um polígono por uma reta, guardando o lado de dentro.
 *
 * Sutherland–Hodgman. A reta é dada por um ponto e uma normal que aponta para
 * fora; tudo que estiver do lado da normal é descartado.
 */
export function cortarPorReta(poligono: Poligono, sobre: Ponto, normal: Ponto): Poligono {
  if (poligono.length === 0) return [];

  const distancia = (p: Ponto) => (p.x - sobre.x) * normal.x + (p.y - sobre.y) * normal.y;
  const resultado: Poligono = [];

  for (let i = 0; i < poligono.length; i += 1) {
    const atual = poligono[i];
    const proximo = poligono[(i + 1) % poligono.length];
    const dAtual = distancia(atual);
    const dProximo = distancia(proximo);

    if (dAtual <= 0) resultado.push(atual);

    // Trocou de lado: o cruzamento entra como vértice novo.
    if ((dAtual < 0 && dProximo > 0) || (dAtual > 0 && dProximo < 0)) {
      const t = dAtual / (dAtual - dProximo);
      resultado.push({
        x: atual.x + t * (proximo.x - atual.x),
        y: atual.y + t * (proximo.y - atual.y),
      });
    }
  }

  return resultado;
}

/** Envoltória convexa, por varredura de Andrew. */
export function envoltoriaConvexa(pontos: Ponto[]): Poligono {
  if (pontos.length < 3) return [...pontos];

  const ordenados = [...pontos].sort((a, b) => a.x - b.x || a.y - b.y);
  const cruz = (o: Ponto, a: Ponto, b: Ponto) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const metade = (lista: Ponto[]): Ponto[] => {
    const pilha: Ponto[] = [];
    for (const ponto of lista) {
      while (
        pilha.length >= 2 &&
        cruz(pilha[pilha.length - 2], pilha[pilha.length - 1], ponto) <= 0
      ) {
        pilha.pop();
      }
      pilha.push(ponto);
    }
    pilha.pop();
    return pilha;
  };

  return [...metade(ordenados), ...metade([...ordenados].reverse())];
}

/** Um polígono regular, usado para limitar o alcance de uma célula de borda. */
export function circulo(centro: Ponto, raio: number, lados = 16): Poligono {
  return Array.from({ length: lados }, (_, i) => {
    const angulo = (i / lados) * Math.PI * 2;
    return { x: centro.x + Math.cos(angulo) * raio, y: centro.y + Math.sin(angulo) * raio };
  });
}

/** Área do polígono, por fórmula do laço. Positiva independentemente do sentido. */
export function area(poligono: Poligono): number {
  let soma = 0;
  for (let i = 0; i < poligono.length; i += 1) {
    const atual = poligono[i];
    const proximo = poligono[(i + 1) % poligono.length];
    soma += atual.x * proximo.y - proximo.x * atual.y;
  }
  return Math.abs(soma) / 2;
}

function distancia(a: Ponto, b: Ponto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Área com sinal: positiva quando o polígono está em sentido anti-horário. */
function areaComSinal(poligono: Poligono): number {
  let soma = 0;
  for (let i = 0; i < poligono.length; i += 1) {
    const atual = poligono[i];
    const proximo = poligono[(i + 1) % poligono.length];
    soma += atual.x * proximo.y - proximo.x * atual.y;
  }
  return soma / 2;
}

function emSentidoAntiHorario(poligono: Poligono): Poligono {
  return areaComSinal(poligono) < 0 ? [...poligono].reverse() : poligono;
}

export type OpcoesDaMalha = {
  /**
   * Quantos vizinhos entram no corte de cada célula.
   *
   * A célula de Voronoi só depende dos vizinhos próximos; cortar contra os 645
   * sítios daria o mesmo resultado e custaria cem vezes mais. Trinta é folgado
   * para uma distribuição como a do estado.
   */
  vizinhos?: number;
  /**
   * Quantas vezes a distância ao quinto vizinho uma célula pode se esticar.
   *
   * Sem este limite, as células da borda crescem até a envoltória e o estado
   * ganha uma moldura reta que não existe. Com ele, o contorno acompanha a
   * distribuição real das cidades — que é o que desenha o formato de São Paulo.
   *
   * O valor é um ajuste visual: acima de 2 a fronteira oeste vira um leque
   * convexo, e abaixo de 1,3 aparecem farpas entre municípios distantes.
   */
  esticamento?: number;
  /**
   * Aparar as células pela envoltória convexa dos sítios.
   *
   * Fazia sentido quando a envoltória era a única borda que existia. Depois que
   * o desenho passou a recortar pelo contorno côncavo do estado, o corte
   * convexo virou um segundo limite mais apertado que o primeiro — e as
   * células paravam antes da borda, deixando um fio branco em volta do mapa.
   */
  limitarPelaEnvoltoria?: boolean;
};

/**
 * Monta a malha: um polígono por sítio.
 *
 * Devolve na mesma ordem dos sítios recebidos, para o chamador poder casar
 * índice com índice sem depender de identificador.
 */
export function construirMalha(sitios: Ponto[], opcoes: OpcoesDaMalha = {}): Poligono[] {
  const vizinhos = opcoes.vizinhos ?? 30;
  const esticamento = opcoes.esticamento ?? 1.6;
  if (sitios.length === 0) return [];
  if (sitios.length === 1) return [circulo(sitios[0], 0.5, 24)];

  // O sentido do contorno decide para que lado a normal aponta. Normalizar aqui
  // evita depender de como a envoltória saiu ordenada — com o sinal trocado, o
  // corte guardaria o lado de fora e todas as células virariam nada.
  const limitarPelaEnvoltoria = opcoes.limitarPelaEnvoltoria ?? true;
  const contorno = limitarPelaEnvoltoria ? emSentidoAntiHorario(envoltoriaConvexa(sitios)) : [];

  return sitios.map((sitio, indice) => {
    const ordenados = sitios
      .map((outro, i) => ({ outro, i, d: distancia(sitio, outro) }))
      .filter((entrada) => entrada.i !== indice)
      .sort((a, b) => a.d - b.d);

    const quintoVizinho = ordenados[Math.min(4, ordenados.length - 1)].d;
    let celula = circulo(sitio, quintoVizinho * esticamento, 20);

    // Corta contra a envoltória: nenhuma célula passa do estado.
    for (let i = 0; i < contorno.length; i += 1) {
      const a = contorno[i];
      const b = contorno[(i + 1) % contorno.length];
      const aresta = { x: b.x - a.x, y: b.y - a.y };
      // Normal para fora de um contorno anti-horário.
      celula = cortarPorReta(celula, a, { x: aresta.y, y: -aresta.x });
      if (celula.length === 0) break;
    }

    // E contra a mediatriz de cada vizinho: é isto que define o Voronoi.
    for (const { outro } of ordenados.slice(0, vizinhos)) {
      const meio = { x: (sitio.x + outro.x) / 2, y: (sitio.y + outro.y) / 2 };
      const normal = { x: outro.x - sitio.x, y: outro.y - sitio.y };
      celula = cortarPorReta(celula, meio, normal);
      if (celula.length === 0) break;
    }

    return celula;
  });
}

/** O caminho SVG de um polígono, com as casas decimais que o desenho precisa. */
export function caminhoSvg(poligono: Poligono, escala = 1, casas = 2): string {
  if (poligono.length === 0) return "";
  const n = (valor: number) => Number((valor * escala).toFixed(casas));
  return `M${poligono.map((ponto) => `${n(ponto.x)},${n(ponto.y)}`).join("L")}Z`;
}
