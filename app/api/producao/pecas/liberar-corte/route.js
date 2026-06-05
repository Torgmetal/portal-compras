// POST /api/producao/pecas/liberar-corte
// Libera pecas para corte (muda status PENDENTE → CORTE)
// Body: { ids: string[] } ou { ids: string[], reverter: true } para voltar CORTE → PENDENTE
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const MAQUINAS_VALIDAS = ["LASER_CHAPA", "LASER_PERFIL", "LASER_TUBO", "LASER_CANTONEIRA"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  reverter: z.boolean().optional(),
  maquina: z.enum(MAQUINAS_VALIDAS).optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO"]);
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

    const { ids, reverter } = body;

    const statusDe = reverter ? "CORTE" : "PENDENTE";
    const statusPara = reverter ? "PENDENTE" : "CORTE";

    const result = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: statusDe },
      data: { status: statusPara },
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: reverter ? "REVERTER_LIBERACAO_CORTE" : "LIBERAR_CORTE",
          entity: "PecaConjunto",
          entityId: ids.length === 1 ? ids[0] : `${ids.length} pecas`,
          diff: {
            ids,
            de: statusDe,
            para: statusPara,
            atualizados: result.count,
            maquina: body.maquina || null,
          },
        },
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      atualizados: result.count,
      acao: reverter ? "REVERTIDO" : "LIBERADO",
    });
  } catch (e) {
    console.error("[liberar-corte] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
