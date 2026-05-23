// GET  /api/admin/metas?modulo=PRODUCAO&tipo=PESO_KG&ano=2026
// POST /api/admin/metas — batch upsert de metas (array)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const MODULOS_VALIDOS = ["PRODUCAO", "COMERCIAL", "FINANCEIRO", "EXPEDICAO", "COMPRAS"];
const TIPOS_VALIDOS = ["PESO_KG", "FATURAMENTO_BRL", "QTD_PEDIDOS", "PECAS_QTD", "VALOR_BRL"];

// ─── GET ─────────────────────────────────────────────────────

export async function GET(req) {
  try {
    await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const modulo = searchParams.get("modulo");
  const tipo = searchParams.get("tipo");
  const ano = parseInt(searchParams.get("ano") || new Date().getFullYear(), 10);

  if (!modulo || !MODULOS_VALIDOS.includes(modulo)) {
    return NextResponse.json(
      { success: false, error: "Parâmetro 'modulo' obrigatório e válido." },
      { status: 400 }
    );
  }
  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json(
      { success: false, error: "Parâmetro 'tipo' obrigatório e válido." },
      { status: 400 }
    );
  }

  const metas = await prisma.meta.findMany({
    where: { modulo, tipo, ano },
    orderBy: [{ setor: "asc" }, { mes: "asc" }],
  });

  return NextResponse.json({ success: true, metas });
}

// ─── POST (batch upsert) ────────────────────────────────────

const schemaItem = z.object({
  setor: z.string().min(1),
  mes: z.number().int().min(1).max(12),
  valorMensal: z.number().min(0),
  semana1: z.number().nullable().optional(),
  semana2: z.number().nullable().optional(),
  semana3: z.number().nullable().optional(),
  semana4: z.number().nullable().optional(),
  semana5: z.number().nullable().optional(),
});

const schemaPost = z.object({
  modulo: z.enum(MODULOS_VALIDOS),
  tipo: z.enum(TIPOS_VALIDOS),
  ano: z.number().int().min(2020).max(2100),
  metas: z.array(schemaItem).min(1).max(200),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  let body;
  try {
    body = schemaPost.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const { modulo, tipo, ano, metas } = body;

  // Upsert cada meta numa transação
  const ops = metas.map((m) =>
    prisma.meta.upsert({
      where: {
        modulo_tipo_setor_ano_mes: {
          modulo,
          tipo,
          setor: m.setor,
          ano,
          mes: m.mes,
        },
      },
      create: {
        modulo,
        tipo,
        setor: m.setor,
        ano,
        mes: m.mes,
        valorMensal: m.valorMensal,
        semana1: m.semana1 ?? null,
        semana2: m.semana2 ?? null,
        semana3: m.semana3 ?? null,
        semana4: m.semana4 ?? null,
        semana5: m.semana5 ?? null,
        createdById: user.id,
      },
      update: {
        valorMensal: m.valorMensal,
        semana1: m.semana1 ?? null,
        semana2: m.semana2 ?? null,
        semana3: m.semana3 ?? null,
        semana4: m.semana4 ?? null,
        semana5: m.semana5 ?? null,
      },
    })
  );

  const results = await prisma.$transaction(ops);

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "upsert_metas",
      entity: "Meta",
      entityId: `${modulo}_${tipo}_${ano}`,
      diff: {
        modulo,
        tipo,
        ano,
        qtdRegistros: results.length,
        setores: [...new Set(metas.map((m) => m.setor))],
      },
    },
  });

  return NextResponse.json({ success: true, count: results.length });
}
