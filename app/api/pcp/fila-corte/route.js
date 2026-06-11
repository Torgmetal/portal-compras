// GET  /api/pcp/fila-corte           → peças da fila/kanban de corte
// POST /api/pcp/fila-corte           → ações sobre a seleção
//   { acao: "programar", ids, metaInicio "YYYY-MM-DD", metaFim }   → define metas + alimenta PMP
//   { acao: "desprogramar", ids }                                  → volta pra fila (só não-iniciadas)
//   { acao: "iniciar", ids }                                       → real início = agora
//   { acao: "concluir", ids }                                      → real fim = agora
//   { acao: "reabrir", ids }                                       → desfaz conclusão
//   { acao: "ordenar", idsOrdenados }                              → grava posição na fila
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { recalcularPmpCorte } from "@/lib/pmp-corte";
import { buscarFilaCorte } from "@/lib/fila-corte";

const ROLES = ["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"];

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  const pecas = await buscarFilaCorte();
  return NextResponse.json({ pecas });
}

const schema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("programar"),
    ids: z.array(z.string()).min(1, "Selecione ao menos uma peça"),
    metaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data meta de início inválida"),
    metaFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data meta de fim inválida"),
  }),
  z.object({ acao: z.literal("desprogramar"), ids: z.array(z.string()).min(1) }),
  z.object({ acao: z.literal("iniciar"), ids: z.array(z.string()).min(1) }),
  z.object({ acao: z.literal("concluir"), ids: z.array(z.string()).min(1) }),
  z.object({ acao: z.literal("reabrir"), ids: z.array(z.string()).min(1) }),
  z.object({ acao: z.literal("ordenar"), idsOrdenados: z.array(z.string()).min(1).max(2000) }),
]);

export async function POST(req) {
  let user;
  try {
    user = await requireRole(ROLES);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const agora = new Date();
  let atualizados = 0;
  const avisos = [];

  if (body.acao === "ordenar") {
    // Grava a posição de cada peça na fila (1-based, na ordem recebida)
    await prisma.$transaction(
      body.idsOrdenados.map((id, i) =>
        prisma.pecaConjunto.updateMany({ where: { id, status: "CORTE" }, data: { corteOrdem: i + 1 } })
      )
    );
    atualizados = body.idsOrdenados.length;
  } else if (body.acao === "programar") {
    const inicio = new Date(body.metaInicio + "T00:00:00Z");
    const fim = new Date(body.metaFim + "T00:00:00Z");
    if (fim < inicio) {
      return NextResponse.json({ error: "A data meta de fim não pode ser antes do início." }, { status: 400 });
    }
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: body.ids }, status: "CORTE", corteConcluidoEm: null },
      data: { corteDataMetaInicio: inicio, corteDataMetaFim: fim },
    });
    atualizados = r.count;
    if (atualizados < body.ids.length) {
      avisos.push(`${body.ids.length - atualizados} peça(s) ignorada(s) — já concluída(s) ou fora do corte.`);
    }
  } else if (body.acao === "desprogramar") {
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: body.ids }, status: "CORTE", corteIniciadoEm: null },
      data: { corteDataMetaInicio: null, corteDataMetaFim: null },
    });
    atualizados = r.count;
    if (atualizados < body.ids.length) {
      avisos.push(`${body.ids.length - atualizados} peça(s) ignorada(s) — corte já iniciado (conclua ou reabra antes).`);
    }
  } else if (body.acao === "iniciar") {
    // Exige programação: é a meta que alimenta o PMP e dá o real × estimado
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: body.ids }, status: "CORTE", corteDataMetaInicio: { not: null }, corteIniciadoEm: null },
      data: { corteIniciadoEm: agora },
    });
    atualizados = r.count;
    if (atualizados < body.ids.length) {
      avisos.push(`${body.ids.length - atualizados} peça(s) ignorada(s) — programe a data meta antes de iniciar.`);
    }
  } else if (body.acao === "concluir") {
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: body.ids }, status: "CORTE", corteDataMetaInicio: { not: null }, corteConcluidoEm: null },
      data: { corteConcluidoEm: agora },
    });
    // quem concluiu sem ter clicado iniciar ganha o início = conclusão
    await prisma.pecaConjunto.updateMany({
      where: { id: { in: body.ids }, corteConcluidoEm: agora, corteIniciadoEm: null },
      data: { corteIniciadoEm: agora },
    });
    atualizados = r.count;
    if (atualizados < body.ids.length) {
      avisos.push(`${body.ids.length - atualizados} peça(s) ignorada(s) — sem programação ou já concluída(s).`);
    }
  } else if (body.acao === "reabrir") {
    const r = await prisma.pecaConjunto.updateMany({
      where: { id: { in: body.ids }, status: "CORTE", corteConcluidoEm: { not: null } },
      data: { corteConcluidoEm: null },
    });
    atualizados = r.count;
  }

  // PMP: programar/desprogramar mudam o plano → recalcula metas das OPs afetadas
  let pmp = null;
  if (["programar", "desprogramar"].includes(body.acao) && atualizados > 0) {
    try {
      const ops = await prisma.pecaConjunto.findMany({
        where: { id: { in: body.ids } },
        select: { opNumero: true },
        distinct: ["opNumero"],
      });
      pmp = await recalcularPmpCorte(ops.map((o) => o.opNumero), user.id);
      avisos.push(...pmp.avisos);
    } catch (e) {
      avisos.push("Falha ao atualizar o PMP: " + (e?.message || "erro desconhecido") + " — as metas das peças foram salvas.");
    }
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: `FILA_CORTE_${body.acao.toUpperCase()}`,
        entity: "PecaConjunto",
        entityId: body.acao === "ordenar" ? `${body.idsOrdenados.length} peças` : (body.ids.length === 1 ? body.ids[0] : `${body.ids.length} peças`),
        diff: {
          acao: body.acao,
          ids: (body.ids || body.idsOrdenados).slice(0, 20),
          total: (body.ids || body.idsOrdenados).length,
          atualizados,
          ...(body.acao === "programar" ? { metaInicio: body.metaInicio, metaFim: body.metaFim } : {}),
          ...(pmp ? { pmpMetas: pmp.metasGravadas } : {}),
        },
      },
    });
  } catch {}

  const pecas = await buscarFilaCorte();
  return NextResponse.json({ ok: true, atualizados, avisos, pecas });
}
