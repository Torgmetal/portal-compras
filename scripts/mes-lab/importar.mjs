// IMPORTA PRODUÇÃO → LABORATÓRIO LOCAL, para desenhar as telas do MES contra dado realista.
//
//   MES_LAB_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab \
//   node --env-file=.env.local scripts/mes-lab/importar.mjs [--meses=6]
//
// A origem é o Neon de produção, aberto só para SELECT. O destino é o Postgres da própria máquina
// — e a trava que garante isso mora em `destino.mjs`, com o porquê.
//
// ⚠⚠ OS DADOS IMPORTADOS INCLUEM NOMES REAIS DE OPERADORES. Ficam na máquina local: não vão para o
// repositório, nem para prévia publicada, nem para massa de demonstração compartilhada
// (`docs/mes-proprio.md`, §"ESTADO ATUAL").
//
// ⚠ RECURSOS E OPERADORES NÃO ESTÃO AQUI. Eles vivem no Syneco (datasets 27 e 20), não no Neon —
// entram por `importar-syneco.mjs`, que precisa da rede da fábrica e das credenciais SKA.

import { PrismaClient } from "@prisma/client";
import { exigirLaboratorio, exigirOrigem } from "./destino.mjs";

const MESES = Number((process.argv.find((a) => a.startsWith("--meses=")) || "").split("=")[1]) || 6;
// Página grande o bastante para não fazer 100 viagens, pequena o bastante para não estourar a
// compute do Neon — que é pequena e tem histórico de OOM (ver o aviso no CLAUDE.md).
const PAGINA = 2000;

// ⚠ As travas correm ANTES de qualquer cliente existir: um destino inválido tem que derrubar o
// script enquanto ele ainda não abriu conexão nenhuma. Erro de configuração sai como uma frase,
// não como rastro de pilha — quem lê isso está conferindo se apontou para o banco certo.
let ORIGEM, LAB;
try {
  ORIGEM = exigirOrigem(process.env.DATABASE_URL);
  LAB = exigirLaboratorio(process.env.MES_LAB_URL);
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}

const origem = new PrismaClient({ datasources: { db: { url: ORIGEM } } });
const lab = new PrismaClient({ datasources: { db: { url: LAB } } });

/**
 * Lê uma tabela inteira da origem em páginas e grava no laboratório.
 *
 * ⚠ `skipDuplicates` em vez de upsert: o import é REPETÍVEL e a segunda rodada não deve reescrever
 * 123 mil linhas para chegar ao mesmo lugar. Quem quiser começar do zero apaga a tabela antes —
 * `--limpar` faz isso.
 */
async function copiar(nome, { ler, gravar, onde, higienizar }) {
  let cursor = null;
  let total = 0;
  for (;;) {
    const lote = await ler({
      take: PAGINA,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      ...(onde ? { where: onde } : {}),
      orderBy: { id: "asc" },
    });
    if (!lote.length) break;
    const { count } = await gravar({ data: higienizar ? lote.map(higienizar) : lote, skipDuplicates: true });
    total += count;
    cursor = lote[lote.length - 1].id;
    process.stdout.write(`\r  ${nome}: ${total}…`);
    if (lote.length < PAGINA) break;
  }
  process.stdout.write(`\r  ${nome}: ${total} linha(s)\n`);
  return total;
}

async function limpar() {
  console.log("Limpando o laboratório (só as tabelas que este script preenche)…");
  // Ordem importa: MesApontamento tem FK para OP.
  for (const t of ["mesApontamento", "mesOrdem", "pecaConjunto", "listaExpedicao", "oP", "user"]) {
    const { count } = await lab[t].deleteMany({});
    console.log(`  ${t}: ${count} apagada(s)`);
  }
}

async function main() {
  const desde = new Date(Date.now() - MESES * 30 * 864e5);
  console.log(`Laboratório: ${new URL(process.env.MES_LAB_URL).host}`);
  console.log(`Origem:      ${new URL(process.env.DATABASE_URL).host} (somente leitura)`);
  console.log(`Janela:      apontamentos desde ${desde.toISOString().slice(0, 10)} (${MESES} meses)\n`);

  if (process.argv.includes("--limpar")) await limpar();

  // A ORDEM É A DAS DEPENDÊNCIAS. `MesApontamento.opId` tem FK para `OP` — importar o apontamento
  // antes da obra deixaria o Postgres recusar a linha, e o import terminaria "com sucesso" tendo
  // gravado menos do que diz.
  // `OP.createdById` aponta para `User` — sem os usuários, o Postgres recusa toda obra. Mas a
  // credencial NÃO viaja: o hash de senha é substituído na entrada.
  //
  // ⚠⚠ HASH DE SENHA NÃO É "DADO REALISTA", É CREDENCIAL. O laboratório existe para desenhar tela
  // contra volume e nomes de verdade; nada nele precisa autenticar ninguém. Copiar o hash criaria,
  // num banco sem senha forte e sem backup, uma segunda cópia do material que abre o portal.
  await copiar("User         ", {
    ler: (a) => origem.user.findMany(a),
    gravar: (a) => lab.user.createMany(a),
  //
  // ⚠ `funcionarioId` é ZERADO pelo mesmo motivo, um passo adiante: ele aponta para `Funcionario`,
  // que é a ficha de RH (CPF, salário, holerite). Trazer a tabela junto arrastaria o RH inteiro
  // para dentro de um banco de laboratório para nada — o MES não usa esse vínculo. Cortar o
  // ponteiro é mais barato e mais seguro do que copiar o alvo.
    higienizar: (u) => ({ ...u, password: "LABORATORIO-SEM-SENHA", funcionarioId: null }),
  });
  await copiar("OP           ", { ler: (a) => origem.oP.findMany(a), gravar: (a) => lab.oP.createMany(a) });
  await copiar("ListaExpedicao", { ler: (a) => origem.listaExpedicao.findMany(a), gravar: (a) => lab.listaExpedicao.createMany(a) });
  await copiar("PecaConjunto ", { ler: (a) => origem.pecaConjunto.findMany(a), gravar: (a) => lab.pecaConjunto.createMany(a) });
  await copiar("MesOrdem     ", { ler: (a) => origem.mesOrdem.findMany(a), gravar: (a) => lab.mesOrdem.createMany(a) });
  await copiar("MesApontamento", {
    ler: (a) => origem.mesApontamento.findMany(a),
    gravar: (a) => lab.mesApontamento.createMany(a),
    onde: { dataInicio: { gte: desde } },
  });

  await conferir();
}

/**
 * O RECIBO É CONTADO NO DESTINO, não somado das gravações.
 *
 * ⚠ É a mesma lição que a aba `Revisao` do import de lista custou quatro semanas para ensinar
 * (`docs/mes-proprio.md` não, mas o CLAUDE.md sim): relatar o que se PREVIU gravar, em vez do que
 * está no banco, é como uma importação silenciosamente vazia passa por bem-sucedida.
 */
async function conferir() {
  console.log("\nNo laboratório, contado no destino:");
  for (const t of ["user", "oP", "listaExpedicao", "pecaConjunto", "mesOrdem", "mesApontamento"]) {
    console.log(`  ${t.padEnd(16)} ${await lab[t].count()}`);
  }
}

main()
  .catch((e) => { console.error("\nERRO:", e.message); process.exitCode = 1; })
  .finally(async () => { await origem.$disconnect(); await lab.$disconnect(); });
