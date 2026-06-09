// GET /api/producao/controle/apontamentos-dia?data=2026-06-09
// Retorna apontamentos do Syneco para o dia selecionado + metas do mês.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try { await requireUser(); } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dataStr = url.searchParams.get("data") || new Date().toISOString().slice(0, 10);

  // Limites do dia no fuso de Brasília (UTC-3)
  const inicioDia = new Date(dataStr + "T00:00:00.000-03:00");
  const fimDia   = new Date(dataStr + "T23:59:59.999-03:00");

  // Mês/ano para buscar metas
  // Usar o dataStr diretamente para evitar confusão de timezone
  const [anoStr, mesStr] = dataStr.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const inicioMes = new Date(`${ano}-${mesStr}-01T00:00:00.000-03:00`);
  const ultimoDia = new Date(ano, mes, 0).getDate(); // último dia do mês
  const fimMes = new Date(`${ano}-${mesStr}-${String(ultimoDia).padStart(2, "0")}T23:59:59.999-03:00`);

  // 1) Apontamentos do dia (MesApontamento)
  const apontamentos = await prisma.mesApontamento.findMany({
    where: { dataInicio: { gte: inicioDia, lte: fimDia } },
    orderBy: { dataInicio: "desc" },
    select: {
      id: true,
      dataInicio: true,
      dataFim: true,
      obra: true,
      setor: true,
      maquina: true,
      operacao: true,
      descricaoItem: true,
      operador: true,
      status: true,
      produzidoKg: true,
      produzidoUn: true,
      rejeitado: true,
      retrabalhado: true,
    },
  });

  // 2) Metas do mês (Meta model — configurada no admin)
  const metas = await prisma.meta.findMany({
    where: { modulo: "PRODUCAO", tipo: "PESO_KG", ano, mes },
    select: { setor: true, valorMensal: true, semana1: true, semana2: true, semana3: true, semana4: true, semana5: true },
  });

  // 3) Realizado do mês (acumulado do Syneco)
  const realizadoMes = await prisma.mesApontamento.groupBy({
    by: ["setor"],
    where: { dataInicio: { gte: inicioMes, lte: fimMes } },
    _sum: { produzidoKg: true, produzidoUn: true },
    _count: true,
  });

  // 4) Resumo do dia por setor
  const SETORES = ["CORTE", "MONTAGEM", "SOLDA", "ACABAMENTO", "JATO", "PINTURA", "EXPEDICAO"];
  const normalize = (s) => {
    if (!s) return null;
    const up = s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
    // Mapeia variações do Syneco para setores do portal
    if (up.includes("CORTE") || up.includes("SERRA") || up.includes("PLASMA") || up.includes("OXICO")) return "CORTE";
    if (up.includes("MONTAG")) return "MONTAGEM";
    if (up.includes("SOLDA") || up.includes("MIG") || up.includes("MAG") || up.includes("TIG")) return "SOLDA";
    if (up.includes("ACABAMENTO") || up.includes("ESMERIL") || up.includes("LIXAMENTO")) return "ACABAMENTO";
    if (up.includes("JATO") || up.includes("GRANALHA")) return "JATO";
    if (up.includes("PINTURA") || up.includes("PRIMER")) return "PINTURA";
    if (up.includes("EXPEDICAO") || up.includes("EXPEDIDO") || up.includes("CARREGAMENTO")) return "EXPEDICAO";
    return up; // retorna original se não mapear
  };

  const resumoDia = {};
  for (const s of SETORES) resumoDia[s] = { totalKg: 0, totalUn: 0, count: 0 };

  for (const a of apontamentos) {
    const setorNorm = normalize(a.setor);
    if (setorNorm && resumoDia[setorNorm]) {
      resumoDia[setorNorm].totalKg += a.produzidoKg || 0;
      resumoDia[setorNorm].totalUn += a.produzidoUn || 0;
      resumoDia[setorNorm].count++;
    }
  }

  // Monta metas indexadas por setor
  const metasMap = {};
  for (const m of metas) {
    metasMap[m.setor] = {
      valorMensal: m.valorMensal,
      semana1: m.semana1, semana2: m.semana2, semana3: m.semana3,
      semana4: m.semana4, semana5: m.semana5,
    };
  }

  // Realizado do mês indexado por setor
  const realizadoMap = {};
  for (const r of realizadoMes) {
    const setorNorm = normalize(r.setor);
    if (setorNorm) {
      if (!realizadoMap[setorNorm]) realizadoMap[setorNorm] = { kg: 0, un: 0, count: 0 };
      realizadoMap[setorNorm].kg += r._sum.produzidoKg || 0;
      realizadoMap[setorNorm].un += r._sum.produzidoUn || 0;
      realizadoMap[setorNorm].count += r._count || 0;
    }
  }

  // Dias úteis no mês (aprox — seg a sex, sem feriados)
  const diasUteis = (() => {
    let count = 0;
    const d = new Date(ano, mes - 1, 1);
    while (d.getMonth() === mes - 1) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) count++;
      d.setDate(d.getDate() + 1);
    }
    return count || 22;
  })();

  return NextResponse.json({
    data: dataStr,
    apontamentos: apontamentos.map((a) => ({
      ...a,
      setorNormalizado: normalize(a.setor),
    })),
    resumoDia,
    metas: metasMap,
    realizadoMes: realizadoMap,
    diasUteis,
  });
}
