// GET (lista) + POST (cria um) — lotes de entrega da OP (aba Expedição).
// No início a lista costuma vir só com prioridade/local (sem peso); a Engenharia
// refina depois com a lista final e aí entram os pesos.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/session";

export const runtime = "nodejs";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP"];

export async function GET(_req, { params }) {
  // Leitura da aba aberta a todos os setores (dado operacional, sem financeiro).
  try { await requireUser(); } catch (e) { return NextResponse.json({ error: e.message }, { status: 401 }); }
  const lotes = await prisma.loteExpedicao.findMany({ where: { opId: params.id }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ success: true, lotes });
}

const schema = z.object({
  nome: z.string().min(1, "Informe o nome/identificação do lote.").max(200),
  local: z.string().max(300).nullable().optional(),
  dataPrevista: z.string().nullable().optional(),
  pesoKg: z.number().nonnegative().nullable().optional(),
  observacao: z.string().max(1000).nullable().optional(),
});

export async function POST(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const ult = await prisma.loteExpedicao.findFirst({ where: { opId: op.id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const lote = await prisma.loteExpedicao.create({
    data: {
      opId: op.id,
      ordem: (ult?.ordem ?? 0) + 1,
      nome: body.nome.trim(),
      local: body.local?.trim() || null,
      dataPrevista: body.dataPrevista ? new Date(body.dataPrevista) : null,
      pesoKg: body.pesoKg ?? null,
      observacao: body.observacao?.trim() || null,
    },
  });
  return NextResponse.json({ success: true, lote });
}
