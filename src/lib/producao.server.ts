/**
 * A conferência que roda antes de a plataforma aceitar a primeira requisição.
 *
 * Existe por causa de um modo de falha específico e silencioso: **sem
 * `DATABASE_URL`, a plataforma entra em modo demonstração — e em modo
 * demonstração qualquer senha entra.** Isso é correto num arquivo que se manda
 * por mensagem e catastrófico num endereço público: quem descobrir a URL entra
 * como administrador da campanha.
 *
 * O mesmo vale para a chave de sessão. Sem ela o cookie é selado com um valor
 * fixo que está no código-fonte — qualquer pessoa que leia o repositório sabe
 * forjar uma sessão.
 *
 * Por isso a checagem **derruba a subida** em vez de avisar no log. Um log de
 * aviso numa hospedagem é um log que ninguém lê; a plataforma no ar com senha
 * livre é um problema que só se descobre depois. Falhar aqui custa cinco
 * minutos de configuração e é o único momento em que o custo é esse.
 *
 * Nada disto acontece em desenvolvimento: `NODE_ENV` diferente de `production`
 * passa direto, e é assim que a demonstração continua funcionando.
 */

export type Pendencia = { variavel: string; porque: string; como: string };

const TAMANHO_MINIMO_DA_CHAVE = 32;

/**
 * O que falta para esta instalação poder atender gente de verdade.
 *
 * Função pura: recebe o ambiente em vez de ler `process.env`, para poder ser
 * testada sem mexer no ambiente do processo que roda os testes.
 */
export function pendenciasDeProducao(ambiente: Record<string, string | undefined>): Pendencia[] {
  const pendencias: Pendencia[] = [];

  if (!ambiente.DATABASE_URL) {
    pendencias.push({
      variavel: "DATABASE_URL",
      porque:
        "sem banco a plataforma entra em modo demonstração, e em demonstração qualquer senha entra",
      como: "postgresql://usuario:senha@host:5432/banco?sslmode=require",
    });
  }

  if (!ambiente.ADMIN_EMAIL) {
    pendencias.push({
      variavel: "ADMIN_EMAIL",
      porque:
        "numa instalação nova o banco está vazio, e é este e-mail que vira o primeiro administrador — sem ele `npm run senha` falharia com “nenhum usuário com esse e-mail”",
      como: "voce@suaempresa.com.br",
    });
  }

  const chave = ambiente.SESSION_SECRET ?? "";
  if (chave.length < TAMANHO_MINIMO_DA_CHAVE) {
    pendencias.push({
      variavel: "SESSION_SECRET",
      porque:
        chave.length === 0
          ? "sem ela o cookie de sessão é selado com um valor que está no código-fonte, e qualquer pessoa que leia o repositório sabe forjar uma sessão"
          : `a chave tem ${chave.length} caracteres e o mínimo é ${TAMANHO_MINIMO_DA_CHAVE}`,
      como: "node -e \"console.log(require('node:crypto').randomBytes(48).toString('base64url'))\"",
    });
  }

  return pendencias;
}

/** A mensagem que a pessoa vai ler no log da hospedagem, e agir a partir dela. */
export function mensagemDePendencias(pendencias: Pendencia[]): string {
  const linhas = pendencias.map(
    (pendencia) =>
      `  ${pendencia.variavel}\n    por quê: ${pendencia.porque}\n    exemplo: ${pendencia.como}`,
  );

  return [
    "",
    "A plataforma não subiu porque falta configuração obrigatória de produção.",
    "",
    ...linhas,
    "",
    "Configure estas variáveis no painel da hospedagem e reinicie.",
    "Para rodar em modo demonstração de propósito, deixe NODE_ENV fora de 'production'.",
    "",
  ].join("\n");
}

/**
 * Roda a conferência e derruba a subida se faltar algo.
 *
 * Chamada uma vez, no arquivo de entrada do servidor.
 */
export function exigirProducaoConfigurada(ambiente = process.env): void {
  if (ambiente.NODE_ENV !== "production") return;

  const pendencias = pendenciasDeProducao(ambiente);
  if (pendencias.length === 0) return;

  console.error(mensagemDePendencias(pendencias));
  throw new Error(
    `Configuração de produção incompleta: ${pendencias.map((p) => p.variavel).join(", ")}.`,
  );
}
