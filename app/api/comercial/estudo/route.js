import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// ── GET /api/comercial/estudo ── Lista estudos ──

export async function GET(req) {
  try {
    const session = await requireRole(["ADMIN", "COMERCIAL"]);
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status");
    const orcamentoId = searchParams.get("orcamentoId");
    const busca = searchParams.get("busca");

    const where = {};
    if (status) where.status = status;
    if (orcamentoId) where.orcamentoId = orcamentoId;
    if (busca) {
      where.OR = [
        { orcamento: { numero: { contains: busca, mode: "insensitive" } } },
        { orcamento: { cliente: { contains: busca, mode: "insensitive" } } },
        { orcamento: { obra: { contains: busca, mode: "insensitive" } } },
        { referencia: { contains: busca, mode: "insensitive" } },
      ];
    }

    const estudos = await prisma.propostaEstudo.findMany({
      where,
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true, vendedor: true, tipoVenda: true, status: true } },
        criadoPor: { select: { name: true } },
        _count: { select: { itensPerso: true, itensCusto: true, documentos: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: estudos });
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}

// ── POST /api/comercial/estudo ── Criar estudo ──

const criarSchema = z.object({
  orcamentoId: z.string().min(1, "Orçamento é obrigatório"),
  referencia: z.string().optional(),
  sharepointUrl: z.string().optional(),
  observacoes: z.string().optional(),
});

export async function POST(req) {
  try {
    const session = await requireRole(["ADMIN", "COMERCIAL"]);
    const body = await req.json();
    const data = criarSchema.parse(body);

    // Verificar se orçamento existe
    const orcamento = await prisma.orcamento.findUnique({
      where: { id: data.orcamentoId },
      select: { id: true, numero: true, cliente: true },
    });
    if (!orcamento) {
      return NextResponse.json({ success: false, error: "Orçamento não encontrado" }, { status: 404 });
    }

    // Contar estudos existentes para definir revisão
    const count = await prisma.propostaEstudo.count({ where: { orcamentoId: data.orcamentoId } });

    const estudo = await prisma.propostaEstudo.create({
      data: {
        orcamentoId: data.orcamentoId,
        revisao: count,
        referencia: data.referencia || null,
        sharepointUrl: data.sharepointUrl || null,
        observacoes: data.observacoes || null,
        criadoPorId: session.user.id,
      },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "CRIAR_ESTUDO",
        entity: "PropostaEstudo",
        entityId: estudo.id,
        details: { orcamento: orcamento.numero, cliente: orcamento.cliente, revisao: count },
      },
    });

    return NextResponse.json({ success: true, data: estudo }, { status: 201 });
  } catch (e) {
    if (e.issues) {
      return NextResponse.json({ success: false, error: e.issues[0]?.message }, { status: 400 });
    }
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
}
