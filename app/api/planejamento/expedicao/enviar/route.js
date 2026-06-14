// POST /api/planejamento/expedicao/enviar
// O Planejamento "envia para a Expedição" as entregas (quantidade + local) já
// definidas nos conjuntos da OP (ConjuntoEntrega). Cria/atualiza um
// PedidoExpedicao (1 por obra). A Expedição lê a fila em /api/expedicao/pedidos.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const schema = z.object({
  opNumero: z.string().min(1),
  opId: z.string().nullable().optional(),
  observacao: z.string().max(500).nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PCP", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  // Só faz sentido enviar se houver ao menos uma entrega (qtd + local) definida.
  // Casa pelos conjuntos da OP via opId — o `opNumero` do PecaConjunto pode
  // diferir do `numero` da OP (normalização por dígitos: T082 ↔ T82A ↔ 082),
  // então comparar por texto não bate. Fallback p/ opNumero se faltar opId.
  const totalEntregas = await prisma.conjuntoEntrega.count({
    where: { pecaConjunto: body.opId ? { opId: body.opId } : { opNumero: body.opNumero } },
  });
  if (totalEntregas === 0) {
    return NextResponse.json(
      { success: false, error: "Defina ao menos uma entrega (quantidade + local) nos conjuntos antes de enviar à Expedição." },
      { status: 400 }
    );
  }

  const pedido = await prisma.pedidoExpedicao.upsert({
    where: { opNumero: body.opNumero },
    create: {
      opNumero: body.opNumero,
      opId: body.opId || null,
      status: "ENVIADO",
      enviadoPorId: user.id,
      observacao: body.observacao || null,
    },
    update: {
      opId: body.opId || undefined,
      status: "ENVIADO",
      enviadoPorId: user.id,
      enviadoEm: new Date(),
      observacao: body.observacao ?? undefined,
    },
  });

  await prisma.auditLog
    .create({
      data: {
        userId: user.id,
        action: "enviar_expedicao",
        entity: "PedidoExpedicao",
        entityId: pedido.id,
        diff: { depois: { opNumero: pedido.opNumero, status: pedido.status, entregas: totalEntregas } },
      },
    })
    .catch(() => {});

  return NextResponse.json({
    success: true,
    pedido: { opNumero: pedido.opNumero, status: pedido.status, enviadoEm: pedido.enviadoEm },
  });
}
