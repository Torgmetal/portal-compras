// POST /api/pcp/painel-corte/baixa  { opNumero: string, baixar: boolean }
// Esconde/restaura uma obra (frente) da carteira "Necessidade por obra" do
// Dashboard do PCP. Só muda a VISÃO do dashboard — NÃO altera o status das
// peças (PecaConjunto). Reversível. SOMENTE ADMIN.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  opNumero: z.string().min(1, "Obra obrigatória"),
  baixar: z.boolean(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]); // só ADMIN dá baixa na carteira
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const { opNumero, baixar } = body;

  try {
    if (baixar) {
      await prisma.pcpCarteiraObraBaixa.upsert({
        where: { opNumero },
        update: { baixadoPor: user.id, baixadoNome: user.name || null },
        create: { opNumero, baixadoPor: user.id, baixadoNome: user.name || null },
      });
    } else {
      await prisma.pcpCarteiraObraBaixa.deleteMany({ where: { opNumero } });
    }

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: baixar ? "PCP_CARTEIRA_BAIXA" : "PCP_CARTEIRA_RESTAURAR",
          entity: "PcpCarteiraObraBaixa",
          entityId: opNumero,
          diff: { opNumero, baixar },
        },
      });
    } catch {}

    return NextResponse.json({ ok: true, opNumero, baixada: baixar });
  } catch (e) {
    console.error("[painel-corte/baixa] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
