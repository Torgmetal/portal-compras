// Dispensa de OP na fila de prioridades — o contrário de `prioridade-op-manual`.
//
// POST { opNumero, motivo? } dispensa · DELETE ?opNumero= devolve pra fila.
//
// Vitor (19/08/2026): "essas OPs pode tirar o alerta por ora, vamos deixar apenas a OP-60
// aparecendo". A dispensa vale só pra fonte "programação" (o programador lançou no Syneco): OP
// fixada à mão ou enviada pra produção continua entrando de qualquer jeito — senão a dispensa
// viraria uma forma silenciosa de sumir com obra que o PCP precisa ver.
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const PERFIS = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];
const schema = z.object({
  opNumero: z.string().min(1).transform((x) => x.trim()),
  motivo: z.string().max(300).optional().nullable(),
});

export async function GET() {
  try { await requireRole(PERFIS); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  return NextResponse.json(
    await prisma.prioridadeTvOculta.findMany({ orderBy: { createdAt: "desc" } })
  );
}

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });

  const { opNumero, motivo } = parsed.data;
  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true } });

  const r = await prisma.prioridadeTvOculta.upsert({
    where: { opNumero },
    create: { opNumero, opId: op?.id || null, motivo: motivo || null, criadoPorId: user.id },
    update: { motivo: motivo || null, criadoPorId: user.id },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ocultar_op_prioridades", entity: "OP", entityId: op?.id || opNumero, diff: { opNumero, motivo: motivo || null } },
  });
  revalidatePath("/planejamento/prioridades");
  revalidatePath("/pcp/dashboard-prioridades");
  return NextResponse.json(r);
}

export async function DELETE(req) {
  let user;
  try { user = await requireRole(PERFIS); } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const opNumero = new URL(req.url).searchParams.get("opNumero");
  if (!opNumero) return NextResponse.json({ error: "opNumero obrigatório" }, { status: 400 });

  await prisma.prioridadeTvOculta.deleteMany({ where: { opNumero } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "reexibir_op_prioridades", entity: "OP", entityId: opNumero, diff: { opNumero } },
  });
  revalidatePath("/planejamento/prioridades");
  revalidatePath("/pcp/dashboard-prioridades");
  return NextResponse.json({ ok: true });
}
