// POST /api/producao/pecas/marcar-conjunto
// Marca peças "sem máquina" como CONJUNTO — elas não passam por corte:
// começam o processo na MONTAGEM. Reverter volta para PENDENTE (croqui),
// reentrando no fluxo de corte.
// Body: { ids: string[], reverter?: boolean }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  reverter: z.boolean().optional(),
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

  const { ids, reverter } = body;

  let atualizados = 0;
  if (reverter) {
    // Volta para a fila de corte como peça cortável (croqui), sem máquina.
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: "MONTAGEM", tipoPeca: "CONJUNTO" },
      data: { status: "PENDENTE", tipoPeca: "CROQUI", maquina: null, ultimoSetor: null },
    });
    atualizados = r.count;
  } else {
    // Só peças ainda em PENDENTE ou CORTE viram conjunto (não mexe em quem já avançou).
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: { in: ["PENDENTE", "CORTE"] } },
      data: {
        tipoPeca: "CONJUNTO",
        maquina: null,
        status: "MONTAGEM",
        ultimoSetor: "Montagem",
        // limpa a programação de corte — a peça não será cortada
        corteDataMetaInicio: null,
        corteDataMetaFim: null,
        corteIniciadoEm: null,
        corteConcluidoEm: null,
        corteOrdem: null,
      },
    });
    atualizados = r.count;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: reverter ? "REVERTER_CONJUNTO" : "MARCAR_CONJUNTO",
        entity: "PecaConjunto",
        entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
        diff: { ids: ids.slice(0, 30), total: ids.length, atualizados, destino: reverter ? "PENDENTE" : "MONTAGEM" },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados, destino: reverter ? "PENDENTE" : "MONTAGEM" });
}
