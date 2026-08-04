// GET /api/qualidade/data-books/[id]/rastreabilidade
// Casa a LPC (PecaConjunto) com os certificados de material (§04) por OP, pra mostrar
// se cada material da obra tem certificado (rastreabilidade completa).
// Regra de OP: os DÍGITOS do código Tekla são o nº da OP — T67A/B/C/BT → 067.
// Casamento material × norma: normaliza ambos e procura o código do material (A36,
// A572, SAE 1020, USI CIVIL 350…) dentro da norma do certificado.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { montarSecaoLpc } from "@/lib/databook-lpc";

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

  // Reusa a MESMA lógica da §02 (casamento do certificado ESPECÍFICO por posição:
  // grau + forma + espessura/bitola). Resume a cobertura por material.
  const lpc = await montarSecaoLpc(book.opNumero);
  const porMat = new Map();
  let totalPos = 0, comCertPos = 0;
  for (const cj of lpc.conjuntos) {
    for (const pos of (cj.posicoes || [])) {
      totalPos++;
      const mat = pos.material || "—";
      const cur = porMat.get(mat) || { material: mat, pecas: 0, comCert: 0, certs: new Set() };
      cur.pecas++;
      if (pos.certificados?.length) {
        cur.comCert++; comCertPos++;
        for (const c of pos.certificados) cur.certs.add(c.indiceR || c.certificado || c.corrida);
      }
      porMat.set(mat, cur);
    }
  }
  const materiais = [...porMat.values()]
    .map((m) => ({ material: m.material, pecas: m.pecas, comCert: m.comCert, certificados: m.certs.size, temCertificado: m.comCert > 0 }))
    .sort((a, b) => (a.temCertificado === b.temCertificado ? b.pecas - a.pecas : a.temCertificado ? 1 : -1));

  return NextResponse.json({
    op,
    totalCertificados: lpc.totalCertificados,
    materiais,
    totalMateriais: materiais.length,
    comCertificado: materiais.filter((m) => m.temCertificado).length,
    totalPosicoes: totalPos,
    comCertificadoPosicoes: comCertPos,
  });
}
