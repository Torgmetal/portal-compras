import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

/**
 * GET /api/planejamento/cronogramas/[id]/importar-peso
 *
 * Retorna dados de peso da OP (PecaConjunto) + producao Syneco (MesOrdem)
 * para que o usuario possa distribuir nas tarefas do cronograma.
 */
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    select: {
      id: true,
      opNumero: true,
      opId: true,
      tarefas: {
        orderBy: { uidMpp: "asc" },
        select: { id: true, nome: true, departamento: true, isSummary: true, outlineLevel: true, qtdePlanejada: true, qtdeRealizada: true },
      },
    },
  });
  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  const opNum = cronograma.opNumero.replace(/^T0*/i, "").padStart(3, "0");
  const obraPattern = `T${parseInt(opNum)}`;

  // PecaConjunto — peso total e por status
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opNumero: opNum },
    select: { pesoTotalKg: true, status: true, qte: true, marca: true, descricao: true },
  });

  const pesoTotal = pecas.reduce((s, p) => s + p.pesoTotalKg, 0);
  const totalPecas = pecas.length;

  const porStatus = {};
  for (const p of pecas) {
    if (!porStatus[p.status]) porStatus[p.status] = { peso: 0, qte: 0, count: 0 };
    porStatus[p.status].peso += p.pesoTotalKg;
    porStatus[p.status].qte += p.qte;
    porStatus[p.status].count++;
  }

  // MesOrdem — producao Syneco por setor
  const mesGrupos = await prisma.mesOrdem.groupBy({
    by: ["setor"],
    where: { obra: { startsWith: obraPattern, mode: "insensitive" } },
    _sum: { pesoPlanejado: true, pesoProduzido: true },
  });

  let pesoProduzidoTotal = 0;
  const porSetorMes = {};
  for (const g of mesGrupos) {
    const setor = g.setor || "Sem setor";
    pesoProduzidoTotal += g._sum.pesoProduzido || 0;
    porSetorMes[setor] = {
      pesoPlanejado: g._sum.pesoPlanejado || 0,
      pesoProduzido: g._sum.pesoProduzido || 0,
    };
  }

  // Romaneio — peso expedido real
  const pesoExpedido = (porStatus["EXPEDIDO"]?.peso || 0);

  // Sugestao automatica: distribui peso total nas tarefas por departamento
  // FABRICACAO: todas as tarefas recebem o peso total (cada etapa processa todas as pecas)
  // EXPEDICAO: peso total (todas as pecas precisam ser expedidas)
  const sugestao = cronograma.tarefas
    .filter((t) => !t.isSummary && t.outlineLevel >= 2)
    .map((t) => {
      let pesoSugerido = 0;
      let pesoRealizado = 0;

      if (t.departamento === "FABRICACAO") {
        pesoSugerido = pesoTotal;
        pesoRealizado = pesoProduzidoTotal;
      } else if (t.departamento === "EXPEDICAO") {
        pesoSugerido = pesoTotal;
        pesoRealizado = pesoExpedido;
      }
      // COMERCIAL, ENGENHARIA, SUPRIMENTOS, MONTAGEM: sem peso automatico

      return {
        tarefaId: t.id,
        nome: t.nome,
        departamento: t.departamento,
        pesoAtual: t.qtdePlanejada,
        realizadoAtual: t.qtdeRealizada,
        pesoSugerido,
        pesoRealizado,
      };
    });

  return NextResponse.json({
    success: true,
    opNumero: opNum,
    pesoTotal,
    totalPecas,
    pesoProduzidoTotal,
    pesoExpedido,
    porStatus,
    porSetorMes,
    tarefas: cronograma.tarefas,
    sugestao,
  });
}

/**
 * POST /api/planejamento/cronogramas/[id]/importar-peso
 *
 * Aplica distribuicao de peso nas tarefas do cronograma.
 * Body: { distribuicao: [{ tarefaId, qtdePlanejada, qtdeRealizada }] }
 */
const postSchema = z.object({
  distribuicao: z.array(
    z.object({
      tarefaId: z.string(),
      qtdePlanejada: z.number().min(0),
      qtdeRealizada: z.number().min(0).optional(),
    })
  ),
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    select: { id: true, opNumero: true },
  });
  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  // Verifica que todas as tarefas pertencem a este cronograma
  const tarefaIds = parsed.data.distribuicao.map((d) => d.tarefaId);
  const tarefas = await prisma.cronogramaTarefa.findMany({
    where: { id: { in: tarefaIds }, cronogramaId: id },
    select: { id: true, nome: true, qtdePlanejada: true, qtdeRealizada: true },
  });
  const tarefaMap = Object.fromEntries(tarefas.map((t) => [t.id, t]));

  const ops = [];
  const atualizados = [];

  for (const d of parsed.data.distribuicao) {
    const tarefa = tarefaMap[d.tarefaId];
    if (!tarefa) continue;

    const updateData = { qtdePlanejada: d.qtdePlanejada };
    if (d.qtdeRealizada !== undefined) {
      updateData.qtdeRealizada = d.qtdeRealizada;
    }

    // Auto-calcula percentual se ambos tem valor
    const planejado = d.qtdePlanejada;
    const realizado = d.qtdeRealizada ?? tarefa.qtdeRealizada;
    if (planejado > 0 && realizado >= 0) {
      updateData.percentualRealizado = Math.min(100, Math.round((realizado / planejado) * 1000) / 10);
    }

    ops.push(
      prisma.cronogramaTarefa.update({ where: { id: d.tarefaId }, data: updateData })
    );

    atualizados.push({ tarefaId: d.tarefaId, nome: tarefa.nome, qtdePlanejada: d.qtdePlanejada });
  }

  if (ops.length > 0) {
    ops.push(
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "IMPORTAR_PESO_CRONOGRAMA",
          entity: "Cronograma",
          entityId: id,
          diff: { tarefas: atualizados.length, distribuicao: atualizados },
        },
      })
    );
    await prisma.$transaction(ops);
  }

  return NextResponse.json({ success: true, atualizados: atualizados.length });
}
