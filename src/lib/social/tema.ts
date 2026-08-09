/**
 * Tema claro e escuro.
 *
 * Três estados, não dois: "claro", "escuro" e "sistema". O terceiro existe
 * porque a maioria das pessoas já escolheu no celular ou no computador, e
 * repetir a escolha em cada aplicativo é trabalho à toa.
 *
 * O que fica guardado é a *preferência* ("sistema" continua "sistema"); o que
 * vai para o atributo `data-theme` é o tema já resolvido, para o CSS não
 * precisar decidir nada.
 */

export type Preferencia = "claro" | "escuro" | "sistema";
export type TemaResolvido = "claro" | "escuro";

export const CHAVE_TEMA = "ampliacao:tema";
export const ATRIBUTO_TEMA = "data-theme";

export const PREFERENCIAS: { id: Preferencia; label: string }[] = [
  { id: "claro", label: "Claro" },
  { id: "escuro", label: "Escuro" },
  { id: "sistema", label: "Sistema" },
];

export function ehPreferencia(valor: unknown): valor is Preferencia {
  return valor === "claro" || valor === "escuro" || valor === "sistema";
}

export function resolverTema(preferencia: Preferencia, sistemaEscuro: boolean): TemaResolvido {
  if (preferencia === "sistema") return sistemaEscuro ? "escuro" : "claro";
  return preferencia;
}

/**
 * O script que roda antes da primeira pintura.
 *
 * Precisa ser texto, e não uma função importada, porque vai embutido no `<head>`
 * e tem de executar antes de qualquer JavaScript da aplicação carregar. Sem
 * isso, a página nasce clara e vira escura no instante seguinte — o "flash"
 * branco que denuncia tema mal feito.
 *
 * Envolvido em try/catch porque `localStorage` lança em navegação privada em
 * alguns navegadores, e um tema errado é muito melhor do que uma página em
 * branco.
 */
export const SCRIPT_TEMA_INICIAL = `
(function () {
  try {
    var guardada = localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});
    var escuroNoSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var tema = guardada === "claro" || guardada === "escuro"
      ? guardada
      : (escuroNoSistema ? "escuro" : "claro");
    document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_TEMA)}, tema);
  } catch (e) {}
})();
`.trim();
