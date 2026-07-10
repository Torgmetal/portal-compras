// /api/comercial/orcamento-servico/[id]  — GET | PATCH | DELETE. Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SERVICO_KEYS } from "@/lib/orcamento-servico";
import { z } from "zod";

export const runtime = "nodejs";

const updateSchema = z.object({
  cliente: z.string().trim().min(2).max(200).optional(),
  obra: z.string().max(200).nullable().optional(),
  contato: z.string().max(200).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  telefone: z.string().max(80).nullable().optional(),
  endereco: z.string().max(400).nullable().optional(),
  servicos: z.array(z.string()).min(1).refine((a) => a.every((s) => SERVICO_KEYS.includes(s)), "Serviço inválido").optional(),
  status: z.enum(["RASCUNHO", "ENVIADO", "FECHADO", "PERDIDO"]).optional(),
  valor: z.number().nonnegative().nullable().optional(),
  observacoes: z.string().max(4000).nullable().optional(),
  diasPagamento: z.number().int().min(0).max(365).nullable().optional(),
  pagamentoPrazo: z.string().max(200).nullable().optional(),
  inclusos: z.array(z.string().max(500)).max(40).nullable().optional(),
  exclusos: z.array(z.string().max(500)).max(40).nullable().optional(),
  lotes: z.array(z.object({
    id: z.string(),
    nome: z.string().max(120).optional().default(""),
    local: z.string().max(600).optional().default(""),
    data: z.string().max(40).optional().default(""),
    itens: z.array(z.object({ descricao: z.string().max(300).optional().default(""), qtd: z.string().max(40).optional().default(""), unidade: z.string().max(40).optional().default(""), url: z.string().max(2000).optional().nullable(), nomeArquivo: z.string().max(400).optional().nullable(), tipo: z.string().max(200).optional().nullable(), tamanho: z.number().optional().nullable() })).max(200).optional().default([]),
  })).max(60).nullable().optional(),
  composicao: z.record(z.any()).optional(),
  arquivos: z.array(z.object({
    url: z.string().url(),
    nome: z.string().max(300).optional().default(""),
    tamanho: z.number().nonnegative().optional(),
    tipo: z.string().max(120).optional().default(""),
  })).max(400).optional(),
});

export async function GET(_req, { params }) {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const os = await prisma.orcamentoServico.findUnique({ where: { id: params.id } });
  if (!os) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });
  return NextResponse.json({ success: true, orcamento: os });
}

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });

  const existe = await prisma.orcamentoServico.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existe) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });

  const d = parsed.data;
  const data = {};
  for (const k of ["cliente", "obra", "contato", "email", "telefone", "endereco", "servicos", "status", "valor", "observacoes", "diasPagamento", "pagamentoPrazo", "inclusos", "exclusos", "lotes", "composicao", "arquivos"]) {
    if (k in d) data[k] = d[k];
  }
  const os = await prisma.orcamentoServico.update({ where: { id: params.id }, data });
  return NextResponse.json({ success: true, orcamento: os });
}

export async function DELETE(_req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const os = await prisma.orcamentoServico.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!os) return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });
  await prisma.orcamentoServico.delete({ where: { id: params.id } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXCLUIR_ORCAMENTO_SERVICO", entity: "OrcamentoServico", entityId: params.id, diff: { numero: os.numero } },
  }).catch(() => {});
  return NextResponse.json({ success: true });
}
