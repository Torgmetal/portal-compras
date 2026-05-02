import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({ motivo: z.string().min(1) });

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = schema.parse(await req.json());

  const ultimaRev = await prisma.revisao.findFirst({
    where: { opId: params.id },
    orderBy: { numero: "desc" },
  });
  const numero = (ultimaRev?.numero || 0) + 1;

  const rev = await prisma.revisao.create({
    data: {
      opId: params.id,
      numero,
      motivo: body.motivo,
      createdById: user.id,
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "create_revisao", entity: "Revisao", entityId: rev.id, diff: { numero, motivo: body.motivo } },
  });

  return NextResponse.json({ id: rev.id, numero });
}
