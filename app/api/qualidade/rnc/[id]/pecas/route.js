// GET /api/qualidade/rnc/[id]/pecas?q=  → as marcas da LISTA DE EXPEDIÇÃO da obra da RNC
//
// Vitor (27/08/2026): "com base na lista LE trazer as marcas e deixar selecionar as peças e trazer
// as informações dela e o peso, assim como deixar eu selecionar a quantidade".
//
// ⚠⚠ A LE, NÃO A LPC. Quem embarca é o CONJUNTO — a LE é a lista do que existe como peça inteira na
// obra, e é nela que a marca da RNC aparece. A LPC desce ao croqui, e um retrabalho registrado no
// croqui contaria peso que já está dentro do conjunto.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE", "PRODUCAO", "PCP", "ENGENHARIA"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const rnc = await prisma.naoConformidade.findUnique({
    where: { id }, select: { opId: true, opNumero: true },
  });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });

  const num = String(rnc.opNumero || "").replace(/\D/g, "");
  const op = rnc.opId
    ? await prisma.oP.findUnique({ where: { id: rnc.opId }, select: { id: true, numero: true, obra: true } })
    : num ? await prisma.oP.findFirst({ where: { numero: num.padStart(3, "0") }, select: { id: true, numero: true, obra: true } }) : null;
  if (!op) {
    return NextResponse.json({ error: "Esta RNC não está ligada a uma OP — informe a OP para escolher as peças.", pecas: [] }, { status: 404 });
  }

  const q = String(new URL(req.url).searchParams.get("q") || "").trim();
  const pecas = await prisma.pecaConjunto.findMany({
    where: {
      opId: op.id, fonte: "LE_IMPORT",
      ...(q ? { OR: [{ marca: { contains: q, mode: "insensitive" } }, { descricao: { contains: q, mode: "insensitive" } }] } : {}),
    },
    select: { id: true, marca: true, descricao: true, perfil: true, material: true, qte: true, pesoUnitKg: true, pesoTotalKg: true },
    orderBy: [{ marca: "asc" }],
    take: 800,
  });

  // ⚠ a MESMA MARCA aparece em mais de uma linha da lista (sub-obras, lotes). Para escolher, o que
  // interessa é a marca: quantidade disponível somada e o peso unitário, que é o mesmo.
  const porMarca = new Map();
  for (const p of pecas) {
    const k = String(p.marca || "").trim().toUpperCase();
    if (!k) continue;
    const a = porMarca.get(k) || {
      marca: p.marca, descricao: p.descricao || null, perfil: p.perfil || null,
      material: p.material || null, pesoUnitKg: p.pesoUnitKg ?? null, qteTotal: 0,
    };
    a.qteTotal += p.qte || 0;
    if (a.pesoUnitKg == null && p.pesoUnitKg != null) a.pesoUnitKg = p.pesoUnitKg;
    if (!a.descricao && p.descricao) a.descricao = p.descricao;
    if (!a.perfil && p.perfil) a.perfil = p.perfil;
    if (!a.material && p.material) a.material = p.material;
    porMarca.set(k, a);
  }

  return NextResponse.json({
    op: { id: op.id, numero: op.numero, obra: op.obra },
    total: porMarca.size,
    pecas: [...porMarca.values()],
  });
}
