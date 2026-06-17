// POST /api/producao/pecas/receber-terceirizado
// Recebimento do serviço terceirizado: libera a peça pro destino (Montagem/Pintura/
// Expedição) — o Compras (ou PCP) confirma quando o terceiro entrega. Reverter desfaz.
// Body: { ids } | { ids, reverter: true }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const STATUS_DESTINO = { MONTAGEM: "MONTAGEM", PINTURA: "PINTURA", EXPEDICAO: "EXPEDIDO" };
const SETOR_DESTINO = { MONTAGEM: "Montagem", PINTURA: "Pintura", EXPEDICAO: "Expedição" };

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  reverter: z.boolean().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS", "PCP", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const { ids, reverter } = body;
  let atualizados = 0;

  if (reverter) {
    // Volta pro estado de espera (não recebido).
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, terceirizado: true, terceirizadoRecebidoEm: { not: null } },
      data: { status: "TERCEIRIZADO", terceirizadoRecebidoEm: null, ultimoSetor: null },
    });
    atualizados = r.count;
  } else {
    // Cada peça vai pro seu próprio destino.
    const pecas = await prisma.pecaConjunto.findMany({
      where: { id: { in: ids }, terceirizado: true, status: "TERCEIRIZADO" },
      select: { id: true, destinoTerceirizado: true },
    });
    const agora = new Date();
    for (const p of pecas) {
      const dest = p.destinoTerceirizado || "MONTAGEM";
      const r = await prisma.pecaConjunto.updateMany({
        where: { id: p.id, status: "TERCEIRIZADO" },
        data: { status: STATUS_DESTINO[dest] || "MONTAGEM", ultimoSetor: SETOR_DESTINO[dest] || "Montagem", terceirizadoRecebidoEm: agora },
      });
      atualizados += r.count;
    }
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: reverter ? "REVERTER_RECEBIMENTO_TERCEIRIZADO" : "RECEBER_TERCEIRIZADO",
        entity: "PecaConjunto",
        entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
        diff: { ids: ids.slice(0, 30), total: ids.length, atualizados },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados });
}
