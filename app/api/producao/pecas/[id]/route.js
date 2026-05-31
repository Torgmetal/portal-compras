// PATCH /api/producao/pecas/:id — atualiza status/peso/observacao
// DELETE /api/producao/pecas/:id — remove (so admin)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const STATUS_VALIDOS = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

const schemaUpdate = z.object({
  status: z.enum(STATUS_VALIDOS).optional(),
  qte: z.number().int().min(1).optional(),
  pesoUnitKg: z.number().min(0).optional(),
  pesoTotalKg: z.number().min(0).optional(),
  descricao: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  fluxoEspecial: z.boolean().optional(),
});

export async function PATCH(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  let body;
  try {
    body = schemaUpdate.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }

  const data = { ...body };
  // Se virou EXPEDIDO, registra data
  if (body.status === "EXPEDIDO") data.dataConcluida = new Date();
  // Atualiza ultimoSetor para o status atual (se nao for PENDENTE)
  if (body.status && body.status !== "PENDENTE" && body.status !== "EXPEDIDO") {
    data.ultimoSetor = body.status;
  }

  const peca = await prisma.pecaConjunto.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ peca });
}

export async function DELETE(req, { params }) {
  try {
    await requireRole(["ADMIN"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  const peca = await prisma.pecaConjunto.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: {
      acao: "DELETE_PECA",
      entidade: "PecaConjunto",
      entidadeId: params.id,
      detalhes: { opNumero: peca.opNumero, marca: peca.marca },
    },
  });
  return NextResponse.json({ ok: true });
}
