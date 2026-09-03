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

  // Re-busca os IDs REAIS do banco (cobre marcas que já existiam de outra fonte,
  // que o createMany pulou — evita FK quebrada nas relações)
  //
  // ⚠⚠ A LINHA DA LPC GANHA DA LINHA DA LE. Vitor (03/09/2026): "sobre o importador você deve
  // conferir, pois não expedimos conjuntos, já disse".
  //
  // A busca é por `opNumero` sem a fonte de propósito (é o que cobre a marca que o createMany
  // pulou). Só que, nas OPs em que as duas listas gravam o MESMO `opNumero` (060, 089, 097, 103,
  // 104, 105…), a mesma marca volta DUAS vezes — e o `new Map` ficava com a ÚLTIMA. Quando a
  // última era a linha da LE, os croquis do conjunto eram amarrados NELA.
  //
  // O estrago não é cosmético: a linha da LE passava a parecer um conjunto montável com 1 a 5
  // croquis (contra 17 a 27 no registro certo). Como esses poucos estavam cortados, a montagem a
  // dava como "100% pronta" — medido na OP-105 em 03/09/2026, os 12 "prontos" eram todos assim, e
  // um lote deles chegou a descer para a bancada com as peças ainda na máquina de corte.
  //
  // ⚠ Ordenar não resolve sozinho (`fonte` é string e nada garante a ordem): o desempate é
  // explícito — só sobrescreve o que já está no mapa se a linha for de fabricação.
  const dbPieces = await prisma.pecaConjunto.findMany({
    where: { opNumero }, select: { id: true, marca: true, fonte: true },
  });
  const idReal = new Map();
  const daLpc = new Set(); // ids que são de FABRICAÇÃO — só eles podem receber croqui
  for (const p of dbPieces) {
    const ehLpc = p.fonte === "LPC_IMPORT";
    if (ehLpc) daLpc.add(p.id);
    if (!idReal.has(p.marca) || ehLpc) idReal.set(p.marca, p.id);
  }

  // Relações conjunto→croqui (bulk)
  //
  // ⚠⚠ CROQUI NÃO PENDURA EM LINHA DA LE. Vitor (03/09/2026): "não expedimos conjuntos, já disse".
  // Quando a marca do conjunto só existe pela LE (as duas listas dividem o `opNumero` nas OPs 060,
  // 089, 105 e 113, e a chave é `@@unique([opNumero, marca])` — cabe UMA linha), `idReal` devolvia
  // a linha da expedição e o croqui era amarrado nela. Era assim que nascia o "conjunto" da LE com
  // 1 a 5 sub-peças que a montagem lia como pronto.
  //
  // ⚠ PULA E CONTA, não inventa linha: criar a linha de fabricação aqui esbarraria na mesma chave
  // única. O que falta é a LPC dessas obras estar chaveada por FASE (T105A) em vez de por dígito —
  // é o conserto de dado, e o número volta no resumo para aparecer em vez de sumir.
  const relData = [];
  const vistas = new Set();
  let relacoesForaDaLpc = 0;
  for (const rel of parsed.relacoes) {
    const conjuntoId = idReal.get(rel.conjuntoMarca);
    const croquiId   = idReal.get(rel.croquiMarca);
    if (!conjuntoId || !croquiId) continue;
    if (!daLpc.has(conjuntoId)) { relacoesForaDaLpc++; continue; }
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
          relacoesForaDaLpc,
        },
      },
    }).catch(() => {});
  }

  return {
    opNumero, opEncontrada: !!op, obra: parsed.obra, cliente: parsed.cliente,
    conjuntos: parsed.conjuntos.length, croquis: parsed.croquis.length, avulsas: parsed.avulsas.length,
    relacoes: relData.length, pecas: registros.length, pesoTotal: parsed.pesoTotal,
    // ⚠ croquis que a LPC quis pendurar numa linha da LE — ver a nota nas relações
    relacoesForaDaLpc,
  };
}
