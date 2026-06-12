// POST /api/producao/pecas/atribuir-prioridade
// Define a prioridade de várias peças de uma vez (null = limpa). Manual/opcional.
// Body: { ids: string[], prioridade: number|null }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  prioridade: z.number().int().min(1).nullable(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const r = await prisma.pecaConjunto.updateMany({
    where: { id: { in: body.ids } },
    data: { prioridade: body.prioridade },
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "ATRIBUIR_PRIORIDADE_LOTE", entity: "PecaConjunto",
        entityId: body.ids.length === 1 ? body.ids[0] : `${body.ids.length} peças`,
        diff: { prioridade: body.prioridade, total: body.ids.length, atualizados: r.count },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados: r.count, prioridade: body.prioridade });
}
