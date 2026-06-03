import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

const TEMPLATE_DEPARTAMENTOS = [
  { dept: "COMERCIAL", tarefas: ["Contrato assinado", "Ordem de serviço emitida", "Medição programada"] },
  { dept: "ENGENHARIA", tarefas: ["Projeto básico", "Projeto executivo", "Detalhamento / Lista de materiais", "Aprovação do cliente"] },
  { dept: "SUPRIMENTOS", tarefas: ["Emissão de RMs", "Cotação de materiais", "Pedidos de compra", "Recebimento de materiais"] },
  { dept: "FABRICACAO", tarefas: ["Preparação / Corte", "Montagem / Soldagem", "Tratamento superficial", "Pintura", "Inspeção final"] },
  { dept: "EXPEDICAO", tarefas: ["Embalagem / Preparação de carga", "Transporte", "Entrega na obra"] },
  { dept: "MONTAGEM", tarefas: ["Mobilização de equipe", "Montagem em campo", "Torque / Acabamento", "Desmobilização"] },
];

const createSchema = z.object({
  opNumero: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  titulo: z.string().min(1).max(200),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
  usarTemplate: z.boolean().default(true),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { opNumero, titulo, dataInicio, dataFim, usarTemplate } = parsed.data;

  // Verifica se já existe cronograma para essa OP (criado manualmente)
  const manualPath = `manual://${opNumero}`;
  const existente = await prisma.cronograma.findFirst({
    where: { opNumero, ativo: true },
  });
  if (existente) {
    return NextResponse.json(
      { success: false, error: `Já existe um cronograma para a OP ${opNumero}` },
      { status: 409 }
    );
  }

  // Busca OP para vincular
  const opNum = opNumero.replace(/^T0*/i, "").padStart(3, "0");
  const op = await prisma.oP.findUnique({ where: { numero: opNum } })
    || await prisma.oP.findFirst({ where: { numero: { endsWith: opNum } } });

  // Monta tarefas do template
  const tarefas = [];
  if (usarTemplate) {
    let uid = 1;
    for (const grupo of TEMPLATE_DEPARTAMENTOS) {
      // Summary do departamento (nível 1)
      tarefas.push({
        uidMpp: uid++,
        nome: grupo.dept.charAt(0) + grupo.dept.slice(1).toLowerCase(),
        departamento: grupo.dept,
        isSummary: true,
        outlineLevel: 1,
        dataInicioPrevista: dataInicio ? new Date(dataInicio) : null,
        dataFimPrevista: dataFim ? new Date(dataFim) : null,
      });
      // Tarefas do departamento (nível 2)
      for (const nome of grupo.tarefas) {
        tarefas.push({
          uidMpp: uid++,
          nome,
          departamento: grupo.dept,
          isSummary: false,
          outlineLevel: 2,
        });
      }
    }
  }

  const cronograma = await prisma.cronograma.create({
    data: {
      opNumero,
      opId: op?.id || null,
      nomeArquivo: "manual",
      titulo,
      sharepointPath: manualPath,
      dataInicio: dataInicio ? new Date(dataInicio) : null,
      dataFim: dataFim ? new Date(dataFim) : null,
      tarefas: tarefas.length > 0 ? { create: tarefas } : undefined,
    },
    include: { tarefas: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "CREATE_CRONOGRAMA_MANUAL",
      entity: "Cronograma",
      entityId: cronograma.id,
      diff: { opNumero, titulo, tarefas: tarefas.length },
    },
  });

  return NextResponse.json({ success: true, cronograma });
}

// GET /api/planejamento/cronogramas/manual — lista OPs disponíveis para criar cronograma
export async function GET() {
  try {
    await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  // OPs ativas que ainda não têm cronograma
  const opsComCronograma = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: { opNumero: true },
  });
  const opsComCronogramaSet = new Set(opsComCronograma.map((c) => c.opNumero));

  const ops = await prisma.oP.findMany({
    where: { status: "ABERTA" },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
  });

  // Filtra OPs que já têm cronograma (considerando formato T001 vs 001)
  const disponiveis = ops.filter((op) => {
    const tNum = `T${op.numero}`;
    return !opsComCronogramaSet.has(op.numero) && !opsComCronogramaSet.has(tNum);
  });

  return NextResponse.json({ ops: disponiveis, template: TEMPLATE_DEPARTAMENTOS });
}
