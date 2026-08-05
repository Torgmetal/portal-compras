// GET /api/producao/indicadores/iso/detalhe?indicador=&ano=&mes=
// Registros do período (mês, ou ano se mes=-1) que compõem um indicador ISO de Produção.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { whereSetorSyneco } from "@/lib/syneco-dia";
import { historicoProducao } from "@/lib/indicadores-producao-iso";

export const runtime = "nodejs";

const MS = 86400000;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const diasCorridos = (a, b) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS);
const kg = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("pt-BR")} kg`);

export async function GET(req) {
  try { await requireRole(["ADMIN", "PRODUCAO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const indicador = url.searchParams.get("indicador") || "";
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  const anoTodo = mes === -1;
  if (Number.isNaN(mes) || mes < -1 || mes > 11) mes = hoje.getUTCMonth();
  const yIni = new Date(Date.UTC(ano, 0, 1)), yFim = new Date(Date.UTC(ano + 1, 0, 1));
  const pIni = anoTodo ? yIni : new Date(Date.UTC(ano, mes, 1));
  const pFim = anoTodo ? yFim : new Date(Date.UTC(ano, mes + 1, 1));

  // Mês apurado na planilha da Qualidade? O valor do card vem do histórico, não do portal,
  // então os registros abaixo servem só de referência.
  const manual = anoTodo ? null : historicoProducao(indicador, ano, mes);
  const notaManual = manual == null ? "" : `Valor apurado na planilha da Qualidade: ${manual.toLocaleString("pt-BR")}%. Os registros do portal abaixo são referência. · `;

  // Cumprimento dos Prazos de Fabricação — OPs concluídas no período (prevista vs real).
  if (indicador === "prazo_fabricacao") {
    const ops = await prisma.oP.findMany({
      where: { dataFimReal: { gte: pIni, lt: pFim }, dataFimPrevista: { not: null } },
      select: { numero: true, obra: true, dataFimPrevista: true, dataFimReal: true }, orderBy: { dataFimReal: "asc" },
    });
    const linhas = ops.map((o) => {
      const atraso = diasCorridos(o.dataFimPrevista, o.dataFimReal);
      return [`OP-${o.numero}`, o.obra || "—", fmtD(o.dataFimPrevista), fmtD(o.dataFimReal), atraso <= 0 ? "No prazo" : `Atrasada ${atraso}d`];
    });
    const noPrazo = ops.filter((o) => o.dataFimReal <= o.dataFimPrevista).length;
    return NextResponse.json({ titulo: "Cumprimento dos Prazos de Fabricação", colunas: ["OP", "Obra", "Prevista", "Concluída", "Situação"], linhas, resumo: `${notaManual}${noPrazo} no prazo de ${ops.length} OP(s) concluída(s) · ${ops.length ? Math.round((noPrazo / ops.length) * 100) : 0}%` });
  }

  // Retrabalho — RNCs com disposição Retrabalhar (e peso) do período + base de produção (corte).
  if (indicador === "retrabalho") {
    const rncs = await prisma.naoConformidade.findMany({
      where: { disposicao: "RETRABALHAR", pesoRetrabalhoKg: { not: null }, data: { gte: pIni, lt: pFim } },
      select: { numero: true, ano: true, data: true, desenhoProjetoMarca: true, opNumero: true, pesoRetrabalhoKg: true },
      orderBy: { data: "asc" },
    });
    const corte = await prisma.mesApontamento.aggregate({
      where: { dataInicio: { gte: pIni, lt: pFim }, ...whereSetorSyneco("CORTE") }, _sum: { produzidoKg: true },
    });
    const prod = corte._sum.produzidoKg || 0;
    const totRt = rncs.reduce((s, r) => s + (r.pesoRetrabalhoKg || 0), 0);
    const linhas = rncs.map((r) => [
      `RNC-${String(r.numero).padStart(3, "0")}/${String(r.ano).slice(-2)}`,
      fmtD(r.data), r.desenhoProjetoMarca || "—", r.opNumero || "—", kg(r.pesoRetrabalhoKg),
    ]);
    const perc = prod > 0 ? Math.round((totRt / prod) * 1000) / 10 : null;
    return NextResponse.json({
      titulo: "Retrabalho", colunas: ["RNC", "Data", "Marca", "OP", "Peso retrabalhado"], linhas,
      resumo: `${notaManual}${kg(totRt)} retrabalhado de ${kg(prod)} produzidos (corte)${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`}`,
    });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
