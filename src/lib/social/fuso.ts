/**
 * Fuso horário, com a base de dados que já vem com a plataforma.
 *
 * Existe como módulo próprio porque **dois importadores diferentes precisam da
 * mesma conta**: a agenda do Google declara `TZID=America/Sao_Paulo` nos
 * eventos, e a exportação de métricas do Instagram vem com o horário no fuso do
 * relatório, que não é o da campanha. Duplicar essa aritmética em dois lugares
 * seria garantir que um dos dois fica errado quando o horário de verão mudar em
 * algum lugar do mundo.
 *
 * Módulo puro.
 */

/**
 * O deslocamento de um fuso nomeado num instante, em minutos.
 *
 * `Intl` carrega a base de fusos completa no Node e no navegador; reimplementar
 * as regras de horário de verão aqui seria escrever de novo um dado que já vem
 * com a plataforma — e errar nas bordas, que é onde ele importa.
 */
export function deslocamentoDoFuso(instante: number, fuso: string): number {
  const formatador = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const partes = Object.fromEntries(
    formatador.formatToParts(new Date(instante)).map((parte) => [parte.type, parte.value]),
  );

  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    // Meia-noite volta como "24" em algumas versões do ICU.
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );

  return (comoUtc - instante) / 60000;
}

/**
 * O instante em que um horário de parede acontece, num fuso nomeado.
 *
 * Duas passadas: a primeira estima o deslocamento pelo palpite, a segunda o
 * confirma no instante corrigido. É o que resolve as horas que ficam em cima da
 * virada do horário de verão, onde o deslocamento antes e depois é diferente.
 */
export function instanteNaZona(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
  segundo: number,
  fuso: string,
): number {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  const primeiro = palpite - deslocamentoDoFuso(palpite, fuso) * 60000;
  return palpite - deslocamentoDoFuso(primeiro, fuso) * 60000;
}

/**
 * O fuso em que a campanha trabalha.
 *
 * Constante porque hoje há uma campanha só, e uma constante nomeada é melhor do
 * que `getHours()` espalhado. Quando a plataforma atender campanhas em fusos
 * diferentes, vira campo do projeto — e o único lugar a mudar é este.
 */
export const FUSO_DA_CAMPANHA = "America/Sao_Paulo";

/** O dia da semana e a hora de um instante, no fuso pedido. */
export type ParedeNaZona = {
  /** 0 = domingo. */
  diaDaSemana: number;
  hora: number;
  minuto: number;
  /** AAAA-MM-DD naquele fuso. */
  dia: string;
};

/**
 * Onde o relógio estava, naquele fuso, naquele instante.
 *
 * Existe para tirar `Date.getHours()` da análise. `getHours()` devolve a hora
 * **da máquina que roda o código** — em desenvolvimento é o horário de quem
 * programa, e numa hospedagem é quase sempre UTC. A campanha de agosto tem uma
 * publicação às 02h31 de São Paulo, que em UTC é 05h31: a mesma peça cairia em
 * dois blocos do dia diferentes dependendo de onde o servidor está ligado, e a
 * recomendação de horário mudaria com a hospedagem.
 */
export function paredeNaZona(instante: Date | string | number, fuso: string): ParedeNaZona {
  const data = instante instanceof Date ? instante : new Date(instante);

  const formatador = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const partes = Object.fromEntries(
    formatador.formatToParts(data).map((parte) => [parte.type, parte.value]),
  );

  const DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    diaDaSemana: Math.max(DIAS.indexOf(partes.weekday ?? "Sun"), 0),
    // Meia-noite volta como "24" em algumas versões do ICU.
    hora: Number(partes.hour) % 24,
    minuto: Number(partes.minute),
    dia: `${partes.year}-${partes.month}-${partes.day}`,
  };
}
