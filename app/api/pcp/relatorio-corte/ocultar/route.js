// POST /api/pcp/relatorio-corte/ocultar  { obra: string, ocultar: boolean }
// Oculta/restaura uma obra do Relatório de Corte (ex.: OP já finalizada).
// Só muda a VISÃO do relatório — nenhum dado de corte é apagado. SOMENTE ADMIN.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  obra: z.string().min(1, "Obra obrigatória"),
  ocultar: z.boolean(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]); // só ADMIN pode tirar/restaurar OPs
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const { obra, ocultar } = body;

  try {
    if (ocultar) {
      await prisma.relatorioCorteObraOculta.upsert({
        where: { obra },
        update: { ocultadoPor: user.id, ocultadoNome: user.name || null },
        create: { obra, ocultadoPor: user.id, ocultadoNome: user.name || null },
      });
    } else {
      await prisma.relatorioCorteObraOculta.deleteMany({ where: { obra } });
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: ocultar ? "RELATORIO_CORTE_OCULTAR_OBRA" : "RELATORIO_CORTE_RESTAURAR_OBRA",
          entity: "RelatorioCorteObraOculta",
          entityId: obra,
          diff: { obra, ocultar },
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, obra, oculto: ocultar });
  } catch (e) {
    console.error("[relatorio-corte/ocultar] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
