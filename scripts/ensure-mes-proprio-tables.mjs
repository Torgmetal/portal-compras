#!/usr/bin/env node
/**
 * O SCHEMA `mes` NO POSTGRES — as 14 tabelas do MES próprio.
 *
 * ⚠⚠ SÃO DOIS ISOLAMENTOS, E ELES RESPONDEM PERGUNTAS DIFERENTES. O schema `mes` separa o MES do
 * PORTAL (um erro aqui não alcança `PecaConjunto`); a coluna `ambiente` separa DEMO de PROD dentro
 * do MES (`lib/mes/ambiente.js`). Matheus (21/09/2026): "quero ele em produção para ir testando
 * com OPs sem interferir nos dados reais do portal".
 *
 * ⚠⚠ ESTE SCRIPT FALHA ALTO. Ele roda no `build`, e é o único caminho pelo qual as tabelas nascem
 * em produção — declarar sucesso numa criação que não aconteceu põe o MES no ar apontando para o
 * nada, e o primeiro operador descobre isso no meio de um turno. Sai com código diferente de zero.
 *
 * ⚠ Idempotente: `CREATE ... IF NOT EXISTS` em tudo, e as FKs dentro de `DO $$` com checagem
 * (Postgres não tem `ADD CONSTRAINT IF NOT EXISTS`). Rodar duas vezes não faz nada na segunda.
 *
 * ⚠ NUNCA `prisma db push` contra produção — regra da casa. O DDL vem de
 * `prisma/mes/schema.sql`, que é a tradução conferida de `prisma/mes/schema.prisma`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(AQUI, "..", "prisma", "mes", "schema.sql");

/**
 * As 14 tabelas que têm de existir no fim. Conferir a LISTA, e não "o comando não deu erro":
 * um `CREATE TABLE IF NOT EXISTS` sobre uma tabela que ficou num schema errado passa calado.
 */
const TABELAS = [
  "MesSetor", "MesRecurso", "MesOperador", "MesMotivoParada", "MesPresenca", "MesSessao",
  "MesEvento", "MesApontamentoQtd", "MesDispositivo", "MesCorrecao", "MesNesting",
  "MesNestingUnidade", "MesNestingItem", "MesAuditoria",
];

/**
 * ⚠⚠ QUEBRAR O ARQUIVO EM COMANDOS RESPEITANDO O `DO $$`. Um `split(";")` ingênuo corta o corpo do
 * bloco anônimo em pedaços — cada FK viraria três comandos inválidos, e o erro apareceria como
 * sintaxe, não como "a separação por FK não funcionou".
 */
/**
 * Tira os comentários `--` de uma linha, respeitando aspas.
 *
 * ⚠⚠ UM `;` DENTRO DE COMENTÁRIO QUEBRAVA O SPLIT (medido em 21/09/2026: o cabeçalho deste
 * arquivo tem "…do Prisma; quem manda…" e o Postgres recebeu `quem manda é...` como comando,
 * respondendo `42601 syntax error at or near "quem"`). Comentário não é comando, e o separador
 * não pode aprender isso na hora do deploy.
 *
 * ⚠ Respeita aspas simples: um `--` dentro de string literal é texto, não comentário.
 */
function semComentario(linha) {
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    if (linha[i] === "'") aspas = !aspas;
    else if (!aspas && linha[i] === "-" && linha[i + 1] === "-") return linha.slice(0, i);
  }
  return linha;
}

function comandos(sql) {
  const limpo = sql.split("\n").map(semComentario).join("\n");
  const fora = limpo.split(/(\$\$[\s\S]*?\$\$)/g);
  const juntos = [];
  let atual = "";
  for (const pedaco of fora) {
    if (pedaco.startsWith("$$")) { atual += pedaco; continue; }
    const partes = pedaco.split(";");
    for (let i = 0; i < partes.length - 1; i++) { juntos.push(atual + partes[i]); atual = ""; }
    atual += partes[partes.length - 1];
  }
  if (atual.trim()) juntos.push(atual);
  return juntos.map((c) => c.trim()).filter(Boolean);
}

/**
 * Colunas acrescentadas DEPOIS que a tabela nasceu.
 *
 * ⚠ `planejadoManual` (22/09/2026): o total da marca quando foi DIGITADO, separado do
 * `planejadoQtd`, que no caminho do nesting é a quantidade da BARRA. Ver o comentário no model.
 */
const COLUNAS = [
  ["MesSessao", "planejadoManual", "DOUBLE PRECISION NOT NULL DEFAULT 0"],
];

async function main() {
  // ⚠ O cliente do PORTAL, de propósito: este script CRIA o schema `mes`, então não pode depender
  // de uma conexão que já precise dele para funcionar.
  const prisma = new PrismaClient();
  try {
    const sql = fs.readFileSync(SQL, "utf8");
    const lista = comandos(sql);
    for (const cmd of lista) await prisma.$executeRawUnsafe(cmd);
    console.log(`[ensure-mes-proprio] ${lista.length} comando(s) aplicados.`);

    // ⚠⚠ COLUNA NOVA NÃO NASCE DE `CREATE TABLE IF NOT EXISTS` (regra da casa, e a razão de
    // `scripts/ensure-*.mjs` existirem). Num banco onde a tabela JÁ existe, o create é no-op e a
    // coluna nunca apareceria — o `schema.sql` acima só serve para banco novo.
    for (const [tabela, coluna, tipo] of COLUNAS) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE mes."${tabela}" ADD COLUMN IF NOT EXISTS "${coluna}" ${tipo}`,
      );
    }

    // ⚠⚠ A CONFERÊNCIA É O PONTO DO SCRIPT. Sem ela, "rodou sem erro" e "as tabelas existem no
    // schema certo" seriam a mesma frase — e não são.
    const achadas = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'mes'`,
    );
    const nomes = new Set(achadas.map((t) => t.tablename));
    const faltando = TABELAS.filter((t) => !nomes.has(t));
    if (faltando.length) {
      throw new Error(`faltam no schema "mes": ${faltando.join(", ")}`);
    }
    console.log(`[ensure-mes-proprio] OK — ${TABELAS.length} tabelas no schema "mes".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[ensure-mes-proprio] ⚠ FALHOU:", e.message);
  process.exit(1);
});
