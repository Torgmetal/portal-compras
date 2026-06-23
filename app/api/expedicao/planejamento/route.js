// GET  /api/expedicao/planejamento?opId=xxx  — lista planejamentos de carga da OP
// POST /api/expedicao/planejamento            — cria novo planejamento com itens
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ROLES = ["ADMIN", "EXPEDICAO", "PRODUCAO", "COMERCIAL", "ENGENHARIA"];

// ─── GET ────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    await requireRole(ROLES);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const opId = searchParams.get("opId");

  if (!opId) {
    return NextResponse.json(
      { success: false, error: "Parametro 'opId' obrigatorio." },
      { status: 400 }
    );
  }

  const planejamentos = await prisma.planejamentoCarga.findMany({
    where: { opId },
    include: {
      itens: {
        include: {
          pecaConjunto: { select: { id: true, marca: true, descricao: true, qte: true, pesoTotalKg: true, status: true } },
          rmItem: { select: { id: true, descricao: true, unidade: true, qtd: true, peso: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      romaneio: { select: { id: true, numero: true, data: true, pesoRealKg: true } },
      historico: { orderBy: { createdAt: "desc" }, take: 100 },
    },
    orderBy: { dataPrevista: "desc" },
  });

  return NextResponse.json({ success: true, planejamentos });
}

// ─── POST ───────────────────────────────────────────────────────

const itemSchema = z.object({
  tipo: z.enum(["PECA", "ACESSORIO"]),
  descricao: z.string().min(1),
  pecaConjuntoId: z.string().nullable().optional(),
  rmItemId: z.string().nullable().optional(),
  qtdPlanejada: z.number().min(0).default(1),
  pesoEstimadoKg: z.number().nullable().optional(),
});

const createSchema = z.object({
  opId: z.string().min(1),
  dataPrevista: z.string().min(1),
  descricao: z.string().nullable().optional(),
  itens: z.array(itemSchema).min(1, "Pelo menos 1 item obrigatorio"),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message || "Dados invalidos" },
      { status: 400 }
    );
  }

  // Verifica se OP existe
  const op = await prisma.oP.findUnique({ where: { id: body.opId }, select: { id: true } });
  if (!op) {
    return NextResponse.json({ success: false, error: "OP nao encontrada." }, { status: 404 });
  }

  const created = await prisma.planejamentoCarga.create({
    data: {
      opId: body.opId,
      dataPrevista: new Date(body.dataPrevista),
      descricao: body.descricao || null,
      status: "PLANEJADO",
      createdById: user.id,
      itens: {
        create: body.itens.map((item) => ({
          tipo: item.tipo,
          descricao: item.descricao,
          pecaConjuntoId: item.pecaConjuntoId || null,
          rmItemId: item.rmItemId || null,
          qtdPlanejada: item.qtdPlanejada,
          pesoEstimadoKg: item.pesoEstimadoKg ?? null,
          status: "PLANEJADO",
        })),
      },
    },
    include: { itens: true },
  });

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_planejamento_carga",
      entity: "PlanejamentoCarga",
      entityId: created.id,
      diff: { depois: { opId: body.opId, dataPrevista: body.dataPrevista, qtdItens: body.itens.length } },
    },
  });

  return NextResponse.json({ success: true, id: created.id, planejamento: created });
}
