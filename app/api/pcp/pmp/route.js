// GET  /api/pcp/pmp?semana=2026-06-09  → lista metas da semana + realizado
// POST /api/pcp/pmp                    → cria/atualiza metas (upsert em lote)
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const PIPELINE = ["PENDENTE", "CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDIDO"];

// ── GET — buscar metas + realizado da semana ──────────────────
export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const semanaParam = searchParams.get("semana"); // ISO date: "2026-06-09"

  // Calcular segunda e domingo da semana
  const ref = semanaParam ? new Date(semanaParam + "T00:00:00Z") : new Date();
  const dia = ref.getUTCDay();
  const diffSeg = dia === 0 ? -6 : 1 - dia;
  const seg = new Date(ref);
  seg.setUTCDate(ref.getUTCDate() + diffSeg);
  seg.setUTCHours(0, 0, 0, 0);
  const dom = new Date(seg);
  dom.setUTCDate(seg.getUTCDate() + 6);
  dom.setUTCHours(23, 59, 59, 999);

  // 1) Metas da semana
  const metas = await prisma.pmpMeta.findMany({
    where: { data: { gte: seg, lte: dom } },
    orderBy: [{ opNumero: "asc" }, { setor: "asc" }, { data: "asc" }],
  });

  // 2) Realizado — snapshot atual das PecaConjunto por OP
  const pecas = await prisma.pecaConjunto.groupBy({
    by: ["opNumero", "status"],
    where: { tipoPeca: "CONJUNTO" },
    _count: { id: true },
    _sum: { pesoTotalKg: true },
  });

  // Agrupar: { "82": { CORTE: {pecas: 50, pesoKg: 5000}, MONTAGEM: ... } }
  const realizado = {};
  for (const p of pecas) {
    if (!realizado[p.opNumero]) realizado[p.opNumero] = {};
    realizado[p.opNumero][p.status] = {
      pecas: p._count.id,
      pesoKg: p._sum.pesoTotalKg || 0,
    };
  }

  // 3) OPs ativas (para dropdown)
  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_PRODUCAO"] } },
    select: { numero: true, cliente: true, obra: true },
    orderBy: { numero: "asc" },
  });

  return NextResponse.json({
    semana: { inicio: seg.toISOString().split("T")[0], fim: dom.toISOString().split("T")[0] },
    metas,
    realizado,
    ops,
  });
}

// ── POST — salvar metas (upsert em lote) ──────────────────────
const metaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
  setor: z.enum(PIPELINE, { message: "Setor inválido" }),
  opNumero: z.string().min(1, "OP obrigatória"),
  metaPecas: z.number().int().min(0).default(0),
  metaPesoKg: z.number().min(0).default(0),
  observacao: z.string().optional().nullable(),
});

const bodySchema = z.object({
  metas: z.array(metaSchema).min(1, "Envie ao menos uma meta"),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }

  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const resultados = [];
  for (const m of body.metas) {
    const dataObj = new Date(m.data + "T00:00:00Z");

    // Se meta zerada, deletar
    if (m.metaPecas === 0 && m.metaPesoKg === 0) {
      await prisma.pmpMeta.deleteMany({
        where: { data: dataObj, setor: m.setor, opNumero: m.opNumero },
      });
      resultados.push({ ...m, acao: "removida" });
      continue;
    }

    const upserted = await prisma.pmpMeta.upsert({
      where: {
        data_setor_opNumero: { data: dataObj, setor: m.setor, opNumero: m.opNumero },
      },
      create: {
        data: dataObj,
        setor: m.setor,
        opNumero: m.opNumero,
        metaPecas: m.metaPecas,
        metaPesoKg: m.metaPesoKg,
        observacao: m.observacao || null,
        criadoPorId: user.id,
      },
      update: {
        metaPecas: m.metaPecas,
        metaPesoKg: m.metaPesoKg,
        observacao: m.observacao || null,
      },
    });
    resultados.push({ ...m, acao: "salva", id: upserted.id });
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PMP_ATUALIZAR",
        entity: "PmpMeta",
        entityId: `${body.metas.length} metas`,
        diff: { metas: resultados.slice(0, 20), total: resultados.length },
      },
    });
  } catch {}

  return NextResponse.json({ ok: true, resultados });
}
