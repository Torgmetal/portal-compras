// POST /api/pcp/relatorio-corte/prioridade
// Marca/ordena prioridades de produção no Relatório de Produção, POR SETOR.
//   { obra, setor?, acao: "toggle" }                    → prioriza (próxima ordem) ou remove
//   { obra, setor?, acao: "data", dataEstimada|null }   → grava/limpa o prazo estimado
//   { obra, setor?, acao: "mover", direcao: "cima"|"baixo" } → reordena no setor
// Alimenta o Dashboard TV (/pcp/dashboard-prioridades). PCP/PLANEJAMENTO/ADMIN.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";

const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA"];
const schema = z.object({
  obra: z.string().min(1, "Obra obrigatória"),
  setor: z.string().optional(),
  acao: z.enum(["toggle", "data", "mover"]),
  dataEstimada: z.string().nullable().optional(), // "YYYY-MM-DD" ou null
  direcao: z.enum(["cima", "baixo"]).optional(),
});

// Data date-level ancorada ao meio-dia UTC (evita virada de dia por fuso).
const parseData = (s) => (s ? new Date(`${s}T12:00:00.000Z`) : null);

async function audit(user, action, obra, setor, diff) {
  try {
    await prisma.auditLog.create({
      data: { userId: user.id, action, entity: "ProducaoPrioridade", entityId: `${setor}:${obra}`, diff },
    });
  } catch {}
}

// Recompacta as ordens (1,2,3…) de um setor após remoção.
async function recompactar(setor) {
  const lista = await prisma.producaoPrioridade.findMany({ where: { setor }, orderBy: { ordem: "asc" } });
  const ops = [];
  lista.forEach((p, i) => {
    if (p.ordem !== i + 1) ops.push(prisma.producaoPrioridade.update({ where: { id: p.id }, data: { ordem: i + 1 } }));
  });
  if (ops.length) await prisma.$transaction(ops);
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PCP", "PLANEJAMENTO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const obra = body.obra;
  const setor = SETORES.includes(String(body.setor || "").toUpperCase()) ? body.setor.toUpperCase() : "CORTE";

  try {
    if (body.acao === "toggle") {
      const existente = await prisma.producaoPrioridade.findUnique({ where: { obra_setor: { obra, setor } } });
      if (existente) {
        await prisma.producaoPrioridade.delete({ where: { id: existente.id } });
        await recompactar(setor);
        await audit(user, "PRIORIDADE_REMOVER", obra, setor, { obra, setor });
        return NextResponse.json({ ok: true, obra, setor, prioridade: null, dataEstimada: null });
      }
      const max = await prisma.producaoPrioridade.aggregate({ where: { setor }, _max: { ordem: true } });
      const ordem = (max._max.ordem || 0) + 1;
      const dataEstimada = parseData(body.dataEstimada);
      await prisma.producaoPrioridade.create({
        data: { obra, setor, ordem, dataEstimada, criadoPor: user.id, criadoNome: user.name || null },
      });
      await audit(user, "PRIORIDADE_ADICIONAR", obra, setor, { obra, setor, ordem });
      return NextResponse.json({ ok: true, obra, setor, prioridade: ordem, dataEstimada });
    }

    if (body.acao === "data") {
      const dataEstimada = parseData(body.dataEstimada);
      const p = await prisma.producaoPrioridade
        .update({ where: { obra_setor: { obra, setor } }, data: { dataEstimada } })
        .catch(() => null);
      if (!p) return NextResponse.json({ error: "Obra não está priorizada." }, { status: 404 });
      await audit(user, "PRIORIDADE_DATA", obra, setor, { obra, setor, dataEstimada: body.dataEstimada || null });
      return NextResponse.json({ ok: true, obra, setor, prioridade: p.ordem, dataEstimada });
    }

    if (body.acao === "mover") {
      const atual = await prisma.producaoPrioridade.findUnique({ where: { obra_setor: { obra, setor } } });
      if (!atual) return NextResponse.json({ error: "Obra não está priorizada." }, { status: 404 });
      const vizinho =
        body.direcao === "cima"
          ? await prisma.producaoPrioridade.findFirst({ where: { setor, ordem: { lt: atual.ordem } }, orderBy: { ordem: "desc" } })
          : await prisma.producaoPrioridade.findFirst({ where: { setor, ordem: { gt: atual.ordem } }, orderBy: { ordem: "asc" } });
      if (!vizinho) return NextResponse.json({ ok: true, obra, setor, prioridade: atual.ordem }); // já no topo/fim
      await prisma.$transaction([
        prisma.producaoPrioridade.update({ where: { id: atual.id }, data: { ordem: vizinho.ordem } }),
        prisma.producaoPrioridade.update({ where: { id: vizinho.id }, data: { ordem: atual.ordem } }),
      ]);
      await audit(user, "PRIORIDADE_MOVER", obra, setor, { obra, setor, direcao: body.direcao });
      return NextResponse.json({ ok: true, obra, setor, prioridade: vizinho.ordem });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    console.error("[relatorio-corte/prioridade] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
