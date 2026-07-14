// /api/rh/ferias
//   GET  → painel: funcionários ativos com período aquisitivo/vencimento + férias programadas
//   POST → programa férias (cria Ferias) { funcionarioId, dataInicio, diasGozo, diasVendidos, observacao }
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { periodoAtual, valorFerias, fimGozo, periodoIndiceDe, periodosUsados } from "@/lib/ferias-calc";
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
    // Só CLT e sem cargos de diretoria — férias (CLT) não se aplica a PJ nem a
    // diretores/sócios.
    where: {
      ativo: true,
      tipoContrato: "CLT",
      NOT: { cargo: { nome: { contains: "diretor", mode: "insensitive" } } },
    },
    select: {
      id: true, nome: true, matricula: true, empresa: true, salario: true, dataAdmissao: true,
      setor: { select: { nome: true, sigla: true } },
      ferias: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { nome: "asc" },
  });

  let linhas = funcs.map((f) => {
    // Período atual = admissão + nº de períodos aquisitivos já consumidos. Uma
    // férias retroativa (início antigo) avança direto pro período dela — tudo
    // antes dela conta como gozado. Ver periodosUsados/periodoIndiceDe.
    const usadas = periodosUsados(f.dataAdmissao, f.ferias);
    const periodo = periodoAtual(f.dataAdmissao, usadas);
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

// Campos numéricos robustos: número vazio/NaN/fora de faixa vira default seguro
// (evita "Invalid input: expected number, received NaN" ao lançar, sobretudo
// férias retroativas em que o RH mexe nos campos).
const fin = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const schema = z.object({
  funcionarioId: z.string().min(1),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de início inválida"),
  diasGozo: z.preprocess((v) => { const n = Math.trunc(fin(v, 30)); return n >= 1 && n <= 30 ? n : 30; }, z.number().int().min(1).max(30)).default(30),
  diasVendidos: z.preprocess((v) => { const n = Math.trunc(fin(v, 0)); return n >= 0 && n <= 10 ? n : 0; }, z.number().int().min(0).max(10)).default(0),
  descontos: z.preprocess((v) => Math.max(0, fin(v, 0)), z.number().min(0)).default(0),
  salarioBase: z.preprocess((v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v)), z.number().min(0).nullable()).default(null), // override manual; inválido → usa o do cadastro
  status: z.enum(["PROGRAMADA", "GOZADA"]).default("PROGRAMADA"),
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
  const { funcionarioId, dataInicio, diasGozo, diasVendidos, descontos, salarioBase, status, observacao } = parsed.data;
  if (diasGozo + diasVendidos > 30) return NextResponse.json({ success: false, error: "Gozo + vendidos não pode passar de 30 dias" }, { status: 400 });

  try {
    const func = await prisma.funcionario.findUnique({
      where: { id: funcionarioId },
      select: { id: true, salario: true, dataAdmissao: true },
    });
    if (!func) return NextResponse.json({ success: false, error: "Funcionário não encontrado" }, { status: 404 });
    if (!func.dataAdmissao) return NextResponse.json({ success: false, error: "Funcionário sem data de admissão — preencha o cadastro antes de lançar férias." }, { status: 400 });

    // Base do cálculo = override manual do RH (se informado) ou o salário do cadastro.
    const base = salarioBase != null ? salarioBase : func.salario;

    // Período aquisitivo DESTA férias = aquele em que o início do gozo cai (não o
    // "atual"). Assim uma férias retroativa fica rotulada com o período certo e,
    // no painel, as anteriores a ela passam a contar como já gozadas.
    const idx = periodoIndiceDe(func.dataAdmissao, dataInicio);
    const periodo = periodoAtual(func.dataAdmissao, idx);
    const fim = fimGozo(dataInicio, diasGozo);
    const valor = valorFerias(base, diasGozo, diasVendidos, descontos).total;

    const ferias = await prisma.ferias.create({
      data: {
        funcionarioId,
        periodoAquisInicio: new Date(periodo.aquisInicio),
        periodoAquisFim: new Date(periodo.aquisFim),
        dataInicio: new Date(dataInicio),
        dataFim: fim ? new Date(fim) : new Date(dataInicio),
        diasGozo, diasVendidos, descontos, valorEstimado: Number.isFinite(valor) ? valor : 0,
        periodoIndice: idx,
        status, observacao: observacao || null,
      },
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: "PROGRAMAR_FERIAS", entity: "Ferias", entityId: ferias.id, diff: { funcionarioId, dataInicio, diasGozo, diasVendidos, descontos, salarioBase: base, status, valor, periodoIndice: idx } },
    }).catch(() => {});

    return NextResponse.json({ success: true, ferias });
  } catch (e) {
    // Surfacia a causa real em vez de um 500 opaco (que aparecia como "INVALID").
    return NextResponse.json({ success: false, error: `Não foi possível salvar as férias: ${e?.message || "erro desconhecido"}` }, { status: 500 });
  }
}
