// ─── BAIXA DO CORTE FEITO À MÃO, FORA DO SYNECO ────────────────────────────────────────────────
//
// Vitor (07/09/2026): "antigamente cortávamos na mão, mas vai por mim vamos dar baixa em 100%
// disso". A OP-067 tem croquis que a fábrica cortou antes de o corte passar a ser lançado no
// Syneco — não há ordem para apontar, e nunca haverá.
//
// ⚠⚠ O QUE ISTO ESCREVE E POR QUÊ. `PecaConjunto.qteProduzida` é o campo que significa "quanto o
// CORTE cortou" (é o único setor em que ele vale — ver a nota em lib/produzido-setor.js). Ele é o
// que `calcularProntidao` lê para decidir se um conjunto pode ser montado. Com os croquis em zero,
// nenhum conjunto da 067 fecha, e a obra inteira fica travada na montagem por um registro que
// nunca vai chegar.
//
// ⚠⚠ POR QUE O SYNECO NÃO DESFAZ ISTO. `lib/reconciliar-syneco-corte.js` tem, na entrada do laço,
// `if (!s || s.prod <= 0) continue` — ela só mexe em peça que TEM produção apontada. Os croquis
// tratados aqui têm zero, então a reconciliação passa por eles sem tocar. A baixa é permanente.
//
// 🚫 O QUE ESTE SCRIPT NÃO FAZ, de propósito: não escreve em `MesOrdem`. Aquela tabela é espelho do
// Syneco, alimentada pelo agente na fábrica — escrever nela criaria um registro que o próximo sync
// pode derrubar e que ninguém consegue auditar contra a fonte. O que se corrige no Syneco se
// corrige NO Syneco; aqui só se registra o que o portal precisa saber para não travar a montagem.
//
// ⚠ FICAM DE FORA os croquis PARCIALMENTE apontados (35 na 067, do tipo "1 de 2"). Esses têm
// produção no Syneco, então a reconciliação os traria de volta ao número dela na próxima rodada —
// escrever neles seria mentira de curta duração. Esses precisam ser acertados no Syneco mesmo.
//
// Uso:  node --import ./_loader-reg.mjs scripts/baixar-corte-manual.mjs --op 067
//       node --import ./_loader-reg.mjs scripts/baixar-corte-manual.mjs --op 067 --aplicar
import { prisma } from "../lib/prisma.js";
import { ehItemComprado } from "../lib/item-comprado.js";

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const OPS = (arg("--op") || "").split(",").map((s) => s.trim()).filter(Boolean);
const aplicar = process.argv.includes("--aplicar");
if (!OPS.length) { console.log("Informe --op 067 (ou 067,083)."); process.exit(1); }

for (const numero of OPS) {
  const op = await prisma.oP.findFirst({ where: { numero }, select: { id: true, numero: true, obra: true } });
  if (!op) { console.log(`OP-${numero}: não encontrada`); continue; }

  const croquis = await prisma.pecaConjunto.findMany({
    where: { opId: op.id, tipoPeca: "CROQUI", fonte: "LPC_IMPORT" },
    select: { id: true, marca: true, descricao: true, perfil: true, qte: true,
              qteProduzida: true, pesoTotalKg: true, status: true },
  });
  const reais = croquis.filter((c) => !ehItemComprado(c));
  const alvo = reais.filter((c) => (c.qteProduzida || 0) === 0);
  const parciais = reais.filter((c) => {
    const q = Math.max(1, c.qte || 1);
    return (c.qteProduzida || 0) > 0 && (c.qteProduzida || 0) < q;
  });

  const kg = alvo.reduce((s, c) => s + (c.pesoTotalKg || 0), 0);
  console.log(`\nOP-${op.numero} (${op.obra || ""})`);
  console.log(`  croquis de fabricação: ${reais.length}`);
  console.log(`  A DAR BAIXA (apontamento zero): ${alvo.length} · ${Math.round(kg).toLocaleString("pt-BR")} kg`);
  console.log(`  fora, por terem apontamento parcial: ${parciais.length} — corrigir no Syneco`);

  if (!aplicar) { console.log("  (simulação — nada gravado)"); continue; }

  let n = 0;
  for (let i = 0; i < alvo.length; i += 20) {
    const lote = alvo.slice(i, i + 20);
    await Promise.all(lote.map((c) => prisma.pecaConjunto.update({
      where: { id: c.id },
      data: {
        qteProduzida: Math.max(1, c.qte || 1),
        pesoProduzido: c.pesoTotalKg || 0,
        // ⚠ SEM `dataProducao`: ninguém sabe o dia em que aquilo foi cortado, e carimbar uma data
        // inventada é pior do que não ter data. Ver a mesma decisão na regularização de GRD.
        ...(c.status === "PENDENTE" && { status: "CORTE", ultimoSetor: "Corte" }),
      },
    })));
    n += lote.length;
  }
  await prisma.auditLog.create({
    data: {
      action: "CORTE_BAIXA_MANUAL", entity: "OP", entityId: op.id,
      diff: { opNumero: op.numero, croquis: n, kg: Math.round(kg),
              motivo: "corte feito à mão antes do lançamento no Syneco — Vitor 07/09/2026: 'vai por mim, vamos dar baixa em 100% disso'",
              foraParciais: parciais.length },
    },
  });
  console.log(`  ✓ ${n} croquis com baixa, AuditLog gravado.`);
}
await prisma.$disconnect();
