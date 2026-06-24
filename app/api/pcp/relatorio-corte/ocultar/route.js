// POST /api/pcp/relatorio-corte/ocultar  { obra: string, setor?: string, ocultar: boolean }
// Oculta/restaura uma obra do Relatório de Produção, POR SETOR (ex.: OP já
// finalizada num setor). Só muda a VISÃO — nenhum dado é apagado. SOMENTE ADMIN.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const schema = z.object({
  obra: z.string().min(1, "Obra obrigatória"),
  setor: z.string().optional(),
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
  const setor = SETORES.includes(String(body.setor || "").toUpperCase()) ? body.setor.toUpperCase() : "CORTE";

  try {
    if (ocultar) {
      await prisma.relatorioCorteObraOculta.upsert({
        where: { obra_setor: { obra, setor } },
        update: { ocultadoPor: user.id, ocultadoNome: user.name || null },
        create: { obra, setor, ocultadoPor: user.id, ocultadoNome: user.name || null },
      });
    } else {
      await prisma.relatorioCorteObraOculta.deleteMany({ where: { obra, setor } });
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: ocultar ? "RELATORIO_OCULTAR_OBRA" : "RELATORIO_RESTAURAR_OBRA",
          entity: "RelatorioCorteObraOculta",
          entityId: `${setor}:${obra}`,
          diff: { obra, setor, ocultar },
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, obra, setor, oculto: ocultar });
  } catch (e) {
    console.error("[relatorio-corte/ocultar] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
