// POST /api/planejamento/tarefas/distribuir — cria em lote as tarefas revisadas
// (vindas da extração por IA) na semana/ano escolhidos, distribuindo aos setores.
// Cada tarefa gera compromissos na agenda dos usuários do setor (best-effort).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarCompromissosDaTarefa } from "@/lib/compromissos";

export const runtime = "nodejs";
export const maxDuration = 60;

const SETORES = ["PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO"];

const schema = z.object({
  semanaIso: z.number().int().min(1).max(53),
  ano: z.number().int().min(2024),
  tarefas: z.array(z.object({
    titulo: z.string().min(1),
    descricao: z.string().nullable().optional(),
    setor: z.enum(SETORES),
    prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).default("MEDIA"),
    responsavel: z.string().nullable().optional(),
    dataPrevista: z.string().nullable().optional(),
    opNumero: z.string().nullable().optional(),
  })).min(1).max(100),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 }); }

  // resolve opId das OPs citadas (uma vez só)
  const numeros = [...new Set(body.tarefas.map((t) => t.opNumero).filter(Boolean))];
  const ops = numeros.length ? await prisma.oP.findMany({ where: { numero: { in: numeros } }, select: { id: true, numero: true } }) : [];
  const opIdPorNumero = new Map(ops.map((o) => [o.numero, o.id]));

  let criadas = 0;
  const porSetor = {};
  for (const t of body.tarefas) {
    const tarefa = await prisma.tarefaPlanejamento.create({
      data: {
        titulo: t.titulo,
        descricao: t.descricao || null,
        opNumero: t.opNumero || null,
        opId: t.opNumero ? (opIdPorNumero.get(t.opNumero) || null) : null,
        setor: t.setor,
        semanaIso: body.semanaIso,
        ano: body.ano,
        prioridade: t.prioridade || "MEDIA",
        responsavel: t.responsavel || null,
        dataPrevista: t.dataPrevista ? new Date(t.dataPrevista) : null,
        createdById: user.id,
      },
    });
    await criarCompromissosDaTarefa(tarefa, user.id).catch(() => {});
    criadas++;
    porSetor[t.setor] = (porSetor[t.setor] || 0) + 1;
  }

  await prisma.auditLog.create({ data: { userId: user.id, action: "DISTRIBUIR_TAREFAS_IA", entity: "TarefaPlanejamento", entityId: `${body.ano}-W${body.semanaIso}`, diff: { criadas, porSetor } } }).catch(() => {});

  return NextResponse.json({ success: true, criadas, porSetor });
}
