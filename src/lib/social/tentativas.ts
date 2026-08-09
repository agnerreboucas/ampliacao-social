/**
 * Limite de tentativas de login.
 *
 * Sem isto, uma senha pode ser adivinhada por força bruta em silêncio — e numa
 * campanha, a plataforma é alvo. A defesa é atraso crescente: as primeiras
 * tentativas erradas passam sem atrito, e a partir daí cada erro custa mais
 * tempo, até um bloqueio temporário.
 *
 * A escolha por atraso em vez de bloqueio imediato é deliberada. Bloquear cedo
 * transforma o mecanismo em arma: qualquer pessoa erraria a senha de propósito
 * três vezes para trancar a conta de outra. O atraso encarece o ataque sem
 * tirar o acesso de quem é dono.
 *
 * Módulo puro: recebe o relógio e o estado, devolve a decisão. O armazenamento
 * fica do lado do servidor.
 */

export type Tentativas = {
  /** Erros seguidos. Zera a cada acerto. */
  erros: number;
  /** Quando o último erro aconteceu, em ms. */
  ultimoErroEm: number;
  /** Bloqueado até este instante, em ms. */
  bloqueadoAte: number;
};

export const TENTATIVAS_ZERADAS: Tentativas = { erros: 0, ultimoErroEm: 0, bloqueadoAte: 0 };

/** A partir daqui cada erro passa a custar espera. */
export const ERROS_ANTES_DO_ATRASO = 3;

/** A partir daqui a conta fica bloqueada por um tempo. */
export const ERROS_ANTES_DO_BLOQUEIO = 8;

export const BLOQUEIO_MS = 15 * 60 * 1000;

/** Depois deste tempo sem erro, a contagem recomeça — quem errou ontem não paga hoje. */
export const JANELA_MS = 30 * 60 * 1000;

const ATRASO_BASE_MS = 1000;
const ATRASO_MAXIMO_MS = 30 * 1000;

/**
 * Quanto esperar antes de responder a esta tentativa.
 *
 * Dobra a cada erro além do limite: 1s, 2s, 4s… até 30s. Nas primeiras
 * tentativas é zero, porque errar a senha algumas vezes é humano.
 */
export function atrasoDe(erros: number): number {
  if (erros < ERROS_ANTES_DO_ATRASO) return 0;
  const passos = erros - ERROS_ANTES_DO_ATRASO;
  return Math.min(ATRASO_BASE_MS * 2 ** passos, ATRASO_MAXIMO_MS);
}

export type Decisao =
  | { permitido: true; atrasoMs: number }
  | { permitido: false; liberaEm: number; segundosRestantes: number };

/** Esta tentativa pode prosseguir? E, se sim, depois de quanto tempo? */
export function avaliar(tentativas: Tentativas, agoraMs: number): Decisao {
  if (tentativas.bloqueadoAte > agoraMs) {
    return {
      permitido: false,
      liberaEm: tentativas.bloqueadoAte,
      segundosRestantes: Math.ceil((tentativas.bloqueadoAte - agoraMs) / 1000),
    };
  }

  const erros = dentroDaJanela(tentativas, agoraMs) ? tentativas.erros : 0;
  return { permitido: true, atrasoMs: atrasoDe(erros) };
}

function dentroDaJanela(tentativas: Tentativas, agoraMs: number): boolean {
  return agoraMs - tentativas.ultimoErroEm < JANELA_MS;
}

/** Estado depois de uma tentativa errada. */
export function registrarErro(tentativas: Tentativas, agoraMs: number): Tentativas {
  const anteriores = dentroDaJanela(tentativas, agoraMs) ? tentativas.erros : 0;
  const erros = anteriores + 1;

  return {
    erros,
    ultimoErroEm: agoraMs,
    bloqueadoAte: erros >= ERROS_ANTES_DO_BLOQUEIO ? agoraMs + BLOQUEIO_MS : 0,
  };
}

/** Estado depois de um acerto: limpo. Quem entrou provou que é dono. */
export function registrarAcerto(): Tentativas {
  return { ...TENTATIVAS_ZERADAS };
}

/**
 * Mensagem para quem está bloqueado.
 *
 * Diz quanto falta, porque "tente mais tarde" sem prazo é a pior das respostas
 * para quem simplesmente esqueceu a senha.
 */
export function mensagemDeBloqueio(segundosRestantes: number): string {
  const minutos = Math.ceil(segundosRestantes / 60);
  if (minutos <= 1) return "Muitas tentativas. Tente de novo em um minuto.";
  return `Muitas tentativas. Tente de novo em ${minutos} minutos.`;
}
