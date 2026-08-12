import { Link } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";

import { can } from "@/lib/social/permissions";
import { useSocialSession } from "@/lib/social/session";

/**
 * Fecha uma tela para quem não tem o papel necessário.
 *
 * Isto é cortesia de interface, **não** é a segurança. Quem decide o que sai da
 * plataforma é o servidor, que confere a sessão em cada função — e continua
 * conferindo mesmo que alguém desenhe este componente fora daqui. Sem este
 * envelope, porém, a página restrita chegava a montar seus títulos e cartões
 * antes de o servidor recusar os dados: quem abrisse o endereço via um link ou
 * pelo histórico do navegador via a moldura de uma tela que não é dele, o que
 * parece um vazamento mesmo quando não é.
 *
 * O texto diz o que fazer em seguida. Uma tela que só informa "acesso negado"
 * deixa a pessoa sem saída — e, quase sempre, ela chegou ali por engano.
 */
export function Restrito({
  ability,
  titulo = "Esta área é restrita",
  children,
}: {
  ability: string;
  titulo?: string;
  children: React.ReactNode;
}) {
  const { session, ready } = useSocialSession();

  // Enquanto a sessão não chega, `session` é nulo — mostrar a recusa aqui
  // acusaria de intruso quem só está esperando a página carregar.
  if (!ready) {
    return <div className="py-10 text-sm text-muted-foreground">Carregando…</div>;
  }

  if (!can(session?.user.role, ability)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
          <Lock className="size-5" />
        </span>
        <div>
          <p className="font-medium">{titulo}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Seu acesso atual não inclui esta tela. Se você precisa dela, peça a um administrador
            para ajustar seu papel na Equipe.
          </p>
        </div>
        <Link
          to="/social"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <ArrowLeft className="size-3.5" />
          Voltar ao painel
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
