// lib/importar-lpc-core.js
// Núcleo de importação de um LPC já parseado → PecaConjunto + ConjuntoCroqui.
// Reutilizado pelo import manual (route) e pelo sync automático do SharePoint.

import { prisma } from "@/lib/prisma";

/**
 * Importa um resultado de parseLPC no banco.
 * @param {object} parsed - saída de parseLPC (conjuntos, croquis, avulsas, relacoes…)
 * @param {object} opts
 * @param {boolean} opts.sobrescrever - apaga peças LPC anteriores da OP antes
 * @param {string|null} opts.userId - para AuditLog
 * @returns {Promise<object>} resumo da importação
 */
export async function importarLpcParsed(parsed, { sobrescrever = true, userId = null } = {}) {
  const opNumero = parsed.opNumero;
  if (!opNumero) return { erro: "OP não detectada no LPC" };

  const total = parsed.conjuntos.length + parsed.croquis.length + parsed.avulsas.length;
  if (total === 0) return { erro: "Nenhuma peça no LPC" };

  const op = await prisma.oP.findUnique({ where: { numero: opNumero } });

  if (sobrescrever) {
    await prisma.pecaConjunto.deleteMany({ where: { opNumero, fonte: "LPC_IMPORT" } });
  }

  const pieceIds = new Map(); // marca → id
  let criados = 0, atualizados = 0, ignorados = 0;

  async function upsert(marca, data) {
    try {
      const existing = await prisma.pecaConjunto.findUnique({
        where: { opNumero_marca: { opNumero, marca } },
      });
      if (existing) {
        await prisma.pecaConjunto.update({ where: { id: existing.id }, data });
        pieceIds.set(marca, existing.id);
        atualizados++;
      } else {
        const created = await prisma.pecaConjunto.create({
          data: { opId: op?.id || null, opNumero, marca, status: "PENDENTE", fonte: "LPC_IMPORT", ...data },
        });
        pieceIds.set(marca, created.id);
        criados++;
      }
    } catch {
      ignorados++;
    }
  }

  for (const c of parsed.conjuntos) {
    await upsert(c.marca, {
      descricao: c.descricao, qte: c.qte, pesoUnitKg: c.pesoUnitKg, pesoTotalKg: c.pesoTotalKg,
      tipoPeca: "CONJUNTO", areaPinturaM2: c.areaPinturaM2,
    });
  }
  for (const cr of parsed.croquis) {
    await upsert(cr.marca, {
      descricao: cr.descricao, material: cr.material, perfil: cr.perfil, qte: cr.qte,
      comprimentoMm: cr.comprimentoMm, pesoUnitKg: cr.pesoUnitKg, pesoTotalKg: cr.pesoTotalKg,
      tipoPeca: "CROQUI", areaPinturaM2: cr.areaPinturaM2, statusPrep: "PENDENTE",
    });
  }
  for (const a of parsed.avulsas) {
    await upsert(a.marca, {
      descricao: a.descricao, material: a.material, perfil: a.perfil, qte: a.qte,
      comprimentoMm: a.comprimentoMm, pesoUnitKg: a.pesoUnitKg, pesoTotalKg: a.pesoTotalKg,
      areaPinturaM2: a.areaPinturaM2,
    });
  }

  // Relações conjunto→croqui
  const conjuntoIds = parsed.conjuntos.map(c => pieceIds.get(c.marca)).filter(Boolean);
  if (conjuntoIds.length > 0) {
    await prisma.conjuntoCroqui.deleteMany({ where: { conjuntoId: { in: conjuntoIds } } });
  }
  let relacoesCriadas = 0;
  for (const rel of parsed.relacoes) {
    const conjuntoId = pieceIds.get(rel.conjuntoMarca);
    const croquiId   = pieceIds.get(rel.croquiMarca);
    if (conjuntoId && croquiId) {
      try {
        await prisma.conjuntoCroqui.create({ data: { conjuntoId, croquiId, qtdNoConjunto: rel.qtdNoConjunto } });
        relacoesCriadas++;
      } catch { /* unique — ignora */ }
    }
  }

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId, action: "IMPORTAR_LPC_SHAREPOINT", entity: "PecaConjunto", entityId: opNumero,
        diff: {
          opNumero, obra: parsed.obra, cliente: parsed.cliente,
          conjuntos: parsed.conjuntos.length, croquis: parsed.croquis.length,
          avulsas: parsed.avulsas.length, relacoes: relacoesCriadas,
          criados, atualizados, ignorados, pesoTotal: parsed.pesoTotal,
        },
      },
    }).catch(() => {});
  }

  return {
    opNumero, opEncontrada: !!op, obra: parsed.obra, cliente: parsed.cliente,
    conjuntos: parsed.conjuntos.length, croquis: parsed.croquis.length, avulsas: parsed.avulsas.length,
    relacoes: relacoesCriadas, criados, atualizados, ignorados, pesoTotal: parsed.pesoTotal,
  };
}
