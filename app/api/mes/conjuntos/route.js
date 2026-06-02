import { NextResponse } from "next/server";
import { prisma, waitMesTables } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// GET /api/mes/conjuntos?obra=T78A
//
// Cruza a estrutura LPC (conjunto→marca) com a produção do Syneco (MesOrdem)
// para responder: quais conjuntos PODEM MONTAR (≥1 un de cada marca pronta)
// e quais FALTAM marcas.
//
// Casamento:
//   conjunto/marca da LPC (PecaConjunto.marca) === MesOrdem.op
//   MesOrdem.obra é a base T<num> (ex: "T78"); o op carrega a sub-obra (T78A-...)

export async function GET(req) {
  await waitMesTables();
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const { searchParams } = new URL(req.url);
  const obra = (searchParams.get("obra") || "").trim();
  if (!obra) return NextResponse.json({ error: "obra obrigatória" }, { status: 400 });

  const opNumero = obra.toUpperCase();              // "T78A" (chave da LPC)
  const baseObra = (opNumero.match(/^(T\d+)/) || [])[1] || opNumero; // "T78"

  // 1. Conjuntos da OP + suas marcas (via ConjuntoCroqui)
  // startsWith: obra "T78" agrega sub-obras T78A, T78B…; "T78A" pega só ela.
  const conjuntos = await prisma.pecaConjunto.findMany({
    where: { opNumero: { startsWith: opNumero }, tipoPeca: "CONJUNTO" },
    select: {
      id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true,
      conjuntoCroquis: {
        select: { qtdNoConjunto: true, croqui: { select: { marca: true, descricao: true, perfil: true } } },
      },
    },
    orderBy: { marca: "asc" },
  });

  if (conjuntos.length === 0) {
    return NextResponse.json({
      obra: opNumero, total: 0, conjuntos: [],
      aviso: "Nenhum conjunto importado da LPC para esta OP (importe via SharePoint).",
    });
  }

  // 2. Todas as marcas (croquis) referenciadas
  const todasMarcas = [...new Set(
    conjuntos.flatMap(c => c.conjuntoCroquis.map(r => r.croqui.marca))
  )];

  // 3. Produção no Syneco: produzido por marca (op) na obra base
  const prodRows = todasMarcas.length === 0 ? [] : await prisma.mesOrdem.groupBy({
    by: ["op"],
    where: { obra: { startsWith: baseObra, mode: "insensitive" }, op: { in: todasMarcas } },
    _max: { produzidoUn: true },
  });
  const produzidoDe = new Map(prodRows.map(r => [r.op, r._max.produzidoUn || 0]));
  // marca "pronta" = pelo menos 1 unidade produzida
  const estaPronta = (marca) => (produzidoDe.get(marca) || 0) >= 1;
  // marca "conhecida no Syneco" = aparece no MesOrdem (mesmo com 0 produzido)
  const noSyneco = new Set(prodRows.map(r => r.op));

  // 4. Avalia cada conjunto
  const result = conjuntos.map(c => {
    const marcas = c.conjuntoCroquis.map(r => ({
      marca: r.croqui.marca,
      descricao: r.croqui.descricao || r.croqui.perfil || null,
      qtdNoConjunto: r.qtdNoConjunto,
      pronta: estaPronta(r.croqui.marca),
      noSyneco: noSyneco.has(r.croqui.marca),
    }));
    const totalMarcas  = marcas.length;
    const prontas      = marcas.filter(m => m.pronta).length;
    const faltantes    = marcas.filter(m => !m.pronta);
    const montavel     = totalMarcas > 0 && faltantes.length === 0;

    return {
      id: c.id, marca: c.marca, descricao: c.descricao, qte: c.qte, pesoTotalKg: c.pesoTotalKg,
      totalMarcas, marcasProntas: prontas,
      montavel,
      faltam: faltantes.length,
      marcasFaltantes: faltantes.map(m => ({ marca: m.marca, descricao: m.descricao, qtd: m.qtdNoConjunto, noSyneco: m.noSyneco })),
    };
  });

  const contagens = {
    total: result.length,
    montaveis: result.filter(c => c.montavel).length,
    parciais: result.filter(c => !c.montavel && c.marcasProntas > 0).length,
    semInicio: result.filter(c => c.marcasProntas === 0).length,
  };

  return NextResponse.json({
    obra: opNumero,
    baseObra,
    marcasComProducao: produzidoDe.size,
    totalMarcas: todasMarcas.length,
    contagens,
    conjuntos: result,
  });
}
