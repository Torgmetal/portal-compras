import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
    const apresentacoes = await prisma.apresentacaoCliente.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { documentos: true } } },
    });
    return NextResponse.json({ success: true, apresentacoes });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

const schema = z.object({
  contato: z.string().min(1),
  empresa: z.string().min(1),
  mensagemBoasVindas: z.string().nullable().optional(),
  clienteEmail: z.string().email().nullable().optional().or(z.literal("")),
  capaUrl: z.string().url().nullable().optional().or(z.literal("")),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 });
  }
  // Por padrão inclui todos os documentos institucionais ativos.
  const ativos = await prisma.documentoInstitucional.findMany({ where: { ativo: true }, select: { id: true } });
  const ap = await prisma.apresentacaoCliente.create({
    data: {
      contato: body.contato,
      empresa: body.empresa,
      mensagemBoasVindas: body.mensagemBoasVindas || null,
      clienteEmail: body.clienteEmail || null,
      capaUrl: body.capaUrl || null,
      docsInstitucionaisIds: ativos.map((d) => d.id),
      criadoPorId: user.id,
    },
  });
  await prisma.auditLog.create({ data: { userId: user.id, action: "CRIAR_APRESENTACAO", entity: "ApresentacaoCliente", entityId: ap.id, diff: { empresa: ap.empresa, contato: ap.contato } } });
  return NextResponse.json({ success: true, apresentacao: ap }, { status: 201 });
}
