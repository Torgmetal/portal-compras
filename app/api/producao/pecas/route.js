// GET /api/producao/pecas — lista pecas com filtros
// POST /api/producao/pecas — cria peca manual (sem import)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const url = new URL(req.url);
  const opNumero = url.searchParams.get("op");
  const status = url.searchParams.get("status");
  const busca = url.searchParams.get("q");

  const where = {};
  if (opNumero) where.opNumero = opNumero;
  if (status) where.status = status;
  if (busca) {
    where.OR = [
      { marca: { contains: busca, mode: "insensitive" } },
      { descricao: { contains: busca, mode: "insensitive" } },
    ];
  }

  const pecas = await prisma.pecaConjunto.findMany({
    where,
    orderBy: [{ opNumero: "asc" }, { item: "asc" }, { marca: "asc" }],
    include: { op: { select: { id: true, numero: true, cliente: true } } },
    take: 5000,
  });

  // Agregados por OP
  const porOp = {};
  for (const p of pecas) {
    if (!porOp[p.opNumero]) {
      porOp[p.opNumero] = {
        opNumero: p.opNumero,
        opId: p.opId,
        cliente: p.op?.cliente || null,
        total: 0,
        expedidas: 0,
        emProducao: 0,
        pendentes: 0,
        pesoTotal: 0,
        pesoExpedido: 0,
      };
    }
    const agg = porOp[p.opNumero];
    agg.total += p.qte;
    agg.pesoTotal += p.pesoTotalKg;
    if (p.status === "EXPEDIDO") {
      agg.expedidas += p.qte;
      agg.pesoExpedido += p.pesoTotalKg;
    } else if (p.status === "PENDENTE") {
      agg.pendentes += p.qte;
    } else {
      agg.emProducao += p.qte;
    }
  }

  return NextResponse.json({ pecas, resumoPorOp: Object.values(porOp) });
}

export async function DELETE(req) {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  const url = new URL(req.url);
  const opNumero = url.searchParams.get("op");
  if (!opNumero) {
    return NextResponse.json({ error: "Parâmetro 'op' é obrigatório" }, { status: 400 });
  }

  const deleted = await prisma.pecaConjunto.deleteMany({ where: { opNumero } });

  await prisma.auditLog.create({
    data: {
      acao: "DELETE_PECAS_LOTE",
      entidade: "PecaConjunto",
      entidadeId: opNumero,
      detalhes: { opNumero, totalRemovidas: deleted.count },
    },
  });

  return NextResponse.json({ ok: true, removidas: deleted.count });
}

const schemaPeca = z.object({
  opNumero: z.string().min(1),
  marca: z.string().min(1),
  descricao: z.string().nullable().optional(),
  qte: z.number().int().min(1).default(1),
  pesoUnitKg: z.number().min(0).default(0),
  pesoTotalKg: z.number().min(0).default(0),
  status: z.string().optional(),
  observacao: z.string().nullable().optional(),
});

export async function POST(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }
  let body;
  try {
    body = schemaPeca.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados invalidos: " + e.message }, { status: 400 });
  }
  // Resolve opId pelo numero
  const op = await prisma.oP.findUnique({ where: { numero: body.opNumero } });
  const peca = await prisma.pecaConjunto.create({
    data: {
      opNumero: body.opNumero,
      opId: op?.id || null,
      marca: body.marca,
      descricao: body.descricao || null,
      qte: body.qte,
      pesoUnitKg: body.pesoUnitKg,
      pesoTotalKg: body.pesoTotalKg || body.pesoUnitKg * body.qte,
      status: body.status || "PENDENTE",
      observacao: body.observacao || null,
      fonte: "MANUAL",
    },
  });
  return NextResponse.json({ peca });
}
