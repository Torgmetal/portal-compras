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

  // Onde a peça está na fábrica: setor REAL derivado do Syneco ao vivo (setor mais
  // avançado com apontamento) — o status armazenado fica só como fallback.
  const marcas = Array.isArray(lista.marcasJson) ? lista.marcasJson : [];
  const norm = (m) => String(m || "").trim().toUpperCase();
  const SYN_SETOR = { "Corte": "CORTE", "Montagem": "MONTAGEM", "Solda": "SOLDA", "Acabamento": "ACABAMENTO", "Jato": "JATO", "Pintura": "PINTURA" };
  const ORDEM = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
  const pecaPorMarca = new Map();
  const synPorMarca = new Map();
  if (lista.opId) {
    const pecas = await prisma.pecaConjunto.findMany({ where: { opId: lista.opId }, select: { marca: true, status: true } });
    for (const p of pecas) if (p.marca) pecaPorMarca.set(norm(p.marca), p);
    const syn = await prisma.mesOrdem.groupBy({ by: ["item", "setor"], where: { opId: lista.opId, produzidoUn: { gt: 0 }, setor: { in: Object.keys(SYN_SETOR) } }, _sum: { produzidoUn: true } });
    for (const s of syn) {
      const st = SYN_SETOR[s.setor]; if (!st) continue;
      const k = norm(s.item);
      const cur = synPorMarca.get(k);
      if (cur === undefined || ORDEM.indexOf(st) > ORDEM.indexOf(cur)) synPorMarca.set(k, st);
    }
  }
  const marcasJson = marcas.map((m) => {
    const k = norm(m.marca);
    const peca = pecaPorMarca.get(k);
    let local;
    if (peca?.status === "EXPEDIDO") local = "EXPEDIDO";       // expedido é do portal (pós-pintura)
    else if (synPorMarca.has(k)) local = synPorMarca.get(k);   // setor real ao vivo do Syneco
    else if (peca) local = peca.status || "SEM_STATUS";        // fallback: status armazenado
    else local = lista.opId ? "SEM_REGISTRO" : "SEM_OP";
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
