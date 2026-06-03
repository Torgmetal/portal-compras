import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

/**
 * GET /api/planejamento/cronogramas/[id]/peso
 *
 * Retorna progresso baseado em peso real da producao (Syneco) e expedicao
 * para um cronograma especifico. Dados:
 *
 * - pesoTotal: soma PecaConjunto.pesoTotalKg da OP
 * - pesoProduzido: soma MesOrdem.pesoProduzido da obra (Syneco)
 * - pesoExpedido: soma PecaConjunto.pesoTotalKg onde status=EXPEDIDO
 * - porSetor: distribuicao por status (PecaConjunto) e por setor MES
 * - porEtapa: progresso mapeado para etapas do cronograma (FABRICACAO, EXPEDICAO)
 */
export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "PLANEJAMENTO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "EXPEDICAO"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }

  const { id } = await params;

  const cronograma = await prisma.cronograma.findUnique({
    where: { id },
    select: { id: true, opNumero: true, opId: true },
  });
  if (!cronograma) {
    return NextResponse.json({ success: false, error: "Cronograma nao encontrado" }, { status: 404 });
  }

  // Formata o numero da obra no padrao Syneco (T001, T002...)
  const opNum = cronograma.opNumero.replace(/^T0*/i, "").padStart(3, "0");
  const obraPattern = `T${parseInt(opNum)}`;

  // 1) Peso total e distribuicao por status (PecaConjunto)
  const pecas = await prisma.pecaConjunto.findMany({
    where: { opNumero: opNum },
    select: { pesoTotalKg: true, status: true, qte: true },
  });

  const pesoTotal = pecas.reduce((s, p) => s + p.pesoTotalKg, 0);
  const totalPecas = pecas.length;
  const totalQte = pecas.reduce((s, p) => s + p.qte, 0);

  const porStatus = {};
  for (const p of pecas) {
    if (!porStatus[p.status]) porStatus[p.status] = { peso: 0, qte: 0, count: 0 };
    porStatus[p.status].peso += p.pesoTotalKg;
    porStatus[p.status].qte += p.qte;
    porStatus[p.status].count++;
  }

  const pesoExpedido = porStatus["EXPEDIDO"]?.peso || 0;

  // 2) Producao Syneco (MesOrdem) — agrupado por setor
  const mesGrupos = await prisma.mesOrdem.groupBy({
    by: ["setor"],
    where: { obra: { startsWith: obraPattern, mode: "insensitive" } },
    _sum: { pesoPlanejado: true, pesoProduzido: true, saldoRestante: true, produzidoUn: true, planejadoUn: true },
    _count: { id: true },
  });

  let pesoProduzidoMes = 0;
  let pesoPlanejadoMes = 0;
  const porSetorMes = {};
  for (const g of mesGrupos) {
    const setor = g.setor || "Sem setor";
    pesoProduzidoMes += g._sum.pesoProduzido || 0;
    pesoPlanejadoMes += g._sum.pesoPlanejado || 0;
    porSetorMes[setor] = {
      pesoPlanejado: g._sum.pesoPlanejado || 0,
      pesoProduzido: g._sum.pesoProduzido || 0,
      saldoRestante: g._sum.saldoRestante || 0,
      produzidoUn: g._sum.produzidoUn || 0,
      planejadoUn: g._sum.planejadoUn || 0,
      ordens: g._count.id || 0,
    };
  }

  // 3) Romaneios expedidos (peso real embarcado)
  const romaneios = cronograma.opId
    ? await prisma.romaneio.findMany({
        where: { opId: cronograma.opId },
        select: { pesoRealKg: true, data: true, numero: true },
        orderBy: { data: "desc" },
      })
    : [];
  const pesoRomaneio = romaneios.reduce((s, r) => s + r.pesoRealKg, 0);

  // 4) Progresso por etapa do cronograma
  // FABRICACAO: baseado na producao Syneco vs peso total
  // EXPEDICAO: baseado no peso expedido (PecaConjunto status=EXPEDIDO) vs peso total
  const porEtapa = {
    FABRICACAO: {
      pesoReferencia: pesoTotal,
      pesoRealizado: pesoProduzidoMes,
      percentual: pesoTotal > 0 ? Math.round((pesoProduzidoMes / pesoTotal) * 1000) / 10 : 0,
      fonte: "Syneco (MesOrdem)",
    },
    EXPEDICAO: {
      pesoReferencia: pesoTotal,
      pesoRealizado: pesoExpedido,
      pesoEmbarcado: pesoRomaneio,
      percentual: pesoTotal > 0 ? Math.round((pesoExpedido / pesoTotal) * 1000) / 10 : 0,
      fonte: "PecaConjunto + Romaneio",
    },
  };

  return NextResponse.json({
    success: true,
    opNumero: opNum,
    pesoTotal,
    totalPecas,
    totalQte,
    pesoProduzidoMes,
    pesoPlanejadoMes,
    pesoExpedido,
    pesoRomaneio,
    porStatus,
    porSetorMes,
    porEtapa,
    romaneiosRecentes: romaneios.slice(0, 5),
    progressoGeral: pesoTotal > 0 ? Math.round((pesoExpedido / pesoTotal) * 1000) / 10 : 0,
  });
}
