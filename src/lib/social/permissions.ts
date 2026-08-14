import type { UserRole } from "./types";

/**
 * Permissões por papel (PRD 3.7). O servidor continua sendo a fonte de verdade:
 * isto controla apenas o que a interface oferece a cada usuário.
 */
const ROLE_ABILITIES: Record<UserRole, string[]> = {
  administrador: [
    "metricas",
    "publicar",
    "publicar_direto",
    "aprovar",
    "impulsionar",
    "inbox",
    "relatorios",
    "agenda",
    "admin",
  ],
  gestor: [
    "metricas",
    "publicar",
    // Quem cobre evento ao vivo precisa publicar sem esperar aprovação: numa
    // caminhada, meia hora de espera é a peça perdendo o momento. A rede de
    // proteção continua existindo para quem não tem esta permissão.
    "publicar_direto",
    "aprovar",
    "impulsionar",
    "inbox",
    "relatorios",
    "agenda",
  ],
  editor: ["metricas", "publicar", "inbox", "agenda"],
  atendimento: ["inbox", "agenda"],
};

export function can(role: UserRole | undefined, ability: string): boolean {
  if (!role) return false;
  return ROLE_ABILITIES[role].includes(ability);
}
