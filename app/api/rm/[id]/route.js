import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const patchSchema = z.object({
  acao: z.enum(["desvincular"]),
});

// PATCH — acoes pontuais sobre a RM. Hoje suporta 'desvincular' (tira a RM da OP).
export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: { itens: { select: { id: true, opItemId: true, aditivoItemId: true } } },
  });
  if (!rm) return NextResponse.json({ error: "RM nao encontrada" }, { status: 404 });

  if (body.acao === "desvincular") {
    if (!rm.opId) {
      return NextResponse.json({ error: "Essa RM nao esta vinculada a nenhuma OP." }, { status: 400 });
    }

    const itensComRef = rm.itens.filter((it) => it.opItemId || it.aditivoItemId);

    await prisma.$transaction(async (tx) => {
      // Limpa referencias dos itens da RM aos itens da OP/aditivo
      if (itensComRef.length > 0) {
        await tx.rMItem.updateMany({
          where: { rmId: rm.id },
          data: { opItemId: null, aditivoItemId: null },
        });
      }
      // Desvincula a RM da OP e zera as categorias cobertas
      await tx.rM.update({
        where: { id: rm.id },
        data: { opId: null, categoriasOP: [] },
      });
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "desvincular_rm",
        entity: "RM",
        entityId: rm.id,
        diff: { numero: rm.numero, opIdAnterior: rm.opId, itensDesvinculados: itensComRef.length },
      },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acao desconhecida" }, { status: 400 });
}

// DELETE — exclusao definitiva da RM. Bloqueia se ja gerou pedido no Omie (status="CRIADO").
// Cascateia: itens, cotacoes (e seus itens, anexos), envios, anexos da RM, pedidos com status="ERRO".
export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin pode excluir RMs." }, { status: 403 });
  }

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      cotacoes: {
        select: {
          id: true,
          pedidosOmie: { select: { id: true, status: true, numeroPedido: true } },
        },
      },
      _count: { select: { itens: true, cotacoes: true, envios: true, anexos: true } },
    },
  });
  if (!rm) return NextResponse.json({ error: "RM nao encontrada." }, { status: 404 });

  // Bloqueia se algum pedido foi efetivamente criado no Omie
  const pedidosCriados = rm.cotacoes.flatMap((c) =>
    c.pedidosOmie.filter((p) => p.status === "CRIADO")
  );
  if (pedidosCriados.length > 0) {
    const numeros = pedidosCriados.map((p) => p.numeroPedido || p.id).join(", ");
    return NextResponse.json(
      {
        error:
          `Nao da pra excluir: a RM ${rm.numero} ja gerou ${pedidosCriados.length} pedido(s) no Omie ` +
          `(${numeros}). Use 'Cancelar' pra arquivar mantendo o historico.`,
      },
      { status: 409 }
    );
  }

  // IDs de pedidos com status="ERRO" (vinculados as cotacoes dessa RM) — vamos apagar tambem
  const pedidosErroIds = rm.cotacoes.flatMap((c) =>
    c.pedidosOmie.filter((p) => p.status !== "CRIADO").map((p) => p.id)
  );

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Limpa referencia de RMItem -> PedidoOmie pra nao quebrar FK
      await tx.rMItem.updateMany({
        where: { rmId: rm.id, pedidoOmieId: { not: null } },
        data: { pedidoOmieId: null },
      });

      // 2. Apaga CotacaoItens manualmente — eles referenciam RMItem SEM
      // onDelete:Cascade, então o cascade da RM falha se nao limparmos antes.
      await tx.cotacaoItem.deleteMany({
        where: { cotacao: { rmId: rm.id } },
      });

      // 3. Apaga pedidos com erro vinculados a essa RM
      if (pedidosErroIds.length > 0) {
        await tx.pedidoOmie.deleteMany({ where: { id: { in: pedidosErroIds } } });
      }

      // 4. Apaga a RM — cascades cuidam do resto (RMItem, Cotacao, Envio, Anexo)
      await tx.rM.delete({ where: { id: rm.id } });
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "delete_rm",
        entity: "RM",
        entityId: rm.id,
        diff: {
          numero: rm.numero,
          opId: rm.opId,
          itens: rm._count.itens,
          cotacoes: rm._count.cotacoes,
          envios: rm._count.envios,
          anexos: rm._count.anexos,
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Erro ao excluir RM:", e);
    return NextResponse.json(
      {
        error: `Falha ao excluir RM ${rm.numero}: ${e.message || "erro desconhecido"}`,
        code: e.code,
      },
      { status: 500 }
    );
  }
}
