import "server-only";
import { prisma } from "./prisma";

// Reconcilia (dá baixa) o produzido do corte do Syneco nas peças LPC ativas:
// casa por opId + marca, atualiza qteProduzida / pesoProduzido / dataProducao e
// promove PENDENTE → CORTE quando há produção. É a mesma "baixa" que o botão
// Importar Syneco faz por OP — aqui roda em lote, pra todas as frentes, e é
// idempotente (só escreve onde realmente muda, em lotes pequenos p/ não pesar
// no Neon). Usada pelo cron de baixa automática.
export async function reconciliarSynecoCorte() {
  // Produzido no corte do Syneco, agregado por opId + item.
  const syn = await prisma.mesOrdem.groupBy({
    by: ["opId", "item"],
    where: { setor: { contains: "Corte", mode: "insensitive" }, opId: { not: null }, produzidoUn: { gt: 0 } },
    _sum: { produzidoUn: true, pesoProduzido: true },
    _max: { dataFim: true },
  });
  const synMap = new Map();
  for (const s of syn) synMap.set(`${s.opId}|${s.item}`, { prod: s._sum.produzidoUn || 0, peso: s._sum.pesoProduzido || 0, dataFim: s._max.dataFim });

  // Peças LPC que ainda dependem do corte (PENDENTE/CORTE) e têm opId.
  const pecas = await prisma.pecaConjunto.findMany({
    where: { fonte: "LPC_IMPORT", opId: { not: null }, status: { in: ["PENDENTE", "CORTE"] } },
    select: { id: true, opId: true, marca: true, qteProduzida: true, status: true },
  });

  const updates = [];
  for (const pc of pecas) {
    const s = synMap.get(`${pc.opId}|${pc.marca}`);
    if (!s || s.prod <= 0) continue;
    const mudaProd = Math.abs((pc.qteProduzida || 0) - s.prod) > 0.001;
    const promove = pc.status === "PENDENTE";
    if (!mudaProd && !promove) continue;
    updates.push({
      id: pc.id,
      promove,
      data: {
        qteProduzida: s.prod,
        pesoProduzido: s.peso,
        ...(s.dataFim && { dataProducao: s.dataFim }),
        ...(promove && { status: "CORTE", ultimoSetor: "Corte" }),
      },
    });
  }

  let atualizadas = 0, promovidas = 0;
  for (let i = 0; i < updates.length; i += 10) {
    const lote = updates.slice(i, i + 10);
    await Promise.all(lote.map((u) => prisma.pecaConjunto.update({ where: { id: u.id }, data: u.data })));
    for (const u of lote) { atualizadas++; if (u.promove) promovidas++; }
  }
  return { atualizadas, promovidas, candidatas: pecas.length };
}
