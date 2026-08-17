import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, History, IdCard, Lock, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { atualizarMeuPerfil, meuPerfil } from "@/lib/api/social.functions";
import {
  AccountAvatar,
  InlineError,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusPill,
} from "@/components/social/primitives";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, formatRelative } from "@/lib/social/format";
import { frase } from "@/lib/social/historico";

/**
 * A área da pessoa.
 *
 * Existe para responder três perguntas que antes não tinham lugar: **quem sou
 * eu aqui**, **o que eu posso fazer** e **o que eu andei fazendo**.
 *
 * A segunda é a que muda o dia a dia. Sem ela, quem não encontra o botão de
 * publicar conclui que a plataforma está com defeito e pede ajuda; com ela, lê
 * que o próprio papel não publica direto e sabe a quem pedir. Por isso as
 * permissões negadas aparecem também — esconder o que falta transformaria a
 * lista num elogio inútil.
 *
 * O papel **não** é editável aqui, e essa é a decisão de segurança da tela:
 * quem muda papel é administrador, pela tela de Equipe. Um seletor de papel no
 * próprio perfil é alguém se promovendo a administrador.
 */
export const Route = createFileRoute("/social/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const queryClient = useQueryClient();
  const dados = useQuery({ queryKey: ["social", "perfil"], queryFn: () => meuPerfil() });

  const [nome, setNome] = useState("");
  const [area, setArea] = useState("");
  const [telefone, setTelefone] = useState("");
  const [editando, setEditando] = useState(false);

  // Os campos só são preenchidos quando os dados chegam. Iniciar o estado com
  // string vazia e sincronizar aqui evita o campo controlado que pisca de
  // vazio para preenchido enquanto a pessoa já está digitando.
  useEffect(() => {
    if (!dados.data || editando) return;
    setNome(dados.data.usuario.name);
    setArea(dados.data.usuario.area ?? "");
    setTelefone(dados.data.usuario.telefone ?? "");
  }, [dados.data, editando]);

  const salvar = useMutation({
    mutationFn: () => atualizarMeuPerfil({ data: { nome, area, telefone } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social"] });
      setEditando(false);
      toast.success("Perfil atualizado.");
    },
    onError: () => toast.error("Não foi possível salvar o perfil."),
  });

  if (dados.isPending) return <LoadingBlock rows={6} />;
  if (dados.isError || !dados.data) {
    return <InlineError>Não foi possível carregar o seu perfil.</InlineError>;
  }

  const { usuario, projetos, permissoes, negadas, atividade } = dados.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minha área"
        description="Seus dados, o que o seu papel permite e o que você fez por aqui."
      />

      <SectionCard title="Cadastro" icon={IdCard}>
        <div className="flex flex-wrap items-start gap-5">
          <AccountAvatar gradient={usuario.avatarGradient} label={usuario.name} size={64} />

          <div className="min-w-0 flex-1 space-y-4">
            {editando ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Nome" valor={nome} onChange={setNome} />
                <Campo
                  rotulo="Frente de atuação"
                  valor={area}
                  onChange={setArea}
                  dica="Cobertura de eventos, produção de vídeo, atendimento…"
                />
                <Campo
                  rotulo="Telefone"
                  valor={telefone}
                  onChange={setTelefone}
                  dica="Para quem coordena a cobertura em campo."
                />
              </div>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Linha rotulo="Nome">{usuario.name}</Linha>
                {/* O e-mail é o login, e trocá-lo troca a identidade da conta —
                    operação de administrador, não de perfil. */}
                <Linha rotulo="E-mail">{usuario.email}</Linha>
                <Linha rotulo="Frente de atuação">
                  {usuario.area ?? <span className="text-muted-foreground">Não informada</span>}
                </Linha>
                <Linha rotulo="Telefone">
                  {usuario.telefone ?? <span className="text-muted-foreground">Não informado</span>}
                </Linha>
              </dl>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {editando ? (
                <>
                  <button
                    type="button"
                    disabled={salvar.isPending || nome.trim().length === 0}
                    onClick={() => salvar.mutate()}
                    className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(false)}
                    className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary"
                >
                  Editar
                </button>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Papel e acesso"
        description={ROLE_DESCRIPTIONS[usuario.role]}
        icon={ShieldCheck}
        actions={<StatusPill tone="neutro">{ROLE_LABELS[usuario.role]}</StatusPill>}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Projetos em que você trabalha
            </p>
            <p className="mt-1 text-sm">
              {projetos.length === 0
                ? "Nenhum projeto atribuído."
                : projetos.map((projeto) => projeto.name).join(" · ")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ListaDePermissoes titulo="Você pode" itens={permissoes} pode />
            <ListaDePermissoes titulo="Você não pode" itens={negadas} pode={false} />
          </div>

          <p className="flex items-start gap-2 rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            Papel só muda pela tela de Equipe, e só um administrador muda. Se você precisa de uma
            permissão que não tem, peça a quem administra a plataforma.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="O que você fez por aqui"
        description={
          atividade.volatil
            ? "Sem banco configurado, este histórico vive na memória e some quando o servidor reinicia."
            : "As últimas ações registradas na sua conta."
        }
        icon={History}
      >
        {atividade.eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {atividade.eventos.map((evento) => (
              <li
                key={evento.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0"
              >
                <span>{frase(evento)}</span>
                <span className="text-xs text-muted-foreground">{formatRelative(evento.em)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  dica,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  dica?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{rotulo}</span>
      <input
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {dica ? <span className="mt-1 block text-[11px] text-muted-foreground">{dica}</span> : null}
    </label>
  );
}

function ListaDePermissoes({
  titulo,
  itens,
  pode,
}: {
  titulo: string;
  itens: { id: string; rotulo: string; explica: string }[];
  pode: boolean;
}) {
  if (itens.length === 0) return null;

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">{titulo}</p>
      <ul className="mt-2 space-y-2">
        {itens.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-sm">
            {pode ? (
              <Check className="mt-0.5 size-4 shrink-0 text-[oklch(0.62_0.14_165)]" />
            ) : (
              <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span className={pode ? "" : "text-muted-foreground"}>
              {item.rotulo}
              <span className="block text-xs text-muted-foreground">{item.explica}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
