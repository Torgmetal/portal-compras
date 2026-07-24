// POST /api/pcp/relatorio-corte/prioridade
// Marca/ordena prioridades de produção no Relatório de Produção, POR SETOR.
// O escopo de cada prioridade é a OBRA INTEIRA (default) ou só algumas PEÇAS.
//   { obra, setor?, acao: "toggle" }                         → prioriza obra inteira / remove
//   { obra, setor?, acao: "data", dataEstimada|null }        → grava/limpa o prazo estimado
//   { obra, setor?, acao: "mover", direcao: "cima"|"baixo" } → reordena no setor
//   { obra, setor?, acao: "escopo", modo: "obra"|"pecas" }   → alterna obra inteira ↔ peças
//   { obra, setor?, acao: "peca", peca, incluir }            → marca/desmarca uma peça
// Cada resposta traz a lista de prioridades do setor (o client mescla sem refetch pesado).
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
  acao: z.enum(["toggle", "data", "mover", "escopo", "peca"]),
  dataEstimada: z.string().nullable().optional(), // "YYYY-MM-DD" ou null
  direcao: z.enum(["cima", "baixo"]).optional(),
  modo: z.enum(["obra", "pecas"]).optional(),
  peca: z.string().optional(),
  incluir: z.boolean().optional(),
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

// Lista de prioridades do setor (formato enxuto pro client mesclar sem refetch).
async function listaSetor(setor) {
  const rows = await prisma.producaoPrioridade.findMany({
    where: { setor },
    orderBy: { ordem: "asc" },
    select: { obra: true, ordem: true, dataEstimada: true, obraInteira: true, pecas: true },
  });
  return rows;
}

const proximaOrdem = async (setor) => ((await prisma.producaoPrioridade.aggregate({ where: { setor }, _max: { ordem: true } }))._max.ordem || 0) + 1;

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
  const ok = async (extra = {}) => NextResponse.json({ ok: true, obra, setor, prioridades: await listaSetor(setor), ...extra });

  try {
    const atual = await prisma.producaoPrioridade.findUnique({ where: { obra_setor: { obra, setor } } });

    if (body.acao === "toggle") {
      if (atual) {
        await prisma.producaoPrioridade.delete({ where: { id: atual.id } });
        await recompactar(setor);
        await audit(user, "PRIORIDADE_REMOVER", obra, setor, { obra, setor });
        return ok();
      }
      const ordem = await proximaOrdem(setor);
      await prisma.producaoPrioridade.create({
        data: { obra, setor, ordem, dataEstimada: parseData(body.dataEstimada), obraInteira: true, pecas: [], criadoPor: user.id, criadoNome: user.name || null },
      });
      await audit(user, "PRIORIDADE_ADICIONAR", obra, setor, { obra, setor, ordem });
      return ok();
    }

    if (body.acao === "data") {
      if (!atual) return NextResponse.json({ error: "Obra não está priorizada." }, { status: 404 });
      await prisma.producaoPrioridade.update({ where: { id: atual.id }, data: { dataEstimada: parseData(body.dataEstimada) } });
      await audit(user, "PRIORIDADE_DATA", obra, setor, { obra, setor, dataEstimada: body.dataEstimada || null });
      return ok();
    }

    if (body.acao === "mover") {
      if (!atual) return NextResponse.json({ error: "Obra não está priorizada." }, { status: 404 });
      const vizinho =
        body.direcao === "cima"
          ? await prisma.producaoPrioridade.findFirst({ where: { setor, ordem: { lt: atual.ordem } }, orderBy: { ordem: "desc" } })
          : await prisma.producaoPrioridade.findFirst({ where: { setor, ordem: { gt: atual.ordem } }, orderBy: { ordem: "asc" } });
      if (vizinho) {
        await prisma.$transaction([
          prisma.producaoPrioridade.update({ where: { id: atual.id }, data: { ordem: vizinho.ordem } }),
          prisma.producaoPrioridade.update({ where: { id: vizinho.id }, data: { ordem: atual.ordem } }),
        ]);
        await audit(user, "PRIORIDADE_MOVER", obra, setor, { obra, setor, direcao: body.direcao });
      }
      return ok();
    }

    if (body.acao === "escopo") {
      const modo = body.modo || "obra";
      const rec = atual || (await prisma.producaoPrioridade.create({
        data: { obra, setor, ordem: await proximaOrdem(setor), obraInteira: modo === "obra", pecas: [], criadoPor: user.id, criadoNome: user.name || null },
      }));
      await prisma.producaoPrioridade.update({
        where: { id: rec.id },
        data: modo === "obra" ? { obraInteira: true, pecas: [] } : { obraInteira: false },
      });
      await audit(user, "PRIORIDADE_ESCOPO", obra, setor, { obra, setor, modo });
      return ok();
    }

    if (body.acao === "peca") {
      if (!body.peca) return NextResponse.json({ error: "Peça obrigatória." }, { status: 400 });
      const incluir = body.incluir !== false;
      if (!atual) {
        if (!incluir) return ok(); // desmarcar sem prioridade → nada
        await prisma.producaoPrioridade.create({
          data: { obra, setor, ordem: await proximaOrdem(setor), obraInteira: false, pecas: [body.peca], criadoPor: user.id, criadoNome: user.name || null },
        });
        await audit(user, "PRIORIDADE_PECA", obra, setor, { obra, setor, peca: body.peca, incluir: true });
        return ok();
      }
      // Base: se estava "obra inteira", começar do vazio ao mexer em peça.
      const baseSet = new Set(atual.obraInteira ? [] : atual.pecas);
      if (incluir) baseSet.add(body.peca);
      else baseSet.delete(body.peca);
      const novo = [...baseSet];
      if (novo.length === 0 && !atual.obraInteira) {
        // desmarcou todas as peças → deixa de ser prioridade
        await prisma.producaoPrioridade.delete({ where: { id: atual.id } });
        await recompactar(setor);
      } else {
        await prisma.producaoPrioridade.update({ where: { id: atual.id }, data: { obraInteira: false, pecas: novo } });
      }
      await audit(user, "PRIORIDADE_PECA", obra, setor, { obra, setor, peca: body.peca, incluir });
      return ok();
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e) {
    console.error("[relatorio-corte/prioridade] erro:", e?.message);
    return NextResponse.json({ error: e?.message || "Erro interno" }, { status: 500 });
  }
}
