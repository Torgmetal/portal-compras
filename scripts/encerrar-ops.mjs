// ─── ENCERRAR OP TERMINADA ─────────────────────────────────────────────────────────────────────
//
// Vitor (06/09/2026): "a 067 ainda tem peças que vão entrar no jato e pintura, 103 tbm, 85 tbm, as
// demais pode encerrar".
//
// ⚠ POR QUE ISTO EXISTE. `OP.status` fica ABERTA para sempre — nada no portal encerra obra. Medido
// em 06/09/2026: 27 OPs "abertas", das quais 8 vivas. As 19 restantes poluem TODA fila do PCP,
// porque `lib/op-viva.js` só sabe cortar ENCERRADA e CANCELADA. A fila da pintura naquele dia era
// 349 peças / 38.397 kg — 100% de obra morta, nenhuma peça de OP viva.
//
// ⚠⚠ NÃO ENCERRAR OBRA QUE NUNCA COMEÇOU. 8 das 19 (107, 110, 116, 117, 118, 119, 120, 121) nunca
// tiveram apontamento: foram criadas em agosto/2026 e têm de 0 a 7 peças na LPC. São obras novas
// ainda na engenharia — encerrá-las esconderia trabalho que ainda vai entrar na fábrica. Ficaram
// de fora de propósito; a lista abaixo é só de OP que produziu e parou.
//
// ⚠ O % PINTADO NÃO DECIDE. Estas OPs aparecem com 0% a 64% pintado no Syneco, e isso não quer
// dizer que estão abertas: o apontamento de pintura é fechado em lote (27 dias apontados em 90,
// com 63 t num único dia). Quem diz que a obra acabou é a fábrica, não o dado.
//
// Uso:  node --import ./_loader-reg.mjs scripts/encerrar-ops.mjs            (simulação)
//       node --import ./_loader-reg.mjs scripts/encerrar-ops.mjs --aplicar
import { prisma } from "../lib/prisma.js";

const ENCERRAR = ["060","071","083","084","089","098","102","104","106","111","115"];
const aplicar = process.argv.includes("--aplicar");

const ops = await prisma.oP.findMany({
  where: { numero: { in: ENCERRAR } },
  select: { id: true, numero: true, obra: true, status: true },
  orderBy: { numero: "asc" },
});

const achados = new Set(ops.map((o) => o.numero));
const faltando = ENCERRAR.filter((n) => !achados.has(n));
if (faltando.length) console.log("⚠ não encontradas:", faltando.join(", "));

console.log(`${aplicar ? "APLICANDO" : "SIMULAÇÃO"} — ${ops.length} OP\n`);
for (const o of ops) console.log(`  ${o.numero}  ${o.status.padEnd(13)} → ENCERRADA   ${o.obra || ""}`);

if (!aplicar) {
  console.log("\nNada gravado. Rode com --aplicar para valer.");
} else {
  for (const o of ops) {
    if (o.status === "ENCERRADA") { console.log(`  ${o.numero} já estava encerrada, pulando`); continue; }
    await prisma.oP.update({ where: { id: o.id }, data: { status: "ENCERRADA" } });
    await prisma.auditLog.create({
      data: {
        action: "OP_ENCERRAR", entity: "OP", entityId: o.id,
        diff: { antes: { status: o.status }, depois: { status: "ENCERRADA" },
                motivo: "obra terminada — Vitor 06/09/2026, limpeza das filas do PCP" },
      },
    });
  }
  console.log(`\n✓ ${ops.length} OP encerradas, com AuditLog em cada uma.`);
}
await prisma.$disconnect();
