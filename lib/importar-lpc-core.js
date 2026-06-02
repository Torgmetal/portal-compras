// lib/importar-lpc-core.js
// Núcleo de importação de um LPC já parseado → PecaConjunto + ConjuntoCroqui.
// Usa operações em MASSA (createMany) — rápido, não estoura o limite do Vercel.

import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

// createMany em lotes de 100 (createMany grande estoura a memória do Neon — 53200)
async function createManyChunked(model, data, chunk = 100) {
  let n = 0;
  for (let i = 0; i < data.length; i += chunk) {
    const r = await model.createMany({ data: data.slice(i, i + chunk), skipDuplicates: true });
    n += r.count ?? 0;
  }
  return n;
}

/**
 * Importa um resultado de parseLPC no banco (sempre sobrescreve as peças LPC da OP).
 * @param {object} parsed - saída de parseLPC
 * @param {object} opts - { userId? }
 * @returns {Promise<object>} resumo
 */
export async function importarLpcParsed(parsed, { userId = null } = {}) {
  const opNumero = parsed.opNumero;
  if (!opNumero) return { erro: "OP não detectada no LPC" };
  const total = parsed.conjuntos.length + parsed.croquis.length + parsed.avulsas.length;
  if (total === 0) return { erro: "Nenhuma peça no LPC" };

  const op = await prisma.oP.findUnique({ where: { numero: opNumero }, select: { id: true } });

  // Sobrescreve: apaga LPC anteriores (cascade remove ConjuntoCroqui) → tudo vira create
  await prisma.pecaConjunto.deleteMany({ where: { opNumero, fonte: "LPC_IMPORT" } });

  // Monta os registros com IDs gerados (pra ligar as relações depois)
  const idDe = new Map(); // marca → id
  const registros = [];
  const add = (marca, data) => {
    if (!marca || idDe.has(marca)) return; // unique (opNumero, marca)
    const id = randomUUID();
    idDe.set(marca, id);
    registros.push({ id, opId: op?.id || null, opNumero, marca, status: "PENDENTE", fonte: "LPC_IMPORT", ...data });
  };

  for (const c of parsed.conjuntos) add(c.marca, {
    descricao: c.descricao, qte: c.qte, pesoUnitKg: c.pesoUnitKg, pesoTotalKg: c.pesoTotalKg,
    tipoPeca: "CONJUNTO", areaPinturaM2: c.areaPinturaM2,
  });
  for (const cr of parsed.croquis) add(cr.marca, {
    descricao: cr.descricao, material: cr.material, perfil: cr.perfil, qte: cr.qte,
    comprimentoMm: cr.comprimentoMm, pesoUnitKg: cr.pesoUnitKg, pesoTotalKg: cr.pesoTotalKg,
    tipoPeca: "CROQUI", areaPinturaM2: cr.areaPinturaM2, statusPrep: "PENDENTE",
  });
  for (const a of parsed.avulsas) add(a.marca, {
    descricao: a.descricao, material: a.material, perfil: a.perfil, qte: a.qte,
    comprimentoMm: a.comprimentoMm, pesoUnitKg: a.pesoUnitKg, pesoTotalKg: a.pesoTotalKg,
  });

  await createManyChunked(prisma.pecaConjunto, registros);

  // Relações conjunto→croqui (bulk)
  const relData = [];
  const vistas = new Set();
  for (const rel of parsed.relacoes) {
    const conjuntoId = idDe.get(rel.conjuntoMarca);
    const croquiId   = idDe.get(rel.croquiMarca);
    if (!conjuntoId || !croquiId) continue;
    const k = `${conjuntoId}|${croquiId}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    relData.push({ id: randomUUID(), conjuntoId, croquiId, qtdNoConjunto: rel.qtdNoConjunto });
  }
  if (relData.length > 0) {
    await createManyChunked(prisma.conjuntoCroqui, relData);
  }

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId, action: "IMPORTAR_LPC_SHAREPOINT", entity: "PecaConjunto", entityId: opNumero,
        diff: {
          opNumero, obra: parsed.obra, cliente: parsed.cliente,
          conjuntos: parsed.conjuntos.length, croquis: parsed.croquis.length,
          avulsas: parsed.avulsas.length, relacoes: relData.length, pesoTotal: parsed.pesoTotal,
        },
      },
    }).catch(() => {});
  }

  return {
    opNumero, opEncontrada: !!op, obra: parsed.obra, cliente: parsed.cliente,
    conjuntos: parsed.conjuntos.length, croquis: parsed.croquis.length, avulsas: parsed.avulsas.length,
    relacoes: relData.length, pecas: registros.length, pesoTotal: parsed.pesoTotal,
  };
}
