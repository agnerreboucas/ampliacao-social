import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import {
  ATRIBUTO_TEMA,
  CHAVE_TEMA,
  PREFERENCIAS,
  ehPreferencia,
  resolverTema,
  type Preferencia,
} from "@/lib/social/tema";
import { cn } from "@/lib/utils";

const ICONES = { claro: Sun, escuro: Moon, sistema: Monitor } as const;

/**
 * Alternador de tema: claro, escuro ou o que o sistema disser.
 *
 * O estado inicial é lido do documento, não do `localStorage` — o script do
 * `<head>` já resolveu a preferência antes da primeira pintura, e reler dali
 * mantém o botão e a tela contando a mesma história desde o primeiro quadro.
 */
export function SeletorTema({ className }: { className?: string }) {
  const [preferencia, setPreferencia] = useState<Preferencia>("sistema");
  /**
   * Só depois de ler o que estava guardado é que este componente pode mexer no
   * tema.
   *
   * Sem esta trava, o primeiro render — em que a preferência ainda é o "sistema"
   * do valor inicial — aplicava o tema do sistema por cima do que o script do
   * `<head>` já tinha resolvido. Quem tinha escolhido escuro via a tela voltar
   * para o claro logo depois de entrar.
   */
  const [preferenciaLida, setPreferenciaLida] = useState(false);

  useEffect(() => {
    const guardada = localStorage.getItem(CHAVE_TEMA);
    if (ehPreferencia(guardada)) setPreferencia(guardada);
    setPreferenciaLida(true);
  }, []);

  // Com "sistema" escolhido, mudar o tema do computador tem de refletir aqui na
  // hora — sem recarregar a página.
  useEffect(() => {
    if (!preferenciaLida || preferencia !== "sistema") return;
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const aplicar = () => {
      document.documentElement.setAttribute(
        ATRIBUTO_TEMA,
        resolverTema("sistema", consulta.matches),
      );
    };
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, [preferencia, preferenciaLida]);

  const escolher = (nova: Preferencia) => {
    setPreferencia(nova);
    localStorage.setItem(CHAVE_TEMA, nova);
    const escuroNoSistema = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute(ATRIBUTO_TEMA, resolverTema(nova, escuroNoSistema));
  };

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-secondary/60 p-0.5",
        className,
      )}
    >
      {PREFERENCIAS.map(({ id, label }) => {
        const Icone = ICONES[id];
        const ativo = preferencia === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={label}
            title={label}
            onClick={() => escolher(id)}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full transition-colors",
              ativo
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
