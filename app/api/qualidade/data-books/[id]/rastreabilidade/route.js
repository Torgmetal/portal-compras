// GET /api/qualidade/data-books/[id]/rastreabilidade
// Casa a LPC (PecaConjunto) com os certificados de material (§04) por OP, pra mostrar
// se cada material da obra tem certificado (rastreabilidade completa).
// Regra de OP: os DÍGITOS do código Tekla são o nº da OP — T67A/B/C/BT → 067.
// Casamento material × norma: normaliza ambos e procura o código do material (A36,
// A572, SAE 1020, USI CIVIL 350…) dentro da norma do certificado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { specsDoMaterial, gradesDoTexto } from "@/lib/databook-lpc";

export const runtime = "nodejs";

const extractOP = (t) => (String(t).match(/\d+/)?.[0] || "").padStart(3, "0");

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
  const certs = await prisma.documentoQualidade.findMany({ where: { categoria: "MATERIAL", ativo: true, opNumero: op }, select: { norma: true, nome: true, numeroCorrida: true, numeroDocumento: true } });
  // grau casado por norma + DESCRIÇÃO (o grau real costuma estar no nome, não na norma:
  // A-36 vem sob A1018/TUB300…); ignora cert sem corrida E sem nº (registro incompleto).
  const certGrades = certs.filter((c) => c.numeroCorrida || c.numeroDocumento).map((c) => gradesDoTexto(`${c.norma || ""} ${c.nome || ""}`));

  const materiais = mats
    .filter((m) => m.material)
    .map((m) => {
      const sp = specsDoMaterial(m.material);
      const n = certGrades.filter((g) => sp.some((s) => g.has(s))).length;
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
