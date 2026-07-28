// POST /api/expedicao/op/[id]/romaneio
// Gera um romaneio da OP a partir das marcas montadas na "Lista Avançada".
// Número automático por OP (R1, R2, R3…). Cria Romaneio + itens no portal.
// (A geração do Excel FORM 22 + upload no SharePoint entra na Fase 3.)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncExpedicaoProducao } from "@/lib/expedicao";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  data: z.string().optional(),
  destino: z.string().max(200).nullable().optional(),
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placaVeiculo: z.string().max(20).nullable().optional(),
  contatoTransporte: z.string().max(100).nullable().optional(),
  observacao: z.string().max(2000).nullable().optional(),
  itens: z.array(z.object({
    marca: z.string().min(1),
    descricao: z.string().nullable().optional(),
    qtd: z.number().min(0),
    pesoKg: z.number().min(0).nullable().optional(),
  })).min(1, "Inclua ao menos uma marca na carga."),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "EXPEDICAO", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // Próximo número R# da OP (maior número existente + 1).
  const existentes = await prisma.romaneio.findMany({ where: { opId: op.id }, select: { numero: true } });
  let max = 0;
  for (const r of existentes) { const m = String(r.numero || "").match(/(\d+)/); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  const numero = `R${max + 1}`;

  const itens = body.itens.map((it) => ({
    tipo: "PECA",
    descricao: it.descricao ? `${it.marca} — ${it.descricao}` : it.marca,
    marca: it.marca,
    qtd: it.qtd,
    pesoKg: it.pesoKg ?? null,
  }));
  const pesoRealKg = Math.round(itens.reduce((s, it) => s + (it.pesoKg || 0), 0) * 100) / 100;
  const data = body.data ? new Date(body.data) : new Date();

  const created = await prisma.romaneio.create({
    data: {
      numero, opId: op.id, data, pesoRealKg,
      destino: body.destino?.trim() || null,
      transportadora: body.transportadora?.trim() || null,
      motorista: body.motorista?.trim() || null,
      placaVeiculo: body.placaVeiculo?.trim() || null,
      contatoTransporte: body.contatoTransporte?.trim() || null,
      observacao: body.observacao?.trim() || null,
      nfStatus: "PENDENTE",
      createdById: user.id,
      itens: { create: itens.map((it) => ({ tipo: it.tipo, descricao: it.descricao, qtd: it.qtd, pesoKg: it.pesoKg })) },
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXPEDICAO_GERAR_ROMANEIO", entity: "Romaneio", entityId: created.id, diff: { depois: { numero, opId: op.id, itens: itens.length, pesoRealKg } } },
  }).catch(() => {});

  try { await syncExpedicaoProducao(op.id, data); } catch (e) { console.error("syncExpedicaoProducao:", e.message); }

  return NextResponse.json({ success: true, id: created.id, numero });
}
