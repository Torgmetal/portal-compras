// ─── REABRIR OP QUE NÃO TINHA ACABADO ──────────────────────────────────────────────────────────
//
// Correção do encerramento em massa de 07/09/2026 (ver scripts/encerrar-ops.mjs). Encerrei 11 OPs
// com base em "produziu e parou"; Vitor conferiu na fábrica e cinco não tinham acabado:
//
//   083  falta parte de algumas vigas, ainda vão iniciar — "se não planejou não fabrica"
//   084  falta a pintura
//   102  falta acabamento, jato e pintura
//   104  faltam algumas chapas de piso e guarda-corpo
//   115  Vitor vai conferir, mas "deve faltar alguma coisa mesmo"
//
// Confirmadas como acabadas e que FICAM encerradas: 089 e 106 (Vitor: "a 89 finalizou como disse",
// "106 finalizada 100%"). As outras quatro do lote (060, 071, 098, 111) ele não contestou.
//
// ⚠⚠ A LIÇÃO, para a próxima vez que alguém for encerrar OP em massa: "parou de apontar" NÃO é
// "acabou". A 084 estava só esperando pintura e a 102 tinha três setores inteiros pela frente —
// nenhuma das duas apontava havia dias porque estavam PARADAS na fila, não porque tinham terminado.
// O único critério confiável é perguntar para quem enxerga a fábrica. E o erro tem lado seguro:
// OP aberta a mais só polui tela; OP encerrada a mais ESCONDE trabalho de quem precisa fabricar.
//
// Uso:  node --import ./_loader-reg.mjs scripts/reabrir-ops.mjs            (simulação)
//       node --import ./_loader-reg.mjs scripts/reabrir-ops.mjs --aplicar
import { prisma } from "../lib/prisma.js";

const REABRIR = ["083", "084", "102", "104", "115"];
const aplicar = process.argv.includes("--aplicar");

const ops = await prisma.oP.findMany({
  where: { numero: { in: REABRIR } },
  select: { id: true, numero: true, obra: true, status: true },
  orderBy: { numero: "asc" },
});

console.log(`${aplicar ? "APLICANDO" : "SIMULAÇÃO"} — ${ops.length} OP\n`);
for (const o of ops) console.log(`  ${o.numero}  ${o.status.padEnd(11)} → ABERTA   ${o.obra || ""}`);

if (!aplicar) {
  console.log("\nNada gravado. Rode com --aplicar para valer.");
} else {
  for (const o of ops) {
    if (o.status === "ABERTA") { console.log(`  ${o.numero} já estava aberta, pulando`); continue; }
    await prisma.oP.update({ where: { id: o.id }, data: { status: "ABERTA" } });
    await prisma.auditLog.create({
      data: {
        action: "OP_REABRIR", entity: "OP", entityId: o.id,
        diff: { antes: { status: o.status }, depois: { status: "ABERTA" },
                motivo: "encerrada por engano em 07/09/2026 — a obra não tinha acabado (conferência do Vitor na fábrica)" },
      },
    });
  }
  console.log(`\n✓ ${ops.length} OP reabertas, com AuditLog em cada uma.`);
}
await prisma.$disconnect();
