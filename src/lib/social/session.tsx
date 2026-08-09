import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { sair as encerrarNoServidor, sessaoAtual } from "@/lib/api/social.functions";
import type { Session } from "./types";

/**
 * Sessão da plataforma no cliente.
 *
 * **Quem decide quem está logado é o servidor.** Esta camada só reflete o que
 * ele responde, lendo de um cookie selado que o JavaScript da página não
 * alcança. Antes a sessão vivia no `localStorage`, e um navegador com o valor
 * certo escrito à mão "estava logado" — o que também significava que o
 * `projectId` enviado nas chamadas era simples sugestão.
 *
 * O que continua no `localStorage` é só a preferência de qual projeto abrir. É
 * conveniência de tela: se apontar para um projeto ao qual a pessoa não tem
 * acesso, o servidor recusa de qualquer forma.
 */

const PROJECT_KEY = "social.projeto";

type SessionContextValue = {
  /** `false` enquanto a resposta do servidor ainda não chegou. */
  ready: boolean;
  session: Session | null;
  projectId: string | null;
  setProjectId: (projectId: string) => void;
  signIn: (session: Session) => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function readStored<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * O storage pode estar indisponível — navegação privada, cookies bloqueados ou
 * a página rodando dentro de um iframe restrito. Nesses casos a preferência
 * vale só enquanto a aba estiver aberta, em vez de a tela quebrar.
 */
function writeStored(key: string, value: unknown | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferência fica só em memória.
  }
}

export function SocialSessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [preferenciaLida, setPreferenciaLida] = useState(false);

  const consulta = useQuery({
    queryKey: ["social", "sessao"],
    queryFn: () => sessaoAtual(),
    // Sessão é a base de tudo: vale a pena reconferir ao voltar para a aba, para
    // que uma sessão expirada apareça como tal em vez de dar erro em cada clique.
    staleTime: 30_000,
    retry: false,
  });

  const session = consulta.data?.autenticado ? consulta.data.session : null;

  useEffect(() => {
    setPreferenciaLida(true);
  }, []);

  // Escolhe o projeto assim que a sessão chega: o guardado, se ainda for válido;
  // senão o primeiro da lista.
  useEffect(() => {
    if (!session) {
      setProjectIdState(null);
      return;
    }
    setProjectIdState((atual) => {
      if (atual && session.projects.some((project) => project.id === atual)) return atual;
      const guardado = readStored<string>(PROJECT_KEY);
      const valido = session.projects.some((project) => project.id === guardado);
      return valido ? guardado : (session.projects[0]?.id ?? null);
    });
  }, [session]);

  const signIn = useCallback(
    (next: Session) => {
      // O cookie já foi gravado pelo servidor no `autenticar`; aqui só evitamos
      // uma ida a mais até ele, escrevendo a resposta direto no cache.
      queryClient.setQueryData(["social", "sessao"], { autenticado: true, session: next });
      const primeiro = next.projects[0]?.id ?? null;
      if (primeiro) writeStored(PROJECT_KEY, primeiro);
      setProjectIdState(primeiro);
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    writeStored(PROJECT_KEY, null);
    setProjectIdState(null);
    // Apagar o cookie é trabalho do servidor — limpar só o lado do cliente
    // deixaria a sessão viva para quem chamasse a API diretamente.
    void encerrarNoServidor().finally(() => {
      queryClient.setQueryData(["social", "sessao"], { autenticado: false });
      queryClient.invalidateQueries({ queryKey: ["social"] });
    });
  }, [queryClient]);

  const setProjectId = useCallback((next: string) => {
    writeStored(PROJECT_KEY, next);
    setProjectIdState(next);
  }, []);

  const value = useMemo(
    () => ({
      ready: preferenciaLida && !consulta.isPending,
      session,
      projectId,
      setProjectId,
      signIn,
      signOut,
    }),
    [preferenciaLida, consulta.isPending, session, projectId, setProjectId, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSocialSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSocialSession precisa estar dentro de <SocialSessionProvider>.");
  }
  return context;
}
