// GET /api/qualidade/rnc/[id]/peso-marca — tenta estimar o peso de retrabalho a partir
// das marcas registradas na RNC (campo Desenho/Projeto/Marca), buscando cada peça na
// PecaConjunto (peso unitário). É só uma SUGESTÃO — a marca costuma vir em texto livre e
// nem toda peça casa no cadastro; o usuário confirma/edita o valor.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "QUALIDADE", "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const rnc = await prisma.naoConformidade.findUnique({
    where: { id: params.id }, select: { desenhoProjetoMarca: true, opNumero: true },
  });
  if (!rnc) return NextResponse.json({ error: "RNC não encontrada" }, { status: 404 });

  // Marcas em texto livre: separa por espaço, vírgula, ponto-e-vírgula ou barra.
  const tokens = [...new Set((rnc.desenhoProjetoMarca || "").split(/[\s,;/]+/).map((t) => t.trim()).filter(Boolean))];
  if (!tokens.length) return NextResponse.json({ pesoKg: null, encontradas: [], naoEncontradas: [], aviso: "RNC sem marca preenchida." });

  const op = (rnc.opNumero || "").trim();
  const encontradas = [], naoEncontradas = [];
  let pesoKg = 0;
  for (const marca of tokens) {
    // 1ª tentativa com a OP (mais precisa); se não achar, tenta só pela marca.
    let p = op
      ? await prisma.pecaConjunto.findFirst({ where: { marca: { equals: marca, mode: "insensitive" }, opNumero: { contains: op, mode: "insensitive" } }, select: { pesoUnitKg: true, opNumero: true } })
      : null;
    if (!p) p = await prisma.pecaConjunto.findFirst({ where: { marca: { equals: marca, mode: "insensitive" } }, select: { pesoUnitKg: true, opNumero: true } });
    if (p && p.pesoUnitKg != null) { pesoKg += p.pesoUnitKg; encontradas.push({ marca, pesoUnitKg: p.pesoUnitKg }); }
    else naoEncontradas.push(marca);
  }

  return NextResponse.json({
    pesoKg: encontradas.length ? Math.round(pesoKg * 100) / 100 : null,
    encontradas, naoEncontradas,
    aviso: naoEncontradas.length ? `${naoEncontradas.length} marca(s) não localizada(s) no cadastro — confira/complete o peso manualmente.` : null,
  });
}
