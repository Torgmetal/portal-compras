import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

// Modelo padrão de cronograma (baseado na OP-89): POR ÁREA. Cada área que o usuário informar
// ganha esta sequência (na ordem = a cadeia de antecessoras FS). Setor → Área → Tarefa. As
// durações são padrão e ficam editáveis depois. Ordem da lista = ordem do encadeamento.
const TEMPLATE_OP89 = [
  { nome: "Ordem de compra", dept: "COMERCIAL", dur: 1 },
  { nome: "Modelo", dept: "ENGENHARIA", dur: 3 },
  { nome: "Detalhamento", dept: "ENGENHARIA", dur: 3 },
  { nome: "Diagrama de Montagem", dept: "ENGENHARIA", dur: 4 },
  { nome: "Aprovação do projeto", dept: "ENGENHARIA", dur: 2 },
  { nome: "Preparação", dept: "FABRICACAO", dur: 4 },
  { nome: "Montagem", dept: "FABRICACAO", dur: 4 },
  { nome: "Solda", dept: "FABRICACAO", dur: 4 },
  { nome: "Pintura", dept: "FABRICACAO", dur: 6 },
  { nome: "Expedição", dept: "EXPEDICAO", dur: 2 },
];
const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];
const DEPT_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos", FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem" };

const createSchema = z.object({
  opNumero: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  titulo: z.string().min(1).max(200),
  dataInicio: z.string().datetime().optional(),
  dataFim: z.string().datetime().optional(),
  usarTemplate: z.boolean().default(true),
  areas: z.array(z.string().max(120)).optional(), // áreas da obra (cor fixa por ordem)
});

// Monta [{nome, cor}] sem duplicar nome (cor = ordem).
function montarAreas(nomes) {
  const vistos = new Set();
  const lista = [];
  for (const n of Array.isArray(nomes) ? nomes : []) {
    const nome = String(n || "").trim();
    const key = nome.toLowerCase();
    if (!nome || vistos.has(key)) continue;
    vistos.add(key);
    lista.push({ nome, cor: lista.length % 10 });
  }
  return lista;
}

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

  const { opNumero, titulo, dataInicio, dataFim, usarTemplate, areas } = parsed.data;

  // Permite MÚLTIPLOS cronogramas por OP (prédios/frentes/solicitações novas) —
  // como o sharepointPath é único, cada cronograma manual ganha um sufixo
  // aleatório em vez de bloquear quando a OP já tem um.
  const manualPath = `manual://${opNumero}/${randomUUID()}`;

  // Busca OP para vincular
  const opNum = opNumero.replace(/^T0*/i, "").padStart(3, "0");
  const op = await prisma.oP.findUnique({ where: { numero: opNum } })
    || await prisma.oP.findFirst({ where: { numero: { endsWith: opNum } } });

  // Monta as tarefas do modelo OP-89, uma cópia por ÁREA (Setor → Área → Tarefa). Sem áreas,
  // gera um conjunto único (sem área). O encadeamento (antecessoras) é feito depois do create,
  // quando as tarefas já têm id.
  const areasList = montarAreas(areas).map((a) => a.nome);
  const alvosAreas = areasList.length ? areasList : [null];
  const tarefas = [];
  if (usarTemplate) {
    let uid = 1;
    for (const dept of DEPT_ORDER) {
      const doDept = TEMPLATE_OP89.filter((t) => t.dept === dept);
      if (!doDept.length) continue;
      tarefas.push({ uidMpp: uid++, nome: DEPT_LABEL[dept], departamento: dept, isSummary: true, outlineLevel: 1 });
      for (const area of alvosAreas) {
        for (const t of doDept) {
          tarefas.push({ uidMpp: uid++, nome: t.nome, area: area || undefined, departamento: dept, duracaoDias: t.dur, isSummary: false, outlineLevel: 2 });
        }
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
      areas: montarAreas(areas),
      tarefas: tarefas.length > 0 ? { create: tarefas } : undefined,
    },
    include: { tarefas: true },
  });

  // Encadeia cada área na sequência do modelo (FS): tarefa[i].antecessora = tarefa[i-1] da
  // mesma área. Assim, com a data de início + "Gerar datas", o cronograma se monta sozinho.
  if (usarTemplate && areasList.length && cronograma.tarefas?.length) {
    const ordemNome = new Map(TEMPLATE_OP89.map((t, i) => [t.nome, i]));
    const criadas = cronograma.tarefas.filter((t) => !t.isSummary && t.area);
    for (const area of areasList) {
      const daArea = criadas.filter((t) => t.area === area).sort((a, b) => (ordemNome.get(a.nome) ?? 0) - (ordemNome.get(b.nome) ?? 0));
      for (let i = 1; i < daArea.length; i++) {
        await prisma.cronogramaTarefa.update({ where: { id: daArea[i].id }, data: { antecessoraIds: [daArea[i - 1].id] } });
      }
    }
  }

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

  // Agora é permitido ter mais de um cronograma por OP (prédios/frentes/novas
  // solicitações). Não excluímos mais as OPs que já têm — só informamos quantos
  // já existem, pra UI mostrar um aviso.
  const cronogramas = await prisma.cronograma.findMany({
    where: { ativo: true },
    select: { opNumero: true },
  });
  const countPorOp = {};
  for (const c of cronogramas) {
    const num = c.opNumero.replace(/^T0*/i, "").padStart(3, "0");
    countPorOp[num] = (countPorOp[num] || 0) + 1;
  }

  const ops = await prisma.oP.findMany({
    where: { status: "ABERTA" },
    select: { id: true, numero: true, cliente: true, obra: true },
    orderBy: { numero: "desc" },
  });
  const disponiveis = ops.map((op) => ({ ...op, cronogramasExistentes: countPorOp[op.numero] || 0 }));

  return NextResponse.json({ ops: disponiveis });
}
