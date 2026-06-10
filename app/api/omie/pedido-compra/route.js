import { NextResponse } from "next/server";
import { criarPedidoOmie } from "@/lib/omie-pedido-compra";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
    const body = await request.json();
    const result = await criarPedidoOmie(body);
    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }

    // Pedido de compra real no ERP — registra quem criou (best-effort).
    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "CRIAR_PEDIDO_OMIE_AVULSO",
          entity: "PedidoOmie",
          entityId: String(result.codigo_pedido || result.codigo_pedido_integracao || "avulso"),
          diff: {
            nCodFor: body?.nCodFor ?? body?.codigo_fornecedor ?? null,
            itens: Array.isArray(body?.itens) ? body.itens.length : null,
          },
        },
      });
    } catch (auditErr) {
      console.error("[omie pedido-compra] falha ao gravar AuditLog:", auditErr?.message);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("omie pedido-compra error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
