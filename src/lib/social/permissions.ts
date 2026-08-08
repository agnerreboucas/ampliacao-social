import type { UserRole } from "./types";

/**
 * Permissões por papel (PRD 3.7). O servidor continua sendo a fonte de verdade:
 * isto controla apenas o que a interface oferece a cada usuário.
 */
const ROLE_ABILITIES: Record<UserRole, string[]> = {
  administrador: ["metricas", "publicar", "aprovar", "impulsionar", "inbox", "relatorios", "admin"],
  gestor: ["metricas", "publicar", "aprovar", "impulsionar", "inbox", "relatorios"],
  editor: ["metricas", "publicar", "inbox"],
  atendimento: ["inbox"],
};

export function can(role: UserRole | undefined, ability: string): boolean {
  if (!role) return false;
  return ROLE_ABILITIES[role].includes(ability);
}
