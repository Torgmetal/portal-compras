#!/usr/bin/env node
/**
 * Regulariza a GRD de MONTAGEM dos conjuntos que a fábrica já montou sem passar pelo portal.
 *
 * O caso: o conjunto desceu para a bancada por fora do fluxo (lista antiga, desenho impresso fora),
 * o Syneco apontou a montagem, mas não existe GrdLiberacao — e o quadro do PCP mostra o ponto
 * amarelo de "sem GRD" numa peça que já está pronta. Vitor (05/09/2026): "nesse caso que estamos
 * com esses conjuntos em fabricação mas não geramos a GRD dele, como podemos fazer para consertar?"
 *
 * ⚠⚠ O QUE ESTE SCRIPT NÃO FAZ, E POR QUÊ (acordo de 31/08/2026, reafirmado em 01/09):
 *   - NÃO assina com o nome de quem não emitiu. A autoria fica "Vitor Costa · regularização".
 *   - NÃO carimba PDF com data retroativa. Nenhum desenho é emitido aqui.
 * A GRD é a evidência que a Torg leva para a auditoria ISO. Um registro nomeando alguém por um ato
 * que essa pessoa não praticou contamina a credibilidade de TODAS as GRDs se alguém cruzar com o
 * log — e expõe uma funcionária que não está na conversa.
 *
 * ⚠ A DATA É VERDADEIRA: `MesOrdem.dataInicio` daquela marca no setor Montagem, que é quando a
 * montagem daquele conjunto de fato começou. Está preenchida em 100% dos casos (conferido em
 * 05/09/2026). O `MesApontamento` não serve: ele não guarda a marca, só `descricaoItem`.
 *
 * ⚠ SÓ MONTAGEM. A solda trabalha sobre o mesmo conjunto e o mesmo desenho que a montagem baixou —
 * decisão do Vitor em 05/09/2026. Por isso o portal nunca teve GRD de SOLDA, e isso não é furo.
 *
 * ⚠ SÓ OBRA VIVA (ABERTA · EM_EXECUCAO · ATRASADA). Obra encerrada pode ter Data Book fechado, e
 * criar GRD depois disso mexe em documento já entregue.
 *
 * Uso:
 *   node scripts/regularizar-grd-montagem.mjs                 # dry-run de tudo (não grava nada)
 *   node scripts/regularizar-grd-montagem.mjs --op 097        # dry-run de uma OP
 *   node scripts/regularizar-grd-montagem.mjs --op 097 --aplicar
 *   node scripts/regularizar-grd-montagem.mjs --aplicar       # grava em todas as elegíveis
 *
 * É IDEMPOTENTE: pula a marca que já tem GRD de montagem, então rodar de novo não duplica.
 * É REVERSÍVEL: tudo que ele cria tem liberadoPorNome = AUTOR e setor = "MONTAGEM".
 */
import { prisma } from "../lib/prisma.js";

const AUTOR = "Vitor Costa · regularização";
const ARQUIVO = "(regularização — desenho não emitido pelo portal)";
const VIVAS = ["ABERTA", "EM_EXECUCAO", "ATRASADA"];

// Vitor (05/09/2026): "a OP 84 e 67 não precisa de GRD".
const FORA = ["067", "084"];

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
// aceita lista: --op 097,103,089
const soOp = (() => { const i = args.indexOf("--op");
  return i >= 0 ? String(args[i + 1] || "").split(",").map((x) => x.trim()).filter(Boolean) : null; })();

const linhas = await prisma.$queryRawUnsafe(`
  SELECT o.id AS "opId", o.numero AS op, o.obra, m.item AS marca, m."dataInicio" AS quando
  FROM "MesOrdem" m
  JOIN "OP" o ON o.id = m."opId"
  LEFT JOIN "GrdLiberacao" g
    ON g."opNumero" = o.numero
   AND UPPER(TRIM(g.marca)) = UPPER(TRIM(m.item))
   AND UPPER(g.setor) = 'MONTAGEM'
  WHERE m."produzidoUn" > 0 AND m.setor = 'Montagem'
    AND o.status::text = ANY($1::text[])
    AND NOT (o.numero = ANY($2::text[]))
    AND g.id IS NULL
    AND m."dataInicio" IS NOT NULL
  ORDER BY o.numero, m.item`, VIVAS, FORA);

const alvo = soOp ? linhas.filter((l) => soOp.includes(l.op)) : linhas;

const porOp = new Map();
for (const l of alvo) {
  const a = porOp.get(l.op) || { obra: l.obra, n: 0, de: l.quando, ate: l.quando };
  a.n++;
  if (l.quando < a.de) a.de = l.quando;
  if (l.quando > a.ate) a.ate = l.quando;
  porOp.set(l.op, a);
}

const d = (x) => new Date(x).toISOString().slice(0, 10);
console.log(`\n${aplicar ? "APLICANDO" : "DRY-RUN (nada será gravado)"}${soOp ? ` — só ${soOp.map((o) => "OP-" + o).join(", ")}` : ""}\n`);
console.log("OP     obra                 marcas   montagem de … até");
for (const [op, a] of [...porOp].sort((x, y) => y[1].n - x[1].n))
  console.log(`  ${op.padEnd(5)} ${String(a.obra || "").padEnd(20).slice(0, 20)} ${String(a.n).padEnd(8)} ${d(a.de)} … ${d(a.ate)}`);
console.log(`\nTOTAL: ${alvo.length} GRD(s) de montagem a criar, em ${porOp.size} OP(s).`);

if (!aplicar) {
  console.log("\nNada foi gravado. Para valer: acrescente --aplicar.");
  await prisma.$disconnect();
  process.exit(0);
}

// ⚠ em blocos: 600+ inserts numa tacada só pressionam a compute pequena do Neon (erro 53200).
let feitas = 0;
const LOTE = 100;
for (let i = 0; i < alvo.length; i += LOTE) {
  const bloco = alvo.slice(i, i + LOTE);
  await prisma.grdLiberacao.createMany({
    data: bloco.map((l) => ({
      opId: l.opId, opNumero: l.op, marca: l.marca,
      arquivo: ARQUIVO, setor: "MONTAGEM",
      liberadoPorNome: AUTOR,
      createdAt: l.quando,          // ⚠ a data VERDADEIRA do início da montagem
      ultimaImpressaoEm: null,      // nada foi impresso: não existe "última impressão"
      historico: [{ em: l.quando, por: AUTOR, origem: "apontamento_syneco" }],
    })),
    skipDuplicates: true,
  });
  feitas += bloco.length;
  process.stdout.write(`\r  gravadas ${feitas}/${alvo.length}`);
}
console.log("");

// ⚠ bookkeeping não-fatal: uma falha de log nunca deve derrubar o que já foi gravado.
await prisma.auditLog.create({
  data: {
    action: "GRD_REGULARIZAR_MONTAGEM", entity: "GrdLiberacao", entityId: `${feitas} GRD(s)`,
    diff: { porOp: Object.fromEntries([...porOp].map(([op, a]) => [op, a.n])), autor: AUTOR,
            criterio: "MesOrdem.produzidoUn>0 em Montagem, sem GRD de MONTAGEM, OP viva",
            foraDoAlcance: FORA },
  },
}).catch((e) => console.log("  (aviso: AuditLog falhou —", e.message, ")"));

console.log(`\n✓ ${feitas} GRD(s) criada(s). Reversível por (liberadoPorNome="${AUTOR}", setor="MONTAGEM").`);
await prisma.$disconnect();
