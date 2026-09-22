#!/usr/bin/env node
/**
 * AS DUAS COLUNAS DA CONVERSÃO DE UNIDADE, em `CotacaoItem`.
 *
 * ⚠⚠ COLUNA NOVA NÃO NASCE DE `CREATE TABLE IF NOT EXISTS` — a tabela já existe, e o create seria
 * no-op. É a mesma razão de todos os `scripts/ensure-*.mjs` existirem, e por isso este roda no
 * `build` (regra da casa: nunca `prisma db push` contra produção).
 *
 * ⚠ AMBAS NULÁVEIS E SEM DEFAULT. Nulo quer dizer "não houve conversão" — e é assim que as 453
 * cotações já recebidas continuam válidas sem nenhum tratamento: elas foram cotadas na unidade da
 * RM, que é a base em que `qtdCotada`/`precoUnit` já estão. Um default 1 diria "converti com fator
 * 1", que é afirmação diferente de "não converti".
 *
 * ⚠ Idempotente: `ADD COLUMN IF NOT EXISTS`. Rodar duas vezes não faz nada na segunda.
 */
import { PrismaClient } from "@prisma/client";

const COLUNAS = [
  ["unidadeCotada", "TEXT"],
  ["fatorParaRM", "DOUBLE PRECISION"],
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const [coluna, tipo] of COLUNAS) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "CotacaoItem" ADD COLUMN IF NOT EXISTS "${coluna}" ${tipo}`,
      );
    }
    // ⚠⚠ CONFERIR A LISTA, e não "o comando não deu erro": é a diferença entre mandar criar e
    // existir. Mesma lição do ensure do MES.
    const achadas = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'CotacaoItem'`,
    );
    const nomes = new Set(achadas.map((c) => c.column_name));
    const faltando = COLUNAS.map(([c]) => c).filter((c) => !nomes.has(c));
    if (faltando.length) throw new Error(`faltam em "CotacaoItem": ${faltando.join(", ")}`);
    console.log(`[ensure-cotacao-unidade] OK — ${COLUNAS.length} coluna(s) em "CotacaoItem".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[ensure-cotacao-unidade] ⚠ FALHOU:", e.message);
  process.exit(1);
});
