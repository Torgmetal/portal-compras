// POST /api/producao/pecas/atribuir-maquina
// Define a máquina (laser) de várias peças de uma vez — sem liberar/mudar status.
// Body: { ids: string[], maquina: "LASER_CHAPA"|... |null }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const MAQUINAS_VALIDAS = ["LASER_CHAPA", "LASER_PERFIL", "LASER_TUBO", "LASER_CANTONEIRA"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  maquina: z.enum(MAQUINAS_VALIDAS).nullable(),
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
    data: { maquina: body.maquina },
  });

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "ATRIBUIR_MAQUINA_LOTE", entity: "PecaConjunto",
        entityId: body.ids.length === 1 ? body.ids[0] : `${body.ids.length} peças`,
        diff: { maquina: body.maquina, total: body.ids.length, atualizados: r.count },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados: r.count, maquina: body.maquina });
}
