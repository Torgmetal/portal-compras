// PATCH /api/producao/controle/:id — atualiza campos do registro diário
// DELETE /api/producao/controle/:id
// POST /api/producao/controle/:id/pecas — adiciona peças ao planejamento
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function PATCH(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  const antes = await prisma.producaoDiaria.findUnique({ where: { id: params.id } });

  const data = {};
  if (body.pesoMetaKg !== undefined) data.pesoMetaKg = Number(body.pesoMetaKg);
  if (body.pesoRealizadoKg !== undefined) data.pesoRealizadoKg = Number(body.pesoRealizadoKg);
  if (body.produtividadeEstimada !== undefined) data.produtividadeEstimada = body.produtividadeEstimada === null ? null : Number(body.produtividadeEstimada);
  if (body.qtdPessoas !== undefined) data.qtdPessoas = Number(body.qtdPessoas);
  if (body.horasNormais !== undefined) data.horasNormais = Number(body.horasNormais);
  if (body.horasExtrasProjetadas !== undefined) data.horasExtrasProjetadas = Number(body.horasExtrasProjetadas);
  if (body.horasExtrasRealizadas !== undefined) data.horasExtrasRealizadas = body.horasExtrasRealizadas === null ? null : Number(body.horasExtrasRealizadas);
  if (body.observacao !== undefined) data.observacao = body.observacao;

  const registro = await prisma.producaoDiaria.update({
    where: { id: params.id },
    data,
  });

  try {
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "ATUALIZAR_PRODUCAO_DIARIA",
        entity: "ProducaoDiaria",
        entityId: params.id,
        diff: { antes, depois: data },
      },
    });
  } catch (e) {
    console.error("AuditLog error:", e);
  }

  return NextResponse.json({ ok: true, registro });
}

export async function DELETE(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const antes = await prisma.producaoDiaria.findUnique({ where: { id: params.id } });
  await prisma.producaoDiaria.delete({ where: { id: params.id } });

  try {
    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "EXCLUIR_PRODUCAO_DIARIA",
        entity: "ProducaoDiaria",
        entityId: params.id,
        diff: { antes },
      },
    });
  } catch (e) {
    console.error("AuditLog error:", e);
  }

  return NextResponse.json({ ok: true });
}
