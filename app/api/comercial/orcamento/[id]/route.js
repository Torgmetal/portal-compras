// GET    /api/comercial/orcamento/[id]  — detalhe do orçamento
// PATCH  /api/comercial/orcamento/[id]  — atualiza orçamento
// DELETE /api/comercial/orcamento/[id]  — exclui orçamento
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "COMERCIAL"];

// ─── GET ────────────────────────────────────────────────────────

export async function GET(_req, { params }) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const orcamento = await prisma.orcamento.findUnique({
    where: { id },
    include: {
      revisoes: { orderBy: { numero: "asc" } },
      op: { select: { id: true, numero: true } },
      criadoPor: { select: { id: true, name: true } },
    },
  });

  if (!orcamento) {
    return NextResponse.json({ success: false, error: "Orçamento não encontrado." }, { status: 404 });
  }

  return NextResponse.json({ success: true, orcamento });
}

// ─── PATCH ──────────────────────────────────────────────────────

const updateSchema = z.object({
  numero: z.string().min(1).optional(),
  cliente: z.string().min(1).optional(),
  obra: z.string().nullable().optional(),
  responsavel: z.string().nullable().optional(),
  contato: z.string().nullable().optional(),
  orcamentista: z.string().nullable().optional(),
  tipoVenda: z.enum(["FABRICACAO", "MONTAGEM", "FABRICACAO_E_MONTAGEM", "PINTURA", "MAO_DE_OBRA", "REVENDA"]).nullable().optional(),
  valor: z.number().nullable().optional(),
  porte: z.enum(["ATE_1_2M", "DE_1_2M_A_10M", "DE_10M_A_50M", "ACIMA_50M"]).nullable().optional(),
  dataSolicitada: z.string().nullable().optional(),
  prazoEntrega: z.string().nullable().optional(),
  dataEnvio: z.string().nullable().optional(),
  dataFechamento: z.string().nullable().optional(),
  status: z.enum(["ORCAMENTO", "EM_NEGOCIACAO", "FECHADA", "PERDIDA"]).optional(),
  vendedor: z.string().nullable().optional(),
  motivoPerda: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  opId: z.string().nullable().optional(),
});

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  let body;
  try {
    body = updateSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  const antes = await prisma.orcamento.findUnique({ where: { id } });
  if (!antes) {
    return NextResponse.json({ success: false, error: "Orçamento não encontrado." }, { status: 404 });
  }

  // Se mudou número, verifica unicidade
  if (body.numero && body.numero !== antes.numero) {
    const conflito = await prisma.orcamento.findUnique({ where: { numero: body.numero } });
    if (conflito) {
      return NextResponse.json(
        { success: false, error: `Orçamento ${body.numero} já existe.` },
        { status: 409 }
      );
    }
  }

  // Se status = PERDIDA, motivoPerda deve estar preenchido
  const statusFinal = body.status ?? antes.status;
  if (statusFinal === "PERDIDA" && !body.motivoPerda && !antes.motivoPerda) {
    return NextResponse.json(
      { success: false, error: "Informe o motivo da perda ao marcar como Perdida." },
      { status: 400 }
    );
  }

  const data = {};
  if (body.numero !== undefined) data.numero = body.numero;
  if (body.cliente !== undefined) data.cliente = body.cliente;
  if (body.obra !== undefined) data.obra = body.obra;
  if (body.responsavel !== undefined) data.responsavel = body.responsavel;
  if (body.contato !== undefined) data.contato = body.contato;
  if (body.orcamentista !== undefined) data.orcamentista = body.orcamentista;
  if (body.tipoVenda !== undefined) data.tipoVenda = body.tipoVenda;
  if (body.valor !== undefined) data.valor = body.valor;
  if (body.porte !== undefined) data.porte = body.porte;
  if (body.dataSolicitada !== undefined) data.dataSolicitada = body.dataSolicitada ? new Date(body.dataSolicitada) : null;
  if (body.prazoEntrega !== undefined) data.prazoEntrega = body.prazoEntrega ? new Date(body.prazoEntrega) : null;
  if (body.dataEnvio !== undefined) data.dataEnvio = body.dataEnvio ? new Date(body.dataEnvio) : null;
  if (body.dataFechamento !== undefined) data.dataFechamento = body.dataFechamento ? new Date(body.dataFechamento) : null;
  if (body.status !== undefined) data.status = body.status;
  if (body.vendedor !== undefined) data.vendedor = body.vendedor;
  if (body.motivoPerda !== undefined) data.motivoPerda = body.motivoPerda;
  if (body.observacoes !== undefined) data.observacoes = body.observacoes;
  if (body.opId !== undefined) data.opId = body.opId;

  const updated = await prisma.orcamento.update({ where: { id }, data });

  // Diff pra AuditLog
  const diff = {};
  for (const key of Object.keys(data)) {
    const antesVal = antes[key];
    const depoisVal = updated[key];
    if (JSON.stringify(antesVal) !== JSON.stringify(depoisVal)) {
      diff[key] = { antes: antesVal, depois: depoisVal };
    }
  }

  if (Object.keys(diff).length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "update_orcamento",
        entity: "Orcamento",
        entityId: id,
        diff: { antes: diff, depois: data },
      },
    });
  }

  return NextResponse.json({ success: true, orcamento: updated });
}

// ─── DELETE ─────────────────────────────────────────────────────

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const orcamento = await prisma.orcamento.findUnique({ where: { id } });
  if (!orcamento) {
    return NextResponse.json({ success: false, error: "Orçamento não encontrado." }, { status: 404 });
  }

  await prisma.orcamento.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_orcamento",
      entity: "Orcamento",
      entityId: id,
      diff: {
        antes: {
          numero: orcamento.numero,
          cliente: orcamento.cliente,
          status: orcamento.status,
          valor: orcamento.valor,
        },
      },
    },
  });

  return NextResponse.json({ success: true });
}
