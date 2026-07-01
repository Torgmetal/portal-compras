// /api/rh/ferias
//   GET  → painel: funcionários ativos com período aquisitivo/vencimento + férias programadas
//   POST → programa férias (cria Ferias) { funcionarioId, dataInicio, diasGozo, diasVendidos, observacao }
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { periodoAtual, valorFerias, fimGozo } from "@/lib/ferias-calc";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const ORDEM_SIT = { VENCIDA: 0, A_GOZAR: 1, EM_AQUISICAO: 2 };

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const filtroSit = new URL(req.url).searchParams.get("situacao");

  const funcs = await prisma.funcionario.findMany({
    where: { ativo: true },
    select: {
      id: true, nome: true, matricula: true, empresa: true, salario: true, dataAdmissao: true,
      setor: { select: { nome: true, sigla: true } },
      ferias: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { nome: "asc" },
  });

  let linhas = funcs.map((f) => {
    const periodo = periodoAtual(f.dataAdmissao, f.ferias.length);
    return {
      id: f.id, nome: f.nome, matricula: f.matricula, empresa: f.empresa,
      setor: f.setor?.sigla || f.setor?.nome || null,
      dataAdmissao: f.dataAdmissao, salario: f.salario,
      periodo,
      valorEstimado30: valorFerias(f.salario, 30, 0).total,
      ferias: f.ferias,
    };
  });

  if (filtroSit) linhas = linhas.filter((l) => l.periodo?.situacao === filtroSit);
  linhas.sort((a, b) =>
    (ORDEM_SIT[a.periodo?.situacao] ?? 9) - (ORDEM_SIT[b.periodo?.situacao] ?? 9) ||
    (a.periodo?.diasParaVencer ?? 1e9) - (b.periodo?.diasParaVencer ?? 1e9));

  const resumo = { VENCIDA: 0, A_GOZAR: 0, EM_AQUISICAO: 0 };
  for (const l of linhas) if (l.periodo) resumo[l.periodo.situacao]++;

  return NextResponse.json({ success: true, linhas, resumo });
}

const schema = z.object({
  funcionarioId: z.string().min(1),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de início inválida"),
  diasGozo: z.number().int().min(1).max(30).default(30),
  diasVendidos: z.number().int().min(0).max(10).default(0),
  observacao: z.string().max(500).optional().nullable(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const { funcionarioId, dataInicio, diasGozo, diasVendidos, observacao } = parsed.data;
  if (diasGozo + diasVendidos > 30) return NextResponse.json({ success: false, error: "Gozo + vendidos não pode passar de 30 dias" }, { status: 400 });

  const func = await prisma.funcionario.findUnique({
    where: { id: funcionarioId },
    select: { id: true, salario: true, dataAdmissao: true, _count: { select: { ferias: true } } },
  });
  if (!func) return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });

  const periodo = periodoAtual(func.dataAdmissao, func._count.ferias);
  const valor = valorFerias(func.salario, diasGozo, diasVendidos).total;

  const ferias = await prisma.ferias.create({
    data: {
      funcionarioId,
      periodoAquisInicio: new Date(periodo.aquisInicio),
      periodoAquisFim: new Date(periodo.aquisFim),
      dataInicio: new Date(dataInicio),
      dataFim: new Date(fimGozo(dataInicio, diasGozo)),
      diasGozo, diasVendidos, valorEstimado: valor,
      status: "PROGRAMADA", observacao: observacao || null,
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "PROGRAMAR_FERIAS", entity: "Ferias", entityId: ferias.id, diff: { funcionarioId, dataInicio, diasGozo, diasVendidos, valor } },
  }).catch(() => {});

  return NextResponse.json({ success: true, ferias });
}
