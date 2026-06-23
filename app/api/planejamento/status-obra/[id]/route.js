// GET /api/planejamento/status-obra/[id] — detalhe de uma lista (com as marcas)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "ENGENHARIA", "EXPEDICAO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const lista = await prisma.listaExpedicao.findUnique({ where: { id: params.id } });
  if (!lista) return NextResponse.json({ error: "Lista não encontrada" }, { status: 404 });

  // Cruza cada marca com a produção (onde a peça está na fábrica)
  const marcas = Array.isArray(lista.marcasJson) ? lista.marcasJson : [];
  const norm = (m) => String(m || "").trim().toUpperCase();
  const pecaPorMarca = new Map();
  if (lista.opId) {
    const pecas = await prisma.pecaConjunto.findMany({
      where: { opId: lista.opId },
      select: { marca: true, status: true, ultimoSetor: true },
    });
    for (const p of pecas) if (p.marca) pecaPorMarca.set(norm(p.marca), p);
  }
  const marcasJson = marcas.map((m) => {
    const peca = pecaPorMarca.get(norm(m.marca));
    const local = peca ? (peca.status || "SEM_STATUS") : (lista.opId ? "SEM_REGISTRO" : "SEM_OP");
    return { ...m, local };
  });

  // Resumo dos FALTANTES (não expedidos) por local na fábrica + furos
  const faltantes = marcasJson.filter((m) => !m.expedidoArquivo);
  const resumoMap = {};
  for (const m of faltantes) {
    const k = m.local;
    (resumoMap[k] ||= { local: k, marcas: 0, peso: 0 });
    resumoMap[k].marcas++; resumoMap[k].peso += m.pesoTotal || 0;
  }
  const producao = {
    temOpId: !!lista.opId,
    resumoLocal: Object.values(resumoMap).sort((a, b) => b.peso - a.peso),
    totalFaltantes: faltantes.length,
    pesoFaltante: faltantes.reduce((s, m) => s + (m.pesoTotal || 0), 0),
    furos: {
      semRegistro: faltantes.filter((m) => m.local === "SEM_REGISTRO").length,
      divergente: faltantes.filter((m) => m.local === "EXPEDIDO").length, // produção diz expedido, lista diz faltante
    },
  };

  return NextResponse.json({ lista: { ...lista, marcasJson }, producao });
}
