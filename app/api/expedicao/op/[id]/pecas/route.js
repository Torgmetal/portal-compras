// GET /api/expedicao/op/[id]/pecas
// Peças da OP (LPC — conjuntos + avulsas, sem croqui) pra montar o romaneio direto,
// quando a OP não tem carga do Planejamento nem Lista de Expedição importada.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req, { params }) {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "PLANEJAMENTO", "PCP", "PRODUCAO", "ENGENHARIA"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  // Conjuntos + avulsas (tipoPeca null), SEM croqui (detalhamento do conjunto). No
  // Prisma, `{ not: "CROQUI" }` descartaria as avulsas (null != 'CROQUI' é NULL no
  // SQL) — por isso OR explícito.
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opId: params.id, fonte: "LPC_IMPORT", OR: [{ tipoPeca: "CONJUNTO" }, { tipoPeca: null }] },
    select: { id: true, marca: true, descricao: true, qte: true, pesoUnitKg: true, pesoTotalKg: true },
    orderBy: { marca: "asc" },
  });

  return NextResponse.json({
    ok: true,
    pecas: pecas.map((p) => ({
      pecaConjuntoId: p.id,
      marca: p.marca,
      descricao: p.descricao,
      qte: p.qte,
      pesoUnit: p.pesoUnitKg ?? (p.qte ? (Number(p.pesoTotalKg) || 0) / p.qte : null),
      pesoTotal: p.pesoTotalKg,
    })),
  });
}
