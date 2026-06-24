// POST /api/pcp/relatorio-corte/concluir  { obra: string, setor?: string, concluir: boolean }
// Baixa manual de uma OP já finalizada cujo apontamento no Syneco ficou incompleto:
// marca a obra/setor como 100% concluída SÓ na visão do Relatório de Produção.
// NÃO altera o Syneco nem o mesOrdem (sobrevive ao sync). SOMENTE ADMIN.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const schema = z.object({
  obra: z.string().min(1, "Obra obrigatória"),
  setor: z.string().optional(),
  concluir: z.boolean(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]); // só ADMIN dá baixa manual
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const { obra, concluir } = body;
  const setor = SETORES.includes(String(body.setor || "").toUpperCase()) ? body.setor.toUpperCase() : "CORTE";

  try {
    if (concluir) {
      await prisma.relatorioObraConcluida.upsert({
        where: { obra_setor: { obra, setor } },
        update: { concluidoPor: user.id, concluidoNome: user.name || null },
        create: { obra, setor, concluidoPor: user.id, concluidoNome: user.name || null },
      });
    } else {
      await prisma.relatorioObraConcluida.deleteMany({ where: { obra, setor } });
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: concluir ? "RELATORIO_BAIXA_MANUAL" : "RELATORIO_REABRIR",
          entity: "RelatorioObraConcluida",
          entityId: `${setor}:${obra}`,
          diff: { obra, setor, concluir },
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, obra, setor, concluida: concluir });
  } catch (e) {
    console.error("[relatorio-corte/concluir] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
