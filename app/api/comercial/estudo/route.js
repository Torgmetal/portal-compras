import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  cliente: z.string().min(1, "Cliente é obrigatório"),
  obra: z.string().optional(),
  referencia: z.string().optional(),
  sharepointUrl: z.string().optional(),
  observacoes: z.string().optional(),
});

// Gera o próximo número sequencial: "159-26"
async function gerarProximoNumero() {
  const anoSufixo = String(new Date().getFullYear()).slice(-2); // "26"
  const todos = await prisma.orcamento.findMany({
    where: { numero: { endsWith: `-${anoSufixo}` } },
    select: { numero: true },
  });
  const nums = todos
    .map((o) => parseInt(o.numero.split("-")[0]))
    .filter((n) => !isNaN(n));
  const proximo = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${String(proximo).padStart(3, "0")}-${anoSufixo}`;
}

export async function POST(req) {
  try {
    const user = await requireRole(["ADMIN", "COMERCIAL"]);
    const body = await req.json();
    const data = criarSchema.parse(body);

    // Gerar número sequencial e criar o orçamento
    const numero = await gerarProximoNumero();
    const orcamento = await prisma.orcamento.create({
      data: {
        numero,
        cliente: data.cliente,
        obra: data.obra || null,
        status: "ORCAMENTO",
        criadoPorId: user.id,
      },
    });

    // Criar o estudo vinculado
    const estudo = await prisma.propostaEstudo.create({
      data: {
        orcamentoId: orcamento.id,
        revisao: 0,
        referencia: data.referencia || null,
        sharepointUrl: data.sharepointUrl || null,
        observacoes: data.observacoes || null,
        criadoPorId: user.id,
      },
      include: {
        orcamento: { select: { numero: true, cliente: true, obra: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        user: { connect: { id: user.id } },
        action: "CRIAR_ESTUDO",
        entity: "PropostaEstudo",
        entityId: estudo.id,
        diff: { orcamento: orcamento.numero, cliente: orcamento.cliente, revisao: 0 },
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
