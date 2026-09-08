/* BAIXA INTERNA DA PREPARAÇÃO DE UMA OP — tira do quadro o corte que não vai mais acontecer.
 *
 * ⚠⚠ Vitor (08/09/2026), duas vezes: "sobre a OP-67 precisamos que você ignore ela, pois está
 * poluindo todas as linhas, e não temos mais nada para fazermos de preparação" e "precisa ignorar a
 * 67, preciso que tire ela da página". Eu ofereci duas vezes o caminho do Syneco (a planilha de
 * baixa, que é o correto para a rastreabilidade) e ele reafirmou. É decisão dele; executo.
 *
 * ⚠ NÃO APAGA NADA. Grava `baixaSetores.CORTE = {qtd, em, por, motivo}` — a baixa INTERNA que o
 * portal já tinha, com autor e data. A programação (`corteDiaProgramado`) fica, o Syneco fica
 * intocado, e desfazer é remover a chave. Apagar o dia seria perder o registro de que houve
 * programação; inventar apontamento seria mentir para o Syneco.
 *
 * ⚠ O CLIENTE NÃO VÊ ISTO. O cronograma lê `mesApontamento` direto (lib/cronograma-syneco.js), então
 * PDF, XML e portal do cliente continuam mostrando só o que a fábrica apontou. Esta baixa é
 * planejamento interno — e é por isso que ela pode existir sem corromper o que vai para fora.
 *
 * Uso: node scripts/baixar-preparacao-op.mjs --op 067 --por "Vitor Costa" [--aplicar]
 */
import { prisma } from "@/lib/prisma";
import { lerProduzidoPorSetor } from "@/lib/produzido-setor";
import { SO_FABRICACAO } from "@/lib/lista-pecas";
import { OP_VIVA } from "@/lib/op-viva";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OP = arg("--op");
const POR = arg("--por") || "PCP";
const MOTIVO = arg("--motivo") || "preparação encerrada — nada mais a cortar nesta obra";
const aplicar = process.argv.includes("--aplicar");
if (!OP) { console.error("uso: --op <numero> --por <nome> [--aplicar]"); process.exit(1); }

const op = await prisma.oP.findFirst({ where: { numero: OP }, select: { id: true, numero: true, obra: true } });
if (!op) { console.error(`OP ${OP} não encontrada`); process.exit(1); }

// ⚠ conjunto fora: ele não passa pelo corte, e se ainda estiver programado o lugar é
//   scripts/tirar-conjuntos-do-corte.mjs — baixar seria afirmar um corte que não existe.
const pecas = await prisma.pecaConjunto.findMany({
  where: { ...SO_FABRICACAO, ...OP_VIVA, opId: op.id, tipoPeca: { not: "CONJUNTO" } },
  select: { id: true, opId: true, marca: true, qte: true, pesoTotalKg: true, baixaSetores: true },
});
const feito = await lerProduzidoPorSetor(pecas.map((p) => ({ opId: p.opId, marca: p.marca })), ["CORTE"]);
const pendentes = pecas.filter((p) => feito({ opId: p.opId, marca: p.marca }, "CORTE") < Math.max(1, p.qte || 1));
const kg = Math.round(pendentes.reduce((s, p) => s + (p.pesoTotalKg || 0), 0));

console.log(`OP-${op.numero} · ${op.obra}`);
console.log(`${pecas.length} peça(s) de corte · ${pendentes.length} ainda pendente(s) · ${kg.toLocaleString("pt-BR")} kg`);
console.log(`motivo: ${MOTIVO}`);
console.log(`por: ${POR}`);
if (!aplicar) { console.log("\nNada gravado. Rode com --aplicar."); await prisma.$disconnect(); process.exit(0); }

const agora = new Date().toISOString();
let n = 0;
for (const p of pendentes) {
  const bx = p.baixaSetores && typeof p.baixaSetores === "object" ? p.baixaSetores : {};
  await prisma.pecaConjunto.update({
    where: { id: p.id },
    data: { baixaSetores: { ...bx, CORTE: { qtd: Math.max(1, p.qte || 1), em: agora, por: POR, motivo: MOTIVO } } },
  });
  n++;
}
await prisma.auditLog.create({
  data: { action: "BAIXA_PORTAL_PREPARACAO", entity: "PecaConjunto", entityId: `${n} peças`,
          diff: { op: op.numero, pecas: n, kg, por: POR, motivo: MOTIVO,
                  nota: "baixa INTERNA do portal (baixaSetores.CORTE); Syneco intocado; não altera o que vai ao cliente" } },
}).catch(() => {});
console.log(`\n✓ ${n} peça(s) baixadas no portal, com AuditLog.`);
await prisma.$disconnect();
