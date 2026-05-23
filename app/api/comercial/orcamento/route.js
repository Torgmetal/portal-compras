// GET  /api/comercial/orcamento          — lista orçamentos (com filtros)
// POST /api/comercial/orcamento          — cria novo orçamento
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "COMERCIAL"];

// ─── GET ────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // ORCAMENTO, EM_NEGOCIACAO, FECHADA, PERDIDA
  const vendedor = searchParams.get("vendedor");
  const busca = searchParams.get("busca"); // texto livre (numero, cliente, obra)

  const where = {};

  if (status) {
    where.status = status;
  }
  if (vendedor) {
    where.vendedor = vendedor;
  }
  if (busca) {
    where.OR = [
      { numero: { contains: busca, mode: "insensitive" } },
      { cliente: { contains: busca, mode: "insensitive" } },
      { obra: { contains: busca, mode: "insensitive" } },
    ];
  }

  const orcamentos = await prisma.orcamento.findMany({
    where,
    include: {
      revisoes: { orderBy: { numero: "asc" } },
      op: { select: { id: true, numero: true } },
      criadoPor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, orcamentos });
}

// ─── POST ───────────────────────────────────────────────────────

const createSchema = z.object({
  numero: z.string().min(1, "Número do orçamento obrigatório"),
  cliente: z.string().min(1, "Cliente obrigatório"),
  obra: z.string().nullable().optional(),
  responsavel: z.string().nullable().optional(),
  contato: z.string().nullable().optional(),
  orcamentista: z.string().nullable().optional(),
  tipoVenda: z.enum(["FABRICACAO", "MONTAGEM", "FABRICACAO_E_MONTAGEM", "PINTURA", "MAO_DE_OBRA", "REVENDA"]).nullable().optional(),
  valor: z.number().nullable().optional(),
  porte: z.enum(["ATE_1_2M", "DE_1_2M_A_10M", "DE_10M_A_50M", "ACIMA_50M"]).nullable().optional(),
  dataSolicitada: z.string().nullable().optional(),
  dataEnvio: z.string().nullable().optional(),
  status: z.enum(["ORCAMENTO", "EM_NEGOCIACAO", "FECHADA", "PERDIDA"]).default("ORCAMENTO"),
  vendedor: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message || "Dados inválidos" },
      { status: 400 }
    );
  }

  // Verifica unicidade do número
  const existe = await prisma.orcamento.findUnique({ where: { numero: body.numero } });
  if (existe) {
    return NextResponse.json(
      { success: false, error: `Orçamento ${body.numero} já existe.` },
      { status: 409 }
    );
  }

  const created = await prisma.orcamento.create({
    data: {
      numero: body.numero,
      cliente: body.cliente,
      obra: body.obra || null,
      responsavel: body.responsavel || null,
      contato: body.contato || null,
      orcamentista: body.orcamentista || null,
      tipoVenda: body.tipoVenda || null,
      valor: body.valor ?? null,
      porte: body.porte || null,
      dataSolicitada: body.dataSolicitada ? new Date(body.dataSolicitada) : null,
      dataEnvio: body.dataEnvio ? new Date(body.dataEnvio) : null,
      status: body.status,
      vendedor: body.vendedor || null,
      observacoes: body.observacoes || null,
      criadoPorId: user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_orcamento",
      entity: "Orcamento",
      entityId: created.id,
      diff: {
        depois: {
          numero: body.numero,
          cliente: body.cliente,
          status: body.status,
          valor: body.valor,
          vendedor: body.vendedor,
        },
      },
    },
  });

  return NextResponse.json({ success: true, id: created.id, orcamento: created }, { status: 201 });
}
