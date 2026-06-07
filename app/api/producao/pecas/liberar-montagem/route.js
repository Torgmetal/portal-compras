// POST /api/producao/pecas/liberar-montagem
// Libera conjuntos para montagem (muda status CORTE → MONTAGEM)
// Body: { ids: string[] } ou { ids: string[], reverter: true } para voltar MONTAGEM → CORTE
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos um conjunto"),
  reverter: z.boolean().optional(),
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

    const statusDe = reverter ? "MONTAGEM" : "CORTE";
    const statusPara = reverter ? "CORTE" : "MONTAGEM";

    const result = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: statusDe },
      data: { status: statusPara, ultimoSetor: reverter ? "Corte" : "Montagem" },
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: reverter ? "REVERTER_MONTAGEM" : "LIBERAR_MONTAGEM",
          entity: "PecaConjunto",
          entityId: ids.length === 1 ? ids[0] : `${ids.length} conjuntos`,
          diff: {
            ids: ids.slice(0, 20),
            total: ids.length,
            de: statusDe,
            para: statusPara,
            atualizados: result.count,
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
    console.error("[liberar-montagem] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
