// POST /api/producao/pecas/marcar-terceirizado
// Marca peças/croquis como SERVIÇO TERCEIRIZADO: não passam pelo corte — saem do fluxo
// (status TERCEIRIZADO, aguardando recebimento do Compras) e guardam o destino de retorno.
// Body: { ids, destino: "MONTAGEM"|"PINTURA"|"EXPEDICAO" } | { ids, reverter: true }
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const DESTINOS = ["MONTAGEM", "PINTURA", "EXPEDICAO"];

const schema = z.object({
  ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
  destino: z.enum(DESTINOS).optional(),
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

  const { ids, destino, reverter } = body;

  let atualizados = 0;
  if (reverter) {
    // Volta pro fluxo normal de corte (PENDENTE), limpando a marca de terceirizado.
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: "TERCEIRIZADO" },
      data: { terceirizado: false, destinoTerceirizado: null, terceirizadoRecebidoEm: null, status: "PENDENTE", ultimoSetor: null },
    });
    atualizados = r.count;
  } else {
    if (!destino) return NextResponse.json({ error: "Informe o destino (Montagem, Pintura ou Expedição)." }, { status: 400 });
    // Só peças que ainda não avançaram (PENDENTE/CORTE) podem virar terceirizadas.
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: ids }, status: { in: ["PENDENTE", "CORTE"] } },
      data: {
        terceirizado: true,
        destinoTerceirizado: destino,
        terceirizadoRecebidoEm: null,
        status: "TERCEIRIZADO",
        maquina: null,
        // sai da programação de corte
        corteOrdem: null,
        corteDataMetaInicio: null,
        corteDataMetaFim: null,
        corteIniciadoEm: null,
        corteConcluidoEm: null,
      },
    });
    atualizados = r.count;
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: reverter ? "REVERTER_TERCEIRIZADO" : "MARCAR_TERCEIRIZADO",
        entity: "PecaConjunto",
        entityId: ids.length === 1 ? ids[0] : `${ids.length} peças`,
        diff: { ids: ids.slice(0, 30), total: ids.length, atualizados, destino: destino || null },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, atualizados });
}
