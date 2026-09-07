/* Mede, nos apontamentos do Syneco, QUANTO do setor anterior estava pronto no dia em que o
   seguinte começou. É a fonte das porcentagens usadas em scripts/sobrepor-etapas-cronograma.mjs —
   para poder refazer a conta em vez de confiar num número decorado.

   ⚠ Só entram obras com o setor anterior JÁ ENCERRADO (último apontamento há mais de 30 dias):
   em obra andando o denominador ainda cresce e o percentual sai inflado.

   Uso: node scripts/medir-sobreposicao-setores.mjs  */
import { prisma } from "@/lib/prisma";
import { normalizeSetorSyneco } from "@/lib/syneco-dia";
const CADEIA = [["CORTE", "MONTAGEM"], ["MONTAGEM", "SOLDA"], ["SOLDA", "PINTURA"]];
const util = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const uteis = (a, b) => { let n = 0; const x = new Date(a); while (x < b) { x.setUTCDate(x.getUTCDate() + 1); if (util(x)) n++; } return n; };
const HOJE = new Date(Date.UTC(2026, 8, 7));
const DIA = 86400000;

const ap = await prisma.mesApontamento.findMany({
  where: { opId: { not: null }, produzidoKg: { gt: 0 } },
  select: { opId: true, setor: true, produzidoKg: true, dataInicio: true },
});
const ops = await prisma.oP.findMany({ where: { id: { in: [...new Set(ap.map((a) => a.opId))] } }, select: { id: true, numero: true } });
const numDe = new Map(ops.map((o) => [o.id, o.numero]));
const serie = new Map();
for (const a of ap) {
  const s = normalizeSetorSyneco(a.setor);
  if (!s || !a.dataInicio) continue;
  const k = `${a.opId}|${s}`;
  (serie.get(k) || serie.set(k, []).get(k)).push({ d: a.dataInicio, kg: a.produzidoKg });
}
for (const v of serie.values()) v.sort((x, y) => x.d - y.d);

const linhas = [];
for (const opId of new Set(ap.map((a) => a.opId))) {
  for (const [antes, depois] of CADEIA) {
    const A = serie.get(`${opId}|${antes}`), B = serie.get(`${opId}|${depois}`);
    if (!A?.length || !B?.length) continue;
    // ⚠ SÓ SETOR JÁ ENCERRADO ENTRA: sem o último apontamento a mais de 30 dias, o denominador
    //   ainda cresce e o "% pronto quando o próximo começou" sai inflado.
    const fimA = A[A.length - 1].d;
    if ((HOJE - fimA) / DIA < 30) continue;
    const iniB = B[0].d, totalA = A.reduce((s, x) => s + x.kg, 0);
    if (totalA <= 0 || iniB < A[0].d) continue;
    linhas.push({ op: numDe.get(opId), passo: `${antes}→${depois}`,
      pct: Math.round((A.filter((x) => x.d <= iniB).reduce((s, x) => s + x.kg, 0) / totalA) * 100),
      dias: uteis(A[0].d, iniB) });
  }
}
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
console.log("SÓ obras com o setor anterior já encerrado (denominador final):\n");
for (const [antes, depois] of CADEIA) {
  const g = linhas.filter((l) => l.passo === `${antes}→${depois}`);
  if (!g.length) { console.log(`  ${antes}→${depois}: sem amostra`); continue; }
  const p = g.map((x) => x.pct), d = g.map((x) => x.dias);
  console.log(`  ${(antes + "→" + depois).padEnd(18)} ${String(g.length).padStart(2)} obras · o 2º começa com o 1º em ${med(p)}%  (faixa ${Math.min(...p)}–${Math.max(...p)}%) · ${med(d)} du depois do 1º começar`);
  console.log(`      obras: ${g.map((x) => `${x.op}:${x.pct}%`).join("  ")}`);
}
await prisma.$disconnect();
