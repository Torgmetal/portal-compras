/* CONJUNTO NÃO SE CORTA — tira da programação de corte quem nunca deveria estar nela.
 *
 * ⚠⚠ Vitor (08/09/2026): "sobre a OP-67 precisamos que você ignore ela, pois está poluindo todas as
 * linhas, e não temos mais nada para fazermos de preparação". Investigando a poluição: 1.139
 * CONJUNTOS da 067 estavam com `corteDiaProgramado` de 18/06 — 138.892 kg desenhados como corte a
 * fazer. Conjunto nasce na MONTAGEM, a partir dos croquis; quem passa pelo corte é o croqui e a
 * peça avulsa [[torg_etapa_conjunto_croqui]]. É erro de lançamento, não produção.
 *
 * ⚠ NÃO É BAIXA. Não se afirma que nada foi feito: apenas se remove uma programação que não fazia
 * sentido. O croqui correspondente segue na fila do corte, com o seu próprio dia.
 *
 * ⚠ Varrido em 08/09/2026: só a OP-067 tem o caso, num lote único. Se aparecer em outra obra, vale
 * investigar a origem antes de limpar — pode ser sintoma e não sujeira.
 *
 * Uso: node scripts/tirar-conjuntos-do-corte.mjs --op 067 [--aplicar]
 */
import { prisma } from "@/lib/prisma";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OP = arg("--op");
const aplicar = process.argv.includes("--aplicar");
if (!OP) { console.error("uso: --op <numero> [--aplicar]"); process.exit(1); }

const op = await prisma.oP.findFirst({ where: { numero: OP }, select: { id: true, numero: true, obra: true } });
if (!op) { console.error(`OP ${OP} não encontrada`); process.exit(1); }

const alvo = { opId: op.id, tipoPeca: "CONJUNTO", corteDiaProgramado: { not: null } };
const pc = await prisma.pecaConjunto.findMany({
  where: alvo, select: { id: true, marca: true, pesoTotalKg: true, corteDiaProgramado: true, maquina: true },
});
const kg = Math.round(pc.reduce((s, p) => s + (p.pesoTotalKg || 0), 0));
console.log(`OP-${op.numero} · ${op.obra}`);
console.log(`${pc.length} conjunto(s) com dia de corte · ${kg.toLocaleString("pt-BR")} kg`);
console.log(`dias: ${[...new Set(pc.map((p) => p.corteDiaProgramado.toISOString().slice(0, 10)))].join(", ")}`);
console.log(`com máquina definida: ${pc.filter((p) => p.maquina).length}`);
console.log(`amostra: ${pc.slice(0, 5).map((p) => p.marca).join(", ")}`);

if (!aplicar) { console.log("\nNada gravado. Rode com --aplicar."); await prisma.$disconnect(); process.exit(0); }
const r = await prisma.pecaConjunto.updateMany({ where: alvo, data: { corteDiaProgramado: null, maquina: null } });
await prisma.auditLog.create({
  data: { action: "TIRAR_CONJUNTO_DO_CORTE", entity: "PecaConjunto", entityId: `${r.count} conjuntos`,
          diff: { op: op.numero, conjuntos: r.count, kg,
                  motivo: "conjunto não passa pelo corte — quem se corta é o croqui; lançamento indevido poluía o Gantt (Vitor 08/09/2026)" } },
}).catch(() => {});
console.log(`\n✓ ${r.count} conjunto(s) fora da programação de corte, com AuditLog.`);
await prisma.$disconnect();
