#!/usr/bin/env node
/**
 * OS ÍNDICES DA PROGRAMAÇÃO — o que o totem do MES lê a cada toque do operador.
 *
 * ⚠⚠ NÃO HAVIA ÍNDICE NENHUM NAS COLUNAS `*DiaProgramado` (levantado em 20/09/2026, medido em
 * 21/09). `PecaConjunto` tem 23.016 linhas e só índices por `opId`, `status`, `marca` e `tipoPeca`
 * — a lista do posto fazia **seq scan da tabela inteira** para devolver 90 peças.
 *
 * Medido em produção, no Acabamento:
 *
 * | | antes | depois |
 * |---|---|---|
 * | tempo | 8,549 ms | **0,221 ms** |
 * | buffers | 1.511 | **60** |
 *
 * ⚠⚠ ÍNDICE PARCIAL, E É ELE QUE TORNA ISTO BARATO. Só 90 das 23.016 linhas têm
 * `acabamentoDiaProgramado` preenchido: o índice completo teria 23 mil entradas para servir 90, e
 * pesaria em TODA escrita de `PecaConjunto` — que é tabela de importação em massa (a L.E. de uma
 * obra entra inteira de uma vez). O `WHERE ... IS NOT NULL` deixa o índice do tamanho do que se
 * consulta.
 *
 * ⚠ A coluna do RECURSO entra junto porque a mesma consulta filtra por posto quando o código é um
 * que o Gantt conhece (`programadoPara`, `doSetor === false`). Um índice só na data serviria
 * metade dos caminhos.
 *
 * ⚠ Isto é tabela do PORTAL, não do MES — o MES só LÊ a programação (ver `lib/mes/programado.js`).
 * O script mora à parte de `ensure-mes-proprio-tables.mjs` por isso: aquele cria o schema `mes`,
 * este afina uma leitura no schema do portal.
 *
 * ⚠ `CREATE INDEX` (sem `CONCURRENTLY`) segura escrita na tabela enquanto constrói. Medido: 23 mil
 * linhas levam dezenas de ms. `CONCURRENTLY` não roda em transação e deixa índice INVÁLIDO quando
 * falha — mais risco do que o lock que ele evitaria neste tamanho.
 */
import { PrismaClient } from "@prisma/client";

/** Os seis setores do Gantt: a coluna de DIA e a de RECURSO de cada um (ver `CAMPO` em lib/gantt-pcp.js). */
const SETORES = [
  { nome: "corte", dia: "corteDiaProgramado", recurso: "maquina" },
  { nome: "montagem", dia: "montagemDiaProgramado", recurso: "montagemBancada" },
  { nome: "solda", dia: "soldaDiaProgramado", recurso: "soldaBancada" },
  { nome: "acabamento", dia: "acabamentoDiaProgramado", recurso: "acabamentoBancada" },
  { nome: "jato", dia: "jatoDiaProgramado", recurso: "jatoBancada" },
  { nome: "pintura", dia: "pinturaDiaProgramado", recurso: "pinturaBancada" },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const s of SETORES) {
      const nome = `PecaConjunto_${s.nome}_prog_idx`;
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "${nome}" ON "PecaConjunto" ("${s.dia}", "${s.recurso}")
         WHERE "${s.dia}" IS NOT NULL`,
      );
      // ⚠ Confere a DEFINIÇÃO, não o nome: índice com o nome certo e as colunas erradas passaria
      // calado, e o seq scan voltaria sem ninguém saber (mesma lição de `identificadoresPorAmbiente`).
      const [achado] = await prisma.$queryRawUnsafe(
        `SELECT indexdef FROM pg_indexes WHERE tablename = 'PecaConjunto' AND indexname = $1`, nome,
      );
      const def = String(achado?.indexdef || "");
      if (!def.includes(s.dia) || !def.includes(s.recurso) || !def.includes("IS NOT NULL")) {
        throw new Error(`índice "${nome}" não ficou como esperado: ${def || "não existe"}`);
      }
    }
    console.log(`[ensure-indices-programacao] OK — ${SETORES.length} índices parciais.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[ensure-indices-programacao] ⚠ FALHOU:", e.message);
  process.exit(1);
});
