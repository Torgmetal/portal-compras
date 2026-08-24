#!/usr/bin/env node
// Amarra à OP a produção do Syneco de obras cujo número casa só por SUFIXO ("T36" → OP-036-01),
// e SÓ a partir da abertura da OP. Ver o porquê do corte por data em lib/syneco-obra.js.
//
// Os dois syncs (/api/mes/sync e /api/mes/sync-ordens) já gravam o opId certo e regravam a cada
// rodada — este script existe só para as linhas antigas que o agente da fábrica não reenvia mais.
//
//   node --env-file=.env.local scripts/backfill-op-sufixo.mjs            (simula)
//   node --env-file=.env.local scripts/backfill-op-sufixo.mjs --aplicar  (grava)
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const kg = (n) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const base = (obra) => {
  const m = String(obra || "").trim().match(/^T(\d+)/i);
  return m ? String(parseInt(m[1], 10)).padStart(3, "0") : null;
};

const obras = [...new Set((await p.mesOrdem.groupBy({ by: ["obra"], where: { opId: null } })).map((o) => o.obra))];
const numeros = [...new Set(obras.map(base).filter(Boolean))];
const ops = await p.oP.findMany({
  where: { OR: numeros.map((n) => ({ numero: { startsWith: n } })) },
  select: { id: true, numero: true, obra: true, dataInicio: true },
});

let achou = 0;
for (const obra of obras) {
  const b = base(obra);
  if (!b || ops.some((o) => o.numero === b)) continue; // exato não é caso deste script
  const op = ops
    .filter((o) => o.numero.startsWith(`${b}-`))
    .sort((a, c) => a.numero.localeCompare(c.numero, "pt-BR", { numeric: true }))[0];
  if (!op?.dataInicio) continue;
  achou++;

  const where = { obra, opId: null, dataInicio: { gte: op.dataInicio } };
  const ord = await p.mesOrdem.aggregate({ where, _count: { id: true }, _sum: { pesoProduzido: true } });
  const ap = await p.mesApontamento.aggregate({ where, _count: { id: true }, _sum: { produzidoKg: true } });
  const fora = await p.mesOrdem.count({ where: { obra, opId: null, OR: [{ dataInicio: { lt: op.dataInicio } }, { dataInicio: null }] } });

  console.log(`${obra} → OP-${op.numero} "${(op.obra || "").trim()}" (aberta em ${op.dataInicio.toISOString().slice(0, 10)})`);
  console.log(`  entra:  ${ord._count.id} ordens (${kg(ord._sum.pesoProduzido)} kg) + ${ap._count.id} apontamentos (${kg(ap._sum.produzidoKg)} kg)`);
  console.log(`  fica de fora: ${fora} ordens anteriores à abertura — são de outro contrato com o mesmo número`);

  if (APLICAR) {
    const a = await p.mesOrdem.updateMany({ where, data: { opId: op.id } });
    const c = await p.mesApontamento.updateMany({ where, data: { opId: op.id } });
    console.log(`  ✔ gravado: ${a.count} ordens, ${c.count} apontamentos`);
  }
}

if (!achou) console.log("nenhuma obra casa por sufixo — nada a fazer");
else if (!APLICAR) console.log("\n(simulação — rode com --aplicar para gravar)");
await p.$disconnect();
