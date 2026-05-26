import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// GET /api/admin/assistente — lê a config atual (cria default se não existe)
export async function GET() {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let config = await prisma.configAssistente.findFirst();
  if (!config) {
    config = await prisma.configAssistente.create({ data: {} });
  }
  return NextResponse.json(config);
}

const schema = z.object({
  ativo:              z.boolean().optional(),
  modulosHabilitados: z.array(z.string()).optional(),
  modelo:             z.string().optional(),
  instrucaoExtra:     z.string().nullable().optional(),
});

// PATCH /api/admin/assistente — atualiza a config
export async function PATCH(req) {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || e.message }, { status: 400 }); }

  // Upsert: cria se não existe, atualiza se existe
  let config = await prisma.configAssistente.findFirst();
  if (!config) {
    config = await prisma.configAssistente.create({ data: { ...body } });
  } else {
    config = await prisma.configAssistente.update({
      where: { id: config.id },
      data: body,
    });
  }
  return NextResponse.json(config);
}
