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
  // Suporta: ?op=X (uma OP), body { ops: [...] } (várias OPs) OU body { ids: [...] }
  // (peças específicas selecionadas na tela).
  let opsParaDeletar = [];
  let idsParaDeletar = [];
  const opQuery = new URL(req.url, "http://n").searchParams.get("op");
  if (opQuery) {
    opsParaDeletar = [opQuery];
  } else {
    try {
      const body = await req.json();
      if (Array.isArray(body.ops) && body.ops.length > 0) {
        opsParaDeletar = body.ops.filter((o) => typeof o === "string" && o.trim());
      }
      if (Array.isArray(body.ids) && body.ids.length > 0) {
        idsParaDeletar = body.ids.filter((i) => typeof i === "string" && i.trim());
      }
    } catch {
      // body vazio — segue sem ops/ids
    }
  }

  if (opsParaDeletar.length === 0 && idsParaDeletar.length === 0) {
    return NextResponse.json({ error: "Informe OP(s) (?op= ou body { ops: [] }) ou peças (body { ids: [] })" }, { status: 400 });
  }

  // Permissão pelo tipo (Vitor 09/08): excluir PEÇAS selecionadas (ids) → todos os perfis
  // que acessam a Programação de Corte; excluir OP INTEIRA (ops / ?op=) continua só ADMIN.
  const porIds = idsParaDeletar.length > 0;
  let user;
  try {
    user = await requireRole(porIds
      ? ["ADMIN", "PRODUCAO", "PCP", "PLANEJAMENTO", "ENGENHARIA", "COMERCIAL", "COMPRAS", "EXPEDICAO"] // todos os perfis que acessam as telas de peças/corte (Corte, PCP, Fila, Listas Eng., Expedição)
      : ["ADMIN"]); // excluir OP INTEIRA (ops / ?op=) continua só ADMIN
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  try {
    const deleted = await prisma.pecaConjunto.deleteMany({
      where: porIds ? { id: { in: idsParaDeletar } } : { opNumero: { in: opsParaDeletar } },
    });

    try {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: porIds ? "DELETE_PECAS_SELECIONADAS" : "DELETE_PECAS_LOTE",
          entity: "PecaConjunto",
          entityId: (porIds ? idsParaDeletar : opsParaDeletar).slice(0, 50).join(","),
          diff: porIds ? { ids: idsParaDeletar.length, totalRemovidas: deleted.count } : { ops: opsParaDeletar, totalRemovidas: deleted.count },
        },
      });
    } catch (auditErr) {
      console.error("[pecas DELETE] falha no audit log:", auditErr?.message);
    }

    return NextResponse.json({ ok: true, removidas: deleted.count, ...(porIds ? { ids: idsParaDeletar.length } : { ops: opsParaDeletar }) });
  } catch (e) {
    console.error("[pecas DELETE] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro ao excluir" }, { status: 500 });
  }
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
