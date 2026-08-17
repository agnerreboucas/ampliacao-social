import { instanteNaZona } from "./fuso.ts";
import type { Evento, TipoDeEvento } from "./types";

/**
 * Leitor de arquivos `.ics` — a agenda que já existe, sem pedir senha.
 *
 * O Google Calendar exporta `.ics` e publica um endereço `.ics` para qualquer
 * agenda. Ler esse formato traz a agenda inteira para dentro da plataforma sem
 * OAuth, sem token para expirar e sem pedir à campanha que autorize um
 * aplicativo a ler o calendário dela. É menos automático que uma integração —
 * alguém precisa reimportar quando a agenda muda — e é honesto sobre o que faz.
 *
 * **A reimportação não duplica.** Cada evento do arquivo tem um `UID`, e é por
 * ele que a plataforma reconhece o que já entrou. Reimportar o mesmo arquivo
 * atualiza horário e título em vez de criar uma segunda caminhada no sábado.
 *
 * O que este leitor cobre: `VEVENT` com `UID`, `SUMMARY`, `DESCRIPTION`,
 * `LOCATION`, `DTSTART` e `DTEND`, com desdobramento das linhas quebradas e
 * das sequências de escape. O que ele **não** cobre: repetição (`RRULE`),
 * fusos nomeados (`TZID`) e alarmes. Um evento que se repete entra como a
 * primeira ocorrência, e a tela diz isso — inventar as repetições a partir de
 * uma regra que não foi lida seria pior que não trazê-las.
 *
 * Módulo puro.
 */

export type EventoImportado = {
  uid: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  comecaEm: string; // ISO
  terminaEm: string | null;
  diaInteiro: boolean;
  /** O evento se repete e só a primeira ocorrência foi lida. */
  temRepeticao: boolean;
};

export type LeituraDoIcs = {
  eventos: EventoImportado[];
  /** Blocos que não deram para ler, com o motivo. O silêncio aqui seria pior. */
  ignorados: { titulo: string; motivo: string }[];
};

/**
 * Junta as linhas que o formato quebrou.
 *
 * O `.ics` corta linhas em 75 caracteres e continua na seguinte começando com
 * espaço ou tabulação. Sem juntar de volta, um título longo chega pela metade.
 */
function desdobrar(texto: string): string[] {
  const linhas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const juntas: string[] = [];

  for (const linha of linhas) {
    if ((linha.startsWith(" ") || linha.startsWith("\t")) && juntas.length > 0) {
      juntas[juntas.length - 1] += linha.slice(1);
    } else {
      juntas.push(linha);
    }
  }

  return juntas;
}

/** Desfaz as sequências de escape do formato. */
function limparValor(bruto: string): string {
  return bruto
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * Converte a data do `.ics` para um instante.
 *
 * Quatro formas aparecem em arquivos reais do Google: `20260815` (dia inteiro),
 * `20260815T120000Z` (UTC), `20260815T090000` com `TZID=America/Sao_Paulo` no
 * parâmetro, e `20260815T090000` sem nada — hora de parede sem fuso declarado.
 *
 * O `TZID` é o caso que mais dói se for ignorado: a exportação da agenda de uma
 * campanha em São Paulo traz dezenas de eventos assim, e lê-los como hora do
 * servidor coloca todos três horas fora do lugar numa máquina em UTC. Aqui o
 * fuso é respeitado quando vem declarado.
 */
export function lerDataDoIcs(
  valor: string,
  fuso?: string,
): { iso: string; diaInteiro: boolean } | null {
  const limpo = valor.trim();

  const soData = /^(\d{4})(\d{2})(\d{2})$/.exec(limpo);
  if (soData) {
    const [, ano, mes, dia] = soData;
    return {
      iso: new Date(Number(ano), Number(mes) - 1, Number(dia)).toISOString(),
      diaInteiro: true,
    };
  }

  const comHora = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(limpo);
  if (!comHora) return null;

  const [, ano, mes, dia, hora, minuto, segundo, zulu] = comHora;

  if (zulu) {
    const utc = Date.UTC(
      Number(ano),
      Number(mes) - 1,
      Number(dia),
      Number(hora),
      Number(minuto),
      Number(segundo),
    );
    return { iso: new Date(utc).toISOString(), diaInteiro: false };
  }

  if (fuso) {
    try {
      const instante = instanteNaZona(
        Number(ano),
        Number(mes),
        Number(dia),
        Number(hora),
        Number(minuto),
        Number(segundo),
        fuso,
      );
      return { iso: new Date(instante).toISOString(), diaInteiro: false };
    } catch {
      // Fuso desconhecido para o `Intl`: cai para hora de parede, que é o
      // mesmo que fazer sem a informação — e melhor que recusar o evento.
    }
  }

  const local = new Date(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo),
  );
  return { iso: local.toISOString(), diaInteiro: false };
}

export function lerIcs(texto: string): LeituraDoIcs {
  const eventos: EventoImportado[] = [];
  const ignorados: { titulo: string; motivo: string }[] = [];

  let dentro = false;
  let campos: Record<string, string> = {};

  for (const linha of desdobrar(texto)) {
    if (linha.trim() === "BEGIN:VEVENT") {
      dentro = true;
      campos = {};
      continue;
    }

    if (linha.trim() === "END:VEVENT") {
      dentro = false;
      const titulo = limparValor(campos.SUMMARY ?? "") || "(sem título)";
      const inicio = campos.DTSTART ? lerDataDoIcs(campos.DTSTART, campos.DTSTART__TZID) : null;

      if (!inicio) {
        ignorados.push({ titulo, motivo: "sem data de início legível" });
        continue;
      }
      if (!campos.UID) {
        ignorados.push({
          titulo,
          motivo: "sem identificador — não daria para reimportar sem duplicar",
        });
        continue;
      }

      const fim = campos.DTEND ? lerDataDoIcs(campos.DTEND, campos.DTEND__TZID) : null;

      eventos.push({
        uid: campos.UID.trim(),
        titulo,
        descricao: campos.DESCRIPTION ? limparValor(campos.DESCRIPTION) : null,
        local: campos.LOCATION ? limparValor(campos.LOCATION) : null,
        comecaEm: inicio.iso,
        // Em dia inteiro o `.ics` marca o fim no dia seguinte, exclusivo. Sem
        // este ajuste, um evento de um dia aparece ocupando dois.
        terminaEm: fim ? (fim.diaInteiro ? recuarUmDia(fim.iso) : fim.iso) : null,
        diaInteiro: inicio.diaInteiro,
        temRepeticao: Boolean(campos.RRULE),
      });
      continue;
    }

    if (!dentro) continue;

    const separador = linha.indexOf(":");
    if (separador === -1) continue;

    // "DTSTART;VALUE=DATE" e "DTSTART" são o mesmo campo: os parâmetros depois
    // do ponto e vírgula não fazem parte do nome.
    const cabecalho = linha.slice(0, separador);
    const nome = cabecalho.split(";")[0].trim().toUpperCase();
    campos[nome] = linha.slice(separador + 1);

    // O fuso vem no parâmetro, não no valor: "DTSTART;TZID=America/Sao_Paulo".
    const fuso = /TZID=([^;:]+)/i.exec(cabecalho);
    if (fuso) campos[`${nome}__TZID`] = fuso[1].trim();
  }

  return { eventos, ignorados };
}

function recuarUmDia(iso: string): string {
  const data = new Date(iso);
  data.setDate(data.getDate() - 1);
  return data.toISOString();
}

/**
 * Decide o tipo do compromisso pelo título.
 *
 * Lista curta e explícita, e não um classificador: quem discorda precisa poder
 * ver a regra, e o custo de errar aqui é baixo — o tipo é editável na tela.
 */
export function adivinharTipo(titulo: string): TipoDeEvento {
  const texto = titulo.toLowerCase();
  if (/grava|filma|estúdio|estudio|foto/.test(texto)) return "gravacao";
  if (/prazo|entrega|deadline|fechamento/.test(texto)) return "prazo";
  if (/reunião|reuniao|interno|alinhamento|planejamento/.test(texto)) return "interno";
  return "agenda";
}

export type ResultadoDaImportacao = {
  novos: Evento[];
  /** Eventos que já existiam e mudaram: título, horário ou local. */
  atualizados: { evento: Evento; mudou: string[] }[];
  /** Já existiam e vieram iguais. */
  iguais: number;
  ignorados: { titulo: string; motivo: string }[];
  comRepeticao: number;
};

/**
 * Cruza o que veio do arquivo com o que já está na plataforma.
 *
 * Função pura de propósito: quem chama decide o que gravar. Isso permite a tela
 * mostrar o que vai acontecer **antes** de acontecer — importar agenda por cima
 * de agenda é o tipo de operação que ninguém quer descobrir depois.
 */
export function planejarImportacao(
  leitura: LeituraDoIcs,
  existentes: Evento[],
  contexto: { projectId: string; criadoPor: string; agora?: Date },
): ResultadoDaImportacao {
  const agora = (contexto.agora ?? new Date()).toISOString();
  const porUid = new Map(
    existentes.filter((evento) => evento.uidExterno).map((evento) => [evento.uidExterno!, evento]),
  );

  const novos: Evento[] = [];
  const atualizados: { evento: Evento; mudou: string[] }[] = [];
  let iguais = 0;

  for (const importado of leitura.eventos) {
    const existente = porUid.get(importado.uid);

    if (!existente) {
      novos.push({
        id: `ev-${importado.uid.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "")}`,
        projectId: contexto.projectId,
        titulo: importado.titulo,
        descricao: importado.descricao,
        tipo: adivinharTipo(importado.titulo),
        comecaEm: importado.comecaEm,
        terminaEm: importado.terminaEm,
        diaInteiro: importado.diaInteiro,
        local: importado.local,
        municipioCodigo: null,
        responsavel: null,
        postIds: [],
        origem: "importado",
        uidExterno: importado.uid,
        criadoPor: contexto.criadoPor,
        criadoEm: agora,
      });
      continue;
    }

    const mudou: string[] = [];
    if (existente.titulo !== importado.titulo) mudou.push("título");
    if (existente.comecaEm !== importado.comecaEm) mudou.push("horário");
    if (existente.terminaEm !== importado.terminaEm) mudou.push("término");
    if (existente.local !== importado.local) mudou.push("local");

    if (mudou.length === 0) {
      iguais += 1;
      continue;
    }

    atualizados.push({
      evento: {
        ...existente,
        titulo: importado.titulo,
        descricao: importado.descricao,
        comecaEm: importado.comecaEm,
        terminaEm: importado.terminaEm,
        diaInteiro: importado.diaInteiro,
        local: importado.local,
      },
      mudou,
    });
  }

  return {
    novos,
    atualizados,
    iguais,
    ignorados: leitura.ignorados,
    comRepeticao: leitura.eventos.filter((evento) => evento.temRepeticao).length,
  };
}
