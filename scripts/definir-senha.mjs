import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, env, exit } from "node:process";

/**
 * Define a senha de um usuário da plataforma.
 *
 *   npm run senha -- campanha.neoncunha@gmail.com
 *
 * A senha é pedida de forma interativa e **não** aparece como argumento de
 * linha de comando: argumento fica no histórico do shell e na lista de
 * processos da máquina. Digitada aqui, ela vira um hash scrypt e só isso é
 * gravado.
 *
 * Precisa de `DATABASE_URL` apontando para o banco — é lá que a senha vive. Sem
 * banco a plataforma está em modo demonstração, onde senha não faz sentido.
 */

const [, , emailArg] = argv;

if (!emailArg) {
  console.error("Uso: npm run senha -- email@dominio.com");
  exit(1);
}

if (!env.DATABASE_URL) {
  console.error(
    [
      "DATABASE_URL não está definida.",
      "",
      "A senha é guardada no banco, nunca no repositório. Sem banco, a",
      "plataforma roda em modo demonstração e não usa senha.",
      "",
      "  export DATABASE_URL='postgresql://...'",
      "  npm run senha -- " + emailArg,
    ].join("\n"),
  );
  exit(1);
}

const { gerarHash } = await import("../src/lib/social/senha.server.ts");
const { obterPool, garantirEsquema, encerrarPool } =
  await import("../src/lib/social/banco/postgres.server.ts");

const interativo = stdin.isTTY;
const leitor = interativo ? createInterface({ input: stdin, output: stdout }) : null;

/**
 * Linhas vindas por pipe, lidas de uma vez.
 *
 * Com pipe, o fluxo termina assim que os dados acabam — e `readline` recusa a
 * segunda pergunta com "readline was closed". Ler tudo de antemão e servir por
 * fila resolve, e ainda deixa o script utilizável em automação.
 */
const linhasDaEntrada = [];
if (!interativo) {
  let bruto = "";
  for await (const pedaco of stdin) bruto += pedaco;
  linhasDaEntrada.push(...bruto.split("\n"));
}

/**
 * Pergunta a senha sem mostrá-la na tela.
 *
 * Suprimir o eco só faz sentido com um terminal do outro lado; num pipe não há
 * ninguém olhando por cima do ombro.
 */
const perguntarSenha = async (pergunta) => {
  if (!interativo) {
    return (linhasDaEntrada.shift() ?? "").trim();
  }

  const promessa = leitor.question(pergunta);
  const aoEscrever = stdout.write.bind(stdout);
  stdout.write = (trecho, ...resto) =>
    trecho.toString().includes("\n") ? aoEscrever(trecho, ...resto) : true;
  const resposta = await promessa;
  stdout.write = aoEscrever;
  stdout.write("\n");
  return resposta;
};

try {
  await garantirEsquema();
  const pool = obterPool();

  /**
   * Banco vazio: este comando cria a instalação.
   *
   * É o primeiro comando de uma implantação nova, e sem isto ele falharia com
   * "nenhum usuário com esse e-mail" — o passo a passo certo devolvendo um erro
   * que parece engano de quem digitou. A instalação nasce mínima de propósito:
   * um projeto e um administrador, sem dado de demonstração nenhum.
   */
  const { rows: existentes } = await pool.query("select count(*)::int as total from usuarios");
  if (existentes[0].total === 0) {
    const nomeDoProjeto = env.PROJETO_INICIAL ?? "Campanha";
    const nome = env.ADMIN_NOME ?? emailArg.split("@")[0];

    await pool.query(
      "insert into projetos (id, nome, cliente, ordem) values ($1, $2, $2, 0)",
      ["proj-1", nomeDoProjeto],
    );
    await pool.query(
      `insert into usuarios (id, nome, email, papel, ultimo_acesso_em, avatar_gradiente, ordem)
       values ($1, $2, $3, 'administrador', now(), $4, 0)`,
      [
        "user-1",
        nome,
        emailArg,
        "linear-gradient(135deg, oklch(0.55 0.22 30), oklch(0.35 0.18 280))",
      ],
    );
    await pool.query(
      "insert into usuario_projetos (usuario_id, projeto_id) values ($1, $2)",
      ["user-1", "proj-1"],
    );

    console.log(`Banco vazio: criei o projeto "${nomeDoProjeto}" e o administrador ${emailArg}.`);
  }

  const { rows } = await pool.query(
    "select id, nome, email from usuarios where lower(email) = lower($1)",
    [emailArg],
  );

  if (rows.length === 0) {
    console.error(`Nenhum usuário com o e-mail ${emailArg}.`);
    console.error("Confira em Equipe, dentro da plataforma, quem está cadastrado.");
    exit(1);
  }

  const usuario = rows[0];
  console.log(`Definindo a senha de ${usuario.nome} <${usuario.email}>.`);

  const senha = await perguntarSenha("Senha nova: ");
  const confirmacao = await perguntarSenha("Repita a senha: ");

  if (senha !== confirmacao) {
    console.error("As senhas não conferem. Nada foi alterado.");
    exit(1);
  }

  const hash = await gerarHash(senha);
  await pool.query("update usuarios set senha_hash = $1 where id = $2", [hash, usuario.id]);

  console.log("");
  console.log(`Pronto. A senha de ${usuario.email} foi gravada no banco.`);
  console.log("A senha em si não foi guardada em lugar nenhum — só a derivação.");
  console.log("");
  // A aplicação lê o estado uma vez, na subida. Uma instância que já estava no
  // ar continua com a senha antiga em memória até reiniciar — e descobrir isso
  // na hora de entrar é frustrante.
  console.log("Se a plataforma já estava rodando, reinicie para ela reler o banco.");
  console.log("Depois disso, trocas de senha podem ser feitas pela tela de Equipe.");
} catch (erro) {
  console.error("Falhou:", erro instanceof Error ? erro.message : erro);
  exit(1);
} finally {
  leitor?.close();
  await encerrarPool().catch(() => {});
}
