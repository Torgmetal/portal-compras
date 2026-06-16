// GET /api/qualidade/data-books/[id]/rastreabilidade
// Casa a LPC (PecaConjunto) com os certificados de material (§04) por OP, pra mostrar
// se cada material da obra tem certificado (rastreabilidade completa).
// Regra de OP: os DÍGITOS do código Tekla são o nº da OP — T67A/B/C/BT → 067.
// Casamento material × norma: normaliza ambos e procura o código do material (A36,
// A572, SAE 1020, USI CIVIL 350…) dentro da norma do certificado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const norm = (s) => String(s || "").toUpperCase().normalize("NFD").replace(/[^A-Z0-9]/g, "");
const extractOP = (t) => (String(t).match(/\d+/)?.[0] || "").padStart(3, "0");
function specsDoMaterial(mat) {
  const n = norm(mat);
  const out = [];
  const a = n.match(/A\d{2,4}/g); if (a) out.push(...a);       // A36, A572, A1011…
  const sae = n.match(/SAE(\d+)/); if (sae) out.push("SAE" + sae[1], sae[1]); // SAE1020, 1020
  const civil = n.match(/CIVIL(\d+)/); if (civil) out.push("CIVIL" + civil[1]); // USI CIVIL 350
  if (n.includes("XADREZ")) out.push("A36");                   // chapa xadrez = A36
  if (!out.length) out.push(n);
  return [...new Set(out)];
}

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const book = await prisma.dataBookQualidade.findUnique({ where: { id: params.id }, select: { opNumero: true } });
  if (!book) return NextResponse.json({ error: "Data book não encontrado" }, { status: 404 });
  const op = extractOP(book.opNumero);

  // Obras da LPC dessa OP (regra dos dígitos)
  const allObras = (await prisma.pecaConjunto.findMany({ distinct: ["opNumero"], select: { opNumero: true } })).map((o) => o.opNumero).filter(Boolean);
  const obras = allObras.filter((o) => extractOP(o) === op);

  const mats = obras.length
    ? await prisma.pecaConjunto.groupBy({ by: ["material"], where: { opNumero: { in: obras } }, _count: { _all: true } })
    : [];
  const certs = await prisma.documentoQualidade.findMany({ where: { categoria: "MATERIAL", ativo: true, opNumero: op }, select: { norma: true } });
  const certNorms = certs.map((c) => norm(c.norma)).filter(Boolean);

  const materiais = mats
    .filter((m) => m.material)
    .map((m) => {
      const sp = specsDoMaterial(m.material);
      const n = certNorms.filter((cn) => sp.some((s) => cn.includes(s))).length;
      return { material: m.material, pecas: m._count._all, temCertificado: n > 0, certificados: n };
    })
    .sort((a, b) => (a.temCertificado === b.temCertificado ? b.pecas - a.pecas : a.temCertificado ? 1 : -1));

  return NextResponse.json({
    op,
    obras,
    totalCertificados: certs.length,
    materiais,
    totalMateriais: materiais.length,
    comCertificado: materiais.filter((m) => m.temCertificado).length,
  });
}
