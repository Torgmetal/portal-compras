// GRD — Controle de liberação de desenhos (guia de remessa de documentos).
// GET                → todas as OPs que já tiveram desenho emitido/impresso, com o resumo.
// GET ?opNumero=097  → as liberações daquela OP + a cobertura de rastreabilidade das peças.
//
// A GRD nasce quando o desenho é IMPRESSO (emitir/abrir não é liberação) e a reimpressão soma
// no contador da mesma linha. Cada linha guarda o SNAPSHOT do R que estava carimbado no papel
// — é isso que prova o que foi pro chão de fábrica, mesmo que o CMR mude depois. (Vitor 19/08.)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rastreioDaOp } from "@/lib/rastreio-peca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO", "QUALIDADE", "COMERCIAL"];

// O R que estava carimbado: a GRD guarda o array do rastreioDoConjunto (1 linha = peça;
// N = croquis do conjunto). Resume pra caber numa coluna.
function resumoRastreio(rastreio) {
  const itens = Array.isArray(rastreio) ? rastreio : [];
  if (!itens.length) return { rs: [], comR: 0, total: 0, texto: "—" };
  const rs = [...new Set(itens.flatMap((i) => (i.usadas || []).map((u) => u.rastreio)).filter(Boolean))];
  const comR = itens.filter((i) => i.situacao === "R_DEFINIDO").length;
  const texto = !rs.length
    ? "sem R no papel"
    : itens.length === 1
      ? `R ${rs[0]}`
      : `${comR}/${itens.length} com R · ${rs.slice(0, 3).map((r) => `R ${r}`).join(" · ")}${rs.length > 3 ? " …" : ""}`;
  return { rs, comR, total: itens.length, texto };
}

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const opNumero = new URL(req.url).searchParams.get("opNumero");

  // ── Detalhe de UMA OP ────────────────────────────────────────────────────────────────────
  if (opNumero) {
    const num = String(opNumero).replace(/\D/g, "").padStart(3, "0");
    const op = await prisma.oP.findFirst({ where: { numero: num }, select: { id: true, numero: true, obra: true, cliente: true } });
    const linhas = await prisma.grdLiberacao.findMany({
      where: { opNumero: num },
      orderBy: [{ ultimaImpressaoEm: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, marca: true, arquivo: true, formato: true, setor: true, rastreio: true,
        impressoes: true, ultimaImpressaoEm: true, createdAt: true,
        liberadoPorNome: true, impressoItemId: true, impressoUrl: true, documentoId: true,
      },
    });
    // Cobertura de rastreabilidade das PEÇAS da OP (o quadro geral, além do que já foi impresso).
    let cobertura = null;
    try { if (op?.id) cobertura = (await rastreioDaOp(op.numero, op.id)).resumo; } catch {}

    return NextResponse.json({
      op: op ? { numero: op.numero, obra: op.obra, cliente: op.cliente } : { numero: num },
      cobertura,
      linhas: linhas.map((l) => ({ ...l, resumoR: resumoRastreio(l.rastreio), rastreio: undefined })),
    });
  }

  // ── Lista das OPs ────────────────────────────────────────────────────────────────────────
  const grds = await prisma.grdLiberacao.findMany({
    select: { opNumero: true, marca: true, impressoes: true, ultimaImpressaoEm: true, createdAt: true, documentoId: true, impressoItemId: true, setor: true },
  });
  const porOp = new Map();
  for (const g of grds) {
    const o = porOp.get(g.opNumero) || { opNumero: g.opNumero, grds: 0, impressoes: 0, marcas: new Set(), setores: new Set(), noDataBook: 0, carimbados: 0, ultimaEm: null };
    o.grds++;
    o.impressoes += g.impressoes || 1;
    o.marcas.add(g.marca);
    if (g.setor) o.setores.add(g.setor);
    if (g.documentoId) o.noDataBook++;
    if (g.impressoItemId) o.carimbados++;
    const q = g.ultimaImpressaoEm || g.createdAt;
    if (q && (!o.ultimaEm || q > o.ultimaEm)) o.ultimaEm = q;
    porOp.set(g.opNumero, o);
  }
  const nums = [...porOp.keys()];
  const ops = nums.length
    ? await prisma.oP.findMany({ where: { numero: { in: nums } }, select: { numero: true, obra: true, cliente: true, status: true } })
    : [];
  const info = new Map(ops.map((o) => [o.numero, o]));
  // Total de marcas da OP (denominador da cobertura de emissão: quantas já foram pro papel).
  const totMarcas = nums.length
    ? await prisma.pecaConjunto.groupBy({ by: ["opNumero"], where: { opNumero: { in: nums } }, _count: { _all: true } })
    : [];
  const totPorOp = new Map(totMarcas.map((t) => [t.opNumero, t._count._all]));

  const lista = [...porOp.values()]
    .map((o) => ({
      opNumero: o.opNumero,
      obra: info.get(o.opNumero)?.obra || null,
      cliente: info.get(o.opNumero)?.cliente || null,
      status: info.get(o.opNumero)?.status || null,
      grds: o.grds, impressoes: o.impressoes,
      marcas: o.marcas.size, marcasNaOp: totPorOp.get(o.opNumero) || null,
      setores: [...o.setores].sort(),
      noDataBook: o.noDataBook, carimbados: o.carimbados,
      ultimaEm: o.ultimaEm ? o.ultimaEm.toISOString() : null,
    }))
    .sort((a, b) => String(b.ultimaEm || "").localeCompare(String(a.ultimaEm || "")));

  return NextResponse.json({
    ops: lista,
    totais: {
      ops: lista.length,
      grds: lista.reduce((a, x) => a + x.grds, 0),
      impressoes: lista.reduce((a, x) => a + x.impressoes, 0),
      noDataBook: lista.reduce((a, x) => a + x.noDataBook, 0),
    },
  });
}
