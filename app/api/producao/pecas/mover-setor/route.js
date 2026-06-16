// POST /api/producao/pecas/mover-setor
// Move peças de um setor para o próximo (ou reverte para o anterior).
// Body: { ids: string[], de: string, para: string }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const PIPELINE = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

const SETOR_LABEL = {
  PENDENTE: "Pendente", CORTE: "Corte", MONTAGEM: "Montagem", SOLDA: "Solda",
  ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDIDO: "Expedição",
};

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  de: z.enum(PIPELINE, { message: "Status de origem inválido" }),
  para: z.enum(PIPELINE, { message: "Status de destino inválido" }),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
    let body;
    try {
      body = schema.parse(await req.json());
    } catch (e) {
      return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
    }

    const { ids, de, para } = body;

    // Validar que é um movimento válido (adjacente no pipeline ou reverter 1 posição)
    const idxDe = PIPELINE.indexOf(de);
    const idxPara = PIPELINE.indexOf(para);
    const diff = idxPara - idxDe;
    if (diff !== 1 && diff !== -1) {
      return NextResponse.json(
        { error: `Movimento inválido: ${SETOR_LABEL[de]} → ${SETOR_LABEL[para]}. Só é permitido avançar ou voltar 1 setor.` },
        { status: 400 }
      );
    }

    const result = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: de },
      data: {
        status: para,
        ultimoSetor: SETOR_LABEL[para] || para,
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: diff > 0 ? "AVANCAR_SETOR" : "REVERTER_SETOR",
          entity: "PecaConjunto",
          entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
          diff: {
            ids: ids.slice(0, 20),
            total: ids.length,
            de,
            para,
            atualizados: result.count,
          },
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      atualizados: result.count,
      de,
      para,
    });
  } catch (e) {
    console.error("[mover-setor] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
