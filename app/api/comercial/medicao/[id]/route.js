import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { consultarPedidoVenda } from "@/lib/omie-pedido-venda";
import { consultarOrdemServico } from "@/lib/omie-ordem-servico";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      // Preserva o valor anterior se o Omie voltar falsy (pedido alterado/zerado),
      // alinhado com valorContratado/valorFaturadoAuto abaixo — não zera medição boa.
      valorBruto: r.valorBruto != null ? r.valorBruto : m.valorBruto,
      valorLiquido: r.valorLiquido != null ? r.valorLiquido : m.valorLiquido,
      valorContratado: r.valorContratado != null ? r.valorContratado : m.valorContratado,
      valorFaturadoAuto: r.valorFaturado != null ? r.valorFaturado : m.valorFaturadoAuto,
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

// PATCH — edita campos manuais (valorBruto, descricao) sem sincronizar Omie.
// Util quando a deteccao automatica de "valor faturado" nao bate com o
// que o usuario realmente quer medir.
export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const m = await prisma.oPMedicao.findUnique({ where: { id: params.id } });
  if (!m) return NextResponse.json({ error: "Medicao nao encontrada" }, { status: 404 });

  const data = {};
  if (body.valorBruto !== undefined) {
    const v = Number(body.valorBruto);
    if (isNaN(v) || v < 0) return NextResponse.json({ error: "Valor invalido" }, { status: 400 });
    data.valorBruto = v;
  }
  if (body.descricao !== undefined) data.descricao = String(body.descricao || "").trim() || null;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada pra atualizar" }, { status: 400 });
  }

  const updated = await prisma.oPMedicao.update({ where: { id: m.id }, data });
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "editar_medicao_manual",
      entity: "OPMedicao",
      entityId: m.id,
      diff: { antes: { valorBruto: m.valorBruto, descricao: m.descricao }, depois: data },
    },
  });
  return NextResponse.json({ medicao: updated });
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
