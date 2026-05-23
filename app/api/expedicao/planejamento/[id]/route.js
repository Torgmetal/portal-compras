// GET    /api/expedicao/planejamento/[id]  — detalhes de um planejamento
// PATCH  /api/expedicao/planejamento/[id]  — atualiza status, itens, vincula romaneio
// DELETE /api/expedicao/planejamento/[id]  — exclui planejamento
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ENGENHARIA"];

// ─── GET ────────────────────────────────────────────────────────

export async function GET(_req, { params }) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const plan = await prisma.planejamentoCarga.findUnique({
    where: { id: params.id },
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      itens: {
        include: {
          pecaConjunto: { select: { id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, status: true } },
          rmItem: { select: { id: true, descricao: true, unidade: true, qtd: true, peso: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      romaneio: { select: { id: true, numero: true, data: true, pesoRealKg: true } },
    },
  });

  if (!plan) {
    return NextResponse.json({ success: false, error: "Planejamento nao encontrado." }, { status: 404 });
  }

  return NextResponse.json({ success: true, planejamento: plan });
}

// ─── PATCH ──────────────────────────────────────────────────────

const patchSchema = z.object({
  status: z.enum(["PLANEJADO", "EM_CARGA", "CONCLUIDO", "CANCELADO"]).optional(),
  dataPrevista: z.string().optional(),
  descricao: z.string().nullable().optional(),
  romaneioId: z.string().nullable().optional(),
  // Atualizar itens individuais (array parcial)
  itens: z.array(z.object({
    id: z.string(),
    qtdCarregada: z.number().min(0).optional(),
    status: z.enum(["PLANEJADO", "CARREGADO", "PARCIAL", "NAO_ENVIADO", "REPROGRAMADO"]).optional(),
    motivoNaoEnvio: z.string().nullable().optional(),
    reprogramadoParaId: z.string().nullable().optional(),
  })).optional(),
}).refine((data) => Object.keys(data).length > 0, { message: "Nenhum campo para atualizar" });

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message || "Dados invalidos" },
      { status: 400 }
    );
  }

  const atual = await prisma.planejamentoCarga.findUnique({
    where: { id: params.id },
    include: { itens: true },
  });
  if (!atual) {
    return NextResponse.json({ success: false, error: "Planejamento nao encontrado." }, { status: 404 });
  }

  // Monta update do planejamento
  const updateData = {};
  if (body.status) updateData.status = body.status;
  if (body.dataPrevista) updateData.dataPrevista = new Date(body.dataPrevista);
  if (body.descricao !== undefined) updateData.descricao = body.descricao;
  if (body.romaneioId !== undefined) updateData.romaneioId = body.romaneioId;

  // Validacao: itens NAO_ENVIADO precisam de motivo
  if (body.itens) {
    for (const it of body.itens) {
      if (it.status === "NAO_ENVIADO" && !it.motivoNaoEnvio) {
        return NextResponse.json(
          { success: false, error: `Item ${it.id}: motivo obrigatorio quando NAO_ENVIADO.` },
          { status: 400 }
        );
      }
    }
  }

  // Transacao: atualiza planejamento + itens
  const ops = [];

  if (Object.keys(updateData).length > 0) {
    ops.push(prisma.planejamentoCarga.update({ where: { id: params.id }, data: updateData }));
  }

  if (body.itens) {
    for (const it of body.itens) {
      const itemUpdate = {};
      if (it.qtdCarregada !== undefined) itemUpdate.qtdCarregada = it.qtdCarregada;
      if (it.status) itemUpdate.status = it.status;
      if (it.motivoNaoEnvio !== undefined) itemUpdate.motivoNaoEnvio = it.motivoNaoEnvio;
      if (it.reprogramadoParaId !== undefined) itemUpdate.reprogramadoParaId = it.reprogramadoParaId;

      if (Object.keys(itemUpdate).length > 0) {
        ops.push(prisma.planejamentoCargaItem.update({ where: { id: it.id }, data: itemUpdate }));
      }
    }
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "update_planejamento_carga",
      entity: "PlanejamentoCarga",
      entityId: params.id,
      diff: {
        antes: { status: atual.status, dataPrevista: atual.dataPrevista },
        depois: body,
      },
    },
  });

  return NextResponse.json({ success: true, ok: true });
}

// ─── DELETE ─────────────────────────────────────────────────────

export async function DELETE(_req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const plan = await prisma.planejamentoCarga.findUnique({ where: { id: params.id } });
  if (!plan) {
    return NextResponse.json({ success: false, error: "Planejamento nao encontrado." }, { status: 404 });
  }

  // Cascade deleta os itens
  await prisma.planejamentoCarga.delete({ where: { id: params.id } });

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "delete_planejamento_carga",
      entity: "PlanejamentoCarga",
      entityId: params.id,
      diff: {
        antes: { opId: plan.opId, status: plan.status, dataPrevista: plan.dataPrevista },
      },
    },
  });

  return NextResponse.json({ success: true, ok: true });
}
