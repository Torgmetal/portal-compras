import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "PRODUCAO", "COMERCIAL", "COMPRAS"]);
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : e.message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }

  const url = new URL(req.url);
  const setor = url.searchParams.get("setor");
  const mesParam = url.searchParams.get("mes");

  const now = new Date();
  let ano = now.getFullYear();
  let mes = now.getMonth() + 1;
  if (mesParam) {
    const [a, m] = mesParam.split("-").map(Number);
    if (a && m) { ano = a; mes = m; }
  }
  const inicioMes = new Date(ano, mes - 1, 1);
  const fimMes = new Date(ano, mes, 0, 23, 59, 59);

  const statusAgg = await prisma.pecaConjunto.groupBy({
    by: ["status"],
    _count: true,
    _sum: { pesoTotalKg: true, qte: true },
  });

  // Contagem de peças com mais de 1 dia no setor (para alertas no mapa)
  const umDiaAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const alertasPorStatus = await prisma.pecaConjunto.groupBy({
    by: ["status"],
    where: {
      status: { notIn: ["PENDENTE", "EXPEDIDO"] },
      atualizadoEm: { lt: umDiaAtras },
    },
    _count: true,
    _sum: { qte: true },
  });

  const metas = await prisma.meta.findMany({
    where: { modulo: "PRODUCAO", tipo: "PESO_KG", ano, mes },
  });

  const realizadoMes = await prisma.producaoDiaria.groupBy({
    by: ["setor"],
    where: { data: { gte: inicioMes, lte: fimMes } },
    _sum: { pesoRealizadoKg: true },
  });

  let pecas = [];
  if (setor) {
    pecas = await prisma.pecaConjunto.findMany({
      where: { status: setor },
      select: {
        id: true, opNumero: true, marca: true, descricao: true,
        qte: true, pesoUnitKg: true, pesoTotalKg: true, status: true,
        fluxoEspecial: true, dataPrevista: true, atualizadoEm: true,
        ultimoSetor: true, dataProducao: true,
        op: { select: { numero: true, cliente: true, obra: true } },
      },
      orderBy: [{ opNumero: "asc" }, { marca: "asc" }],
      take: 1000,
    });
  }

  // Mapear alertas por status
  const alertasMap = {};
  for (const a of alertasPorStatus) {
    alertasMap[a.status] = { count: a._count, qtd: a._sum.qte || 0 };
  }

  return NextResponse.json({
    statusAgg: statusAgg.map((s) => ({
      status: s.status,
      count: s._count,
      qtd: s._sum.qte || 0,
      pesoKg: s._sum.pesoTotalKg || 0,
      alertas: alertasMap[s.status] || null,
    })),
    metas: metas.map((m) => ({ setor: m.setor, valorMensal: m.valorMensal })),
    realizadoMes: realizadoMes.map((r) => ({
      setor: r.setor,
      realizadoKg: r._sum.pesoRealizadoKg || 0,
    })),
    pecas,
    periodo: { ano, mes },
  });
}
