// /api/comercial/orcamento-servico
//   GET  → lista os orçamentos de serviço.
//   POST → cria (número sequencial OS-001). Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SERVICO_KEYS } from "@/lib/orcamento-servico";
import { z } from "zod";

export const runtime = "nodejs";

const createSchema = z.object({
  cliente: z.string().trim().min(2, "Informe o cliente").max(200),
  obra: z.string().max(200).nullable().optional(),
  contato: z.string().max(200).nullable().optional(),
  servicos: z.array(z.string()).min(1, "Selecione ao menos um serviço").refine((a) => a.every((s) => SERVICO_KEYS.includes(s)), "Serviço inválido"),
  observacoes: z.string().max(4000).nullable().optional(),
});

export async function GET() {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const orcamentos = await prisma.orcamentoServico.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return NextResponse.json({ success: true, orcamentos });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;

  const ultimo = await prisma.orcamentoServico.findFirst({ orderBy: { numero: "desc" }, select: { numero: true } });
  const numero = (ultimo?.numero || 0) + 1;
  const os = await prisma.orcamentoServico.create({
    data: {
      numero, cliente: d.cliente, obra: d.obra || null, contato: d.contato || null,
      servicos: d.servicos, observacoes: d.observacoes || null,
      criadoPorId: user.id, criadoPorNome: user.name || null,
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "CRIAR_ORCAMENTO_SERVICO", entity: "OrcamentoServico", entityId: os.id, diff: { cliente: d.cliente, servicos: d.servicos } },
  }).catch(() => {});

  return NextResponse.json({ success: true, id: os.id });
}
