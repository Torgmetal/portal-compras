// GET /api/notificacoes — lista notificacoes (com filtros opcionais).
// PATCH /api/notificacoes — marca em lote (ex: marcar todas como lidas).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo"); // RM_CRIADA | COTACAO_RESPONDIDA | null=todos
  const lidas = searchParams.get("lidas"); // "true" | "false" | null=todas
  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);

  const where = {};
  if (tipo) where.tipo = tipo;
  if (lidas === "true") where.lida = true;
  else if (lidas === "false") where.lida = false;

  const [itens, naoLidas] = await Promise.all([
    prisma.notificacao.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        origemUser: { select: { name: true, email: true } },
      },
    }),
    prisma.notificacao.count({ where: { lida: false } }),
  ]);

  return NextResponse.json({ itens, naoLidas });
}

const patchSchema = z.object({
  marcarTodasComoLidas: z.boolean().optional(),
});

export async function PATCH(req) {
  try {
    await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  if (body.marcarTodasComoLidas) {
    const r = await prisma.notificacao.updateMany({
      where: { lida: false },
      data: { lida: true, lidaEm: new Date() },
    });
    return NextResponse.json({ ok: true, marcadas: r.count });
  }

  return NextResponse.json({ error: "Nenhuma acao." }, { status: 400 });
}
