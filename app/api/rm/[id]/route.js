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

// DELETE — exclusao definitiva da RM. Por padrao bloqueia se ja gerou pedido no Omie (status="CRIADO").
// Aceita ?force=1 (query param) pra ADMIN forcar mesmo com pedidos criados — uso quando os pedidos
// foram cancelados manualmente no Omie.
// Cascateia: itens, cotacoes (e seus itens, anexos), envios, anexos da RM, todos os pedidos vinculados.
export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin pode excluir RMs." }, { status: 403 });
  }

  const force = req.nextUrl?.searchParams?.get("force") === "1"
    || new URL(req.url).searchParams.get("force") === "1";

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

  // Bloqueia se algum pedido foi efetivamente criado no Omie — exceto se force=1
  const pedidosCriados = rm.cotacoes.flatMap((c) =>
    c.pedidosOmie.filter((p) => p.status === "CRIADO")
  );
  if (pedidosCriados.length > 0 && !force) {
    const numeros = pedidosCriados.map((p) => p.numeroPedido || p.id).join(", ");
    return NextResponse.json(
      {
        error:
          `A RM ${rm.numero} já gerou ${pedidosCriados.length} pedido(s) no Omie ` +
          `(${numeros}). Confirme se eles foram cancelados no Omie antes de continuar.`,
        requiresForce: true,
        pedidosCriados: pedidosCriados.map((p) => p.numeroPedido || p.id),
      },
      { status: 409 }
    );
  }

  // IDs de TODOS pedidos vinculados (com force, apaga inclusive os CRIADOs do banco local)
  const pedidosErroIds = rm.cotacoes.flatMap((c) => c.pedidosOmie.map((p) => p.id));

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
