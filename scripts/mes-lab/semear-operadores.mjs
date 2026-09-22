// SEMEIA OS OPERADORES DO MES — matrícula do RH como crachá.
//
//   MES_LAB_URL=postgresql://torg:torg@localhost:55432/torg_mes_lab \
//   node --env-file=.env.local scripts/mes-lab/semear-operadores.mjs
//
// Matheus (10/09/2026): "pegue no RH a matrícula dos funcionários da fábrica, vamos usar esse por
// hora e depois definimos melhor na tela de operadores".
//
// ⚠⚠ SÓ MATRÍCULA, NOME E O ID — A FICHA DE RH NÃO VIAJA. `Funcionario` tem CPF, salário e holerite;
// o totem precisa de três campos para reconhecer quem bipou. Copiar a tabela inteira para o banco
// onde se desenha tela seria arrastar o RH para um lugar que não precisa dele — a mesma decisão
// tomada em `importar.mjs`, onde o vínculo `User.funcionarioId` foi zerado.
//
// ⚠ `funcionarioId` fica gravado SEM FK (o schema do MES é de acoplamento fraco de propósito, ver
// §9.4 do doc): é o que vai permitir, depois, a tela de operadores puxar cargo e setor sem uma
// segunda cópia do cadastro.

import { PrismaClient } from "@prisma/client";
import { exigirLaboratorio, exigirOrigem } from "./destino.mjs";

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
 * Os setores do RH que são CHÃO DE FÁBRICA — os únicos cujo pessoal aponta em totem.
 *
 * ⚠⚠ "MONTAGEM EXTERNA" FICA DE FORA, e não é descuido. São montadores de CAMPO: trabalham na obra
 * do cliente, não numa bancada da fábrica. `lib/solda-capacidade.js` já registra essa distinção ao
 * excluir o Reinnan das bancadas — "é soldador de campo; pôr o nome dele numa bancada da fábrica
 * atribuiria a ele trabalho que é de outro". São 13 pessoas: o maior setor do RH, e o que mais
 * poluiria a lista de crachás do totem.
 *
 * ⚠ "Acabador" é UM registro num setor que tem nome de cargo — sujeira de cadastro do RH. Vai para
 * Acabamento em vez de sumir: a pessoa existe e trabalha lá.
 */
const SETOR_DA_FABRICA = {
  "Preparação": "PREPARACAO",
  "Montagem Interna": "MONTAGEM",
  "Solda": "SOLDA",
  "Acabamento": "ACABAMENTO",
  "Acabador": "ACABAMENTO",
  "Jato": "JATO",
  "Pintura": "PINTURA",
  "Expedição": "EXPEDICAO",
};

async function main() {
  console.log(`Laboratório: ${new URL(LAB).host}`);
  console.log(`Origem:      ${new URL(ORIGEM).host} (somente leitura)\n`);

  const pessoas = await origem.funcionario.findMany({
    where: { ativo: true, status: "ATIVO", setor: { nome: { in: Object.keys(SETOR_DA_FABRICA) } } },
    select: { id: true, nome: true, matricula: true, setor: { select: { nome: true } } },
    orderBy: { nome: "asc" },
  });

  // ⚠ SEM MATRÍCULA NÃO HÁ CRACHÁ, E ISSO É RELATÓRIO, NÃO DESCARTE SILENCIOSO. A pessoa trabalha na
  // fábrica e simplesmente não vai conseguir abrir sessão — quem lê isto precisa saber o nome para
  // resolver no RH, senão o problema aparece no totem, no meio do turno.
  const semMatricula = pessoas.filter((p) => !p.matricula);
  const comCracha = pessoas.filter((p) => p.matricula);

  let novos = 0;
  for (const p of comCracha) {
    const criado = await lab.mesOperador.upsert({
      where: { cracha: String(p.matricula).trim() },
      update: {},                                  // já existe → respeita o que a tela editou
      create: { cracha: String(p.matricula).trim(), nome: p.nome, funcionarioId: p.id },
    });
    if (criado.createdAt.getTime() === criado.updatedAt.getTime()) novos++;
  }

  console.log(`Operadores: ${novos} novo(s) de ${comCracha.length} com matrícula`);
  porSetor(comCracha);
  if (semMatricula.length) {
    console.log(`\n⚠ Sem matrícula no RH (${semMatricula.length}) — não conseguem bipar o crachá:`);
    for (const p of semMatricula) console.log(`    ${p.nome} (${p.setor.nome})`);
  }
  console.log(`\nNo laboratório, contado no destino: ${await lab.mesOperador.count()} operador(es)`);
}

function porSetor(pessoas) {
  const mapa = new Map();
  for (const p of pessoas) {
    const setor = SETOR_DA_FABRICA[p.setor.nome];
    if (!mapa.has(setor)) mapa.set(setor, []);
    mapa.get(setor).push(`${p.matricula}`);
  }
  for (const [setor, crachas] of [...mapa].sort()) {
    console.log(`  ${setor.padEnd(12)} ${crachas.length} → ${crachas.join(", ")}`);
  }
}

main()
  .catch((e) => { console.error("\nERRO:", e.message); process.exitCode = 1; })
  .finally(async () => { await origem.$disconnect(); await lab.$disconnect(); });
