import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { consultarPedidoVenda } from "@/lib/omie-pedido-venda";
import { consultarOrdemServico } from "@/lib/omie-ordem-servico";

// POST — sincroniza dados da medicao com o Omie (re-busca via API).
export async function POST(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const m = await prisma.oPMedicao.findUnique({ where: { id: params.id } });
  if (!m) return NextResponse.json({ error: "Medicao nao encontrada" }, { status: 404 });

  // Re-busca usando o mesmo tipo (VENDA / SERVICO) salvo na medicao
  const r = m.tipoDocumento === "SERVICO"
    ? await consultarOrdemServico({
        codigo: m.codigoPedidoOmie,
        numero: m.numeroPedidoOmie,
      })
    : await consultarPedidoVenda({
        codigoPedido: m.codigoPedidoOmie,
        numeroPedido: m.numeroPedidoOmie,
      });

  if (r.error) {
    await prisma.oPMedicao.update({
      where: { id: m.id },
      data: { syncErro: r.error, ultimoSync: new Date() },
    });
    return NextResponse.json({ error: r.error }, { status: 502 });
  }

  await prisma.oPMedicao.update({
    where: { id: m.id },
    data: {
      codigoPedidoOmie: r.codigoPedido || m.codigoPedidoOmie,
      data: r.data || m.data,
      valorBruto: r.valorBruto || 0,
      valorLiquido: r.valorLiquido,
      status: r.status,
      etapa: r.etapa,
      qtdItens: r.qtdItens || 0,
      ultimoSync: new Date(),
      syncErro: null,
      payload: r.raw,
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — desvincula a medicao da OP (nao apaga no Omie)
export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const m = await prisma.oPMedicao.findUnique({ where: { id: params.id } });
  if (!m) return NextResponse.json({ error: "Medicao nao encontrada" }, { status: 404 });

  await prisma.oPMedicao.delete({ where: { id: m.id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "desvincular_medicao",
      entity: "OPMedicao",
      entityId: m.id,
      diff: {
        opId: m.opId,
        numeroPedidoOmie: m.numeroPedidoOmie,
      },
    },
  });

  return NextResponse.json({ ok: true });
}
