// GET /api/producao/indicadores/iso/detalhe?indicador=&ano=&mes=
// Registros do período (mês, ou ano se mes=-1) que compõem um indicador ISO de Produção.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const runtime = "nodejs";

const MS = 86400000;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const diasCorridos = (a, b) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / MS);

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
    return NextResponse.json({ titulo: "Cumprimento dos Prazos de Fabricação", colunas: ["OP", "Obra", "Prevista", "Concluída", "Situação"], linhas, resumo: `${noPrazo} no prazo de ${ops.length} OP(s) concluída(s) · ${ops.length ? Math.round((noPrazo / ops.length) * 100) : 0}%` });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
