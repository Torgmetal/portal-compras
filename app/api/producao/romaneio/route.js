import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncExpedicaoProducao } from "@/lib/expedicao";

const schema = z.object({
  numero: z.string().min(1),
  opId: z.string().nullable().optional(),
  data: z.string(),
  pesoRealKg: z.number().min(0),
  descricao: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  valorPorKg: z.number().min(0).nullable().optional(),
  // Destino + transportadora (campos livres)
  destino: z.string().max(200).nullable().optional(),
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placaVeiculo: z.string().max(20).nullable().optional(),
  contatoTransporte: z.string().max(100).nullable().optional(),
  // Controle de NF (a Expedição emite/registra)
  nfStatus: z.enum(["PENDENTE", "SOLICITADA", "EMITIDA"]).nullable().optional(),
  nfNumero: z.string().max(60).nullable().optional(),
  // Itens da carga (pré-preenchidos a partir das entregas por destino)
  itens: z
    .array(
      z.object({
        tipo: z.string().default("PECA"),
        descricao: z.string().min(1),
        pecaConjuntoId: z.string().nullable().optional(),
        rmItemId: z.string().nullable().optional(),
        qtd: z.number().min(0).default(1),
        pesoKg: z.number().min(0).nullable().optional(),
      })
    )
    .max(500)
    .optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "FINANCEIRO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message || "Dados invalidos" },
      { status: 400 }
    );
  }

  const valorTotal = body.valorPorKg ? body.pesoRealKg * body.valorPorKg : null;
  const nfStatus = body.nfStatus || "PENDENTE";

  const created = await prisma.romaneio.create({
    data: {
      numero: body.numero.trim(),
      opId: body.opId || null,
      data: new Date(body.data),
      pesoRealKg: body.pesoRealKg,
      descricao: body.descricao || null,
      observacao: body.observacao || null,
      valorPorKg: body.valorPorKg ?? null,
      valorTotal,
      destino: body.destino?.trim() || null,
      transportadora: body.transportadora?.trim() || null,
      motorista: body.motorista?.trim() || null,
      placaVeiculo: body.placaVeiculo?.trim() || null,
      contatoTransporte: body.contatoTransporte?.trim() || null,
      nfStatus,
      nfNumero: body.nfNumero?.trim() || null,
      nfSolicitadaEm: nfStatus === "SOLICITADA" || nfStatus === "EMITIDA" ? new Date() : null,
      nfEmitidaEm: nfStatus === "EMITIDA" ? new Date() : null,
      createdById: user.id,
      ...(body.itens && body.itens.length
        ? {
            itens: {
              create: body.itens.map((it) => ({
                tipo: it.tipo || "PECA",
                descricao: it.descricao,
                pecaConjuntoId: it.pecaConjuntoId || null,
                rmItemId: it.rmItemId || null,
                qtd: it.qtd ?? 1,
                pesoKg: it.pesoKg ?? null,
              })),
            },
          }
        : {}),
    },
  });

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_romaneio",
      entity: "Romaneio",
      entityId: created.id,
      diff: { depois: { numero: created.numero, opId: created.opId, pesoRealKg: created.pesoRealKg, data: body.data } },
    },
  });

  // Auto-sync: atualiza ProducaoSemanal pra setor Expedicao
  if (created.opId) {
    try {
      await syncExpedicaoProducao(created.opId, new Date(body.data));
    } catch (err) {
      console.error("syncExpedicaoProducao erro:", err.message);
    }
  }

  return NextResponse.json({ success: true, id: created.id });
}
