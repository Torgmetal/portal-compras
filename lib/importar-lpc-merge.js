// Importação de uma REVISÃO de LPC preservando o progresso de produção.
// Regra (decisão do Vitor): mesclar por marca —
//   • ADICIONA marcas novas (PENDENTE);
//   • REMOVE marcas que saíram da revisão, SÓ se ainda não entraram em produção;
//   • MANTÉM as que continuam, preservando status/máquina/programação/baixa;
//   • CONFLITO: marca removida ou com qtd alterada que JÁ passou por algum setor
//     não é tocada — é sinalizada para o usuário decidir.
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { computarDiffLpc, marcasDoParsed } from "@/lib/lpc-diff";

// Resolve a OP cadastrada a partir da obra do LPC. A obra é a SUBLISTA
// ("T82A", "T60B") e a OP no portal usa o número zero-padded ("082").
// Tenta: exato → só os dígitos → 3 dígitos → "T"+dígitos.
export async function resolverOpDaObra(obra) {
  const tentativas = new Set([String(obra)]);
  const digitos = (String(obra).match(/\d+/) || [])[0];
  if (digitos) {
    tentativas.add(digitos);
    tentativas.add(digitos.padStart(3, "0"));
    tentativas.add("T" + digitos);
  }
  return prisma.oP.findFirst({ where: { numero: { in: [...tentativas] } }, select: { id: true, numero: true } });
}

/**
 * Aplica a revisão da LPC à OP (merge preservando progresso) e registra a revisão.
 * @returns resumo com o diff aplicado + conflitos a decidir.
 */
export async function importarLpcMerge(parsed, { userId = null, revisao = null, arquivo = null } = {}) {
  const opNumero = parsed.opNumero;
  if (!opNumero) return { erro: "OP não detectada no LPC" };
  const novas = marcasDoParsed(parsed);
  if (novas.size === 0) return { erro: "Nenhuma peça no LPC" };

  const op = await resolverOpDaObra(opNumero); // amarra a sublista (T82A) à OP cadastrada (082)
  const existentes = await prisma.pecaConjunto.findMany({
    where: { opNumero, fonte: "LPC_IMPORT" },
    select: { id: true, marca: true, status: true, qte: true, qteProduzida: true, pesoTotalKg: true },
  });

  const diff = computarDiffLpc(existentes, novas);

  await prisma.$transaction(async (tx) => {
    // 1) REMOVER (cascade remove ConjuntoCroqui dessas peças)
    if (diff.remover.length > 0) {
      await tx.pecaConjunto.deleteMany({ where: { opNumero, fonte: "LPC_IMPORT", marca: { in: diff.remover } } });
    }
    // 2) ATUALIZAR dados das que continuam (preserva status/máquina/programação)
    for (const marca of diff.atualizar) {
      const d = novas.get(marca);
      await tx.pecaConjunto.updateMany({
        where: { opNumero, fonte: "LPC_IMPORT", marca },
        data: {
          descricao: d.descricao ?? undefined, material: d.material ?? undefined, perfil: d.perfil ?? undefined,
          qte: d.qte, comprimentoMm: d.comprimentoMm ?? undefined,
          pesoUnitKg: d.pesoUnitKg ?? undefined, pesoTotalKg: d.pesoTotalKg ?? undefined,
          areaPinturaM2: d.areaPinturaM2 ?? undefined,
          // null (não undefined) p/ uma reclassificação CONJUNTO/CROQUI→AVULSA limpar o tipo
          tipoPeca: d.tipo === "AVULSA" ? null : d.tipo,
        },
      });
    }
    // 3) ADICIONAR as novas (PENDENTE)
    const novosRegistros = diff.adicionar.map((marca) => {
      const d = novas.get(marca);
      return {
        id: randomUUID(), opId: op?.id || null, opNumero, marca, status: "PENDENTE", fonte: "LPC_IMPORT",
        descricao: d.descricao || null, material: d.material || null, perfil: d.perfil || null,
        qte: d.qte, comprimentoMm: d.comprimentoMm || null, pesoUnitKg: d.pesoUnitKg || 0, pesoTotalKg: d.pesoTotalKg || 0,
        areaPinturaM2: d.areaPinturaM2 || null,
        tipoPeca: d.tipo === "AVULSA" ? null : d.tipo,
        ...(d.tipo === "CROQUI" ? { statusPrep: "PENDENTE" } : {}),
      };
    });
    for (let i = 0; i < novosRegistros.length; i += 100) {
      await tx.pecaConjunto.createMany({ data: novosRegistros.slice(i, i + 100), skipDuplicates: true });
    }

    // 3b) Amarra TODAS as peças desta obra à OP cadastrada (rastreabilidade
    // ponta a ponta) — backfilla as que ficaram sem opId em imports anteriores.
    if (op?.id) {
      await tx.pecaConjunto.updateMany({
        where: { opNumero, fonte: "LPC_IMPORT", opId: null },
        data: { opId: op.id },
      });
    }

    // 4) Reconstrói as relações conjunto→croqui da OP a partir da nova revisão
    const dbPieces = await tx.pecaConjunto.findMany({ where: { opNumero }, select: { id: true, marca: true } });
    const idReal = new Map(dbPieces.map((p) => [p.marca, p.id]));
    const pieceIds = dbPieces.map((p) => p.id);
    if (pieceIds.length > 0) {
      await tx.conjuntoCroqui.deleteMany({ where: { OR: [{ conjuntoId: { in: pieceIds } }, { croquiId: { in: pieceIds } }] } });
    }
    const relData = [];
    const vistas = new Set();
    for (const rel of parsed.relacoes || []) {
      const conjuntoId = idReal.get(rel.conjuntoMarca);
      const croquiId = idReal.get(rel.croquiMarca);
      if (!conjuntoId || !croquiId) continue;
      const k = `${conjuntoId}|${croquiId}`;
      if (vistas.has(k)) continue;
      vistas.add(k);
      relData.push({ id: randomUUID(), conjuntoId, croquiId, qtdNoConjunto: rel.qtdNoConjunto });
    }
    for (let i = 0; i < relData.length; i += 100) {
      await tx.conjuntoCroqui.createMany({ data: relData.slice(i, i + 100), skipDuplicates: true });
    }

    // 5) Registra/atualiza a revisão carregada da OP
    if (revisao != null) {
      await tx.lpcRevisao.upsert({
        where: { opNumero },
        create: { opNumero, revisao, arquivo, itens: novas.size, importadoPorId: userId },
        update: { revisao, arquivo, itens: novas.size, importadoEm: new Date(), importadoPorId: userId },
      });
    }
  }, { maxWait: 15000, timeout: 60000 }); // OPs grandes: folga p/ o lote de updates

  if (userId) {
    await prisma.auditLog.create({
      data: {
        userId, action: "IMPORTAR_LPC_REVISAO", entity: "PecaConjunto", entityId: opNumero,
        diff: {
          opNumero, revisao, arquivo,
          adicionadas: diff.adicionar.length, removidas: diff.remover.length,
          mantidas: diff.atualizar.length, conflitos: diff.conflitos.length,
        },
      },
    }).catch(() => {});
  }

  return {
    opNumero, opEncontrada: !!op, opCadastrada: op?.numero || null,
    obra: parsed.obra, cliente: parsed.cliente, revisao,
    adicionadas: diff.adicionar, removidas: diff.remover,
    mantidas: diff.atualizar.length, conflitos: diff.conflitos,
    totalNovo: novas.size,
  };
}
