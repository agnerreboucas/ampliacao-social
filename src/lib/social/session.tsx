import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { Session } from "./types";

/**
 * Sessão da plataforma no cliente.
 *
 * A autenticação real ainda não tem provedor de identidade: `autenticar` valida
 * o usuário no servidor e o resultado é guardado no `localStorage`. Ao plugar um
 * provedor (ou cookie de sessão assinado), só este módulo muda — as telas
 * consomem sempre `useSocialSession()`.
 */

const STORAGE_KEY = "social.sessao";
const PROJECT_KEY = "social.projeto";

type SessionContextValue = {
  /** `null` enquanto o cliente ainda não hidratou o storage. */
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

export function SocialSessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [projectId, setProjectIdState] = useState<string | null>(null);

  // O storage só existe no cliente — hidratamos depois da primeira renderização
  // para o HTML do servidor e o do cliente baterem.
  useEffect(() => {
    const stored = readStored<Session>(STORAGE_KEY);
    const storedProject = readStored<string>(PROJECT_KEY);
    if (stored) {
      setSession(stored);
      const valid = stored.projects.some((project) => project.id === storedProject);
      setProjectIdState(valid ? storedProject : (stored.projects[0]?.id ?? null));
    }
    setReady(true);
  }, []);

  const signIn = useCallback((next: Session) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
    const first = next.projects[0]?.id ?? null;
    if (first) window.localStorage.setItem(PROJECT_KEY, JSON.stringify(first));
    setProjectIdState(first);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(PROJECT_KEY);
    setSession(null);
    setProjectIdState(null);
  }, []);

  const setProjectId = useCallback((next: string) => {
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
    setProjectIdState(next);
  }, []);

  const value = useMemo(
    () => ({ ready, session, projectId, setProjectId, signIn, signOut }),
    [ready, session, projectId, setProjectId, signIn, signOut],
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
