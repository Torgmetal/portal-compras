// GET /api/pcp/indicadores/iso/detalhe?indicador=&ano=&mes=
// Os LOTES que compõem o Cumprimento do Plano no período (mês, ou ano se mes=-1).
//
// ⚠ UM INDICADOR DA ISO SEM PODER ABRIR "QUAIS LOTES" É NÚMERO DE PAREDE. Quem vê 72% precisa
// chegar em qual dia e qual frente ficou para trás sem abrir outra tela — é o que transforma o
// indicador em ação, e é o que a auditoria pede como evidência.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { indicadoresPcpIso, HISTORICO_OPR } from "@/lib/indicadores-pcp-iso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fmtD = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const kg = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("pt-BR")} kg`);

export async function GET(req) {
  try { await requireRole(["ADMIN", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const url = new URL(req.url);
  const hoje = new Date();
  const ano = parseInt(url.searchParams.get("ano") || "", 10) || hoje.getUTCFullYear();
  let mes = parseInt(url.searchParams.get("mes") ?? "", 10);
  const anoTodo = mes === -1;
  if (Number.isNaN(mes) || mes < -1 || mes > 11) mes = hoje.getUTCMonth();

  // ⚠ MÊS APURADO NO OPR MOSTRA A TABELA DO OPR, não os lotes: aquele mês foi medido por setor
  // contra a meta, e listar lotes ali (que nem existiam) inventaria evidência de um período em que
  // o portal não media nada.
  const opr = HISTORICO_OPR[ano]?.[mes];
  if (!anoTodo && opr) {
    const linhas = Object.entries(opr.setores).map(([setor, [peso, meta]]) => [
      setor, kg(peso), kg(meta), `${Math.round((peso / meta) * 100)}%`,
    ]);
    const somaP = Object.values(opr.setores).reduce((s2, [p]) => s2 + p, 0);
    const somaM = Object.values(opr.setores).reduce((s2, [, t]) => s2 + t, 0);
    linhas.push(["TOTAL", kg(somaP), kg(somaM), `${Math.round((somaP / somaM) * 1000) / 10}%`.replace(".", ",")]);
    return NextResponse.json({
      colunas: ["Setor", "Realizado", "Meta", "% Avanço"],
      linhas, total: linhas.length,
      nota: `Apurado no OPR MENSAL TORG de ${opr.nome}/${ano}${opr.kgHH ? ` · ${String(opr.kgHH).replace(".", ",")} kg/HH` : ""}${opr.absGeral != null ? ` · absenteísmo geral ${opr.absGeral}%` : ""}. Medido por setor contra a meta do mês — de ago/2026 em diante a medição é por lote e por dia programado.`,
    });
  }

  const { detalhe } = await indicadoresPcpIso(prisma, ano);
  const doPeriodo = anoTodo ? detalhe : detalhe.filter((d) => new Date(`${d.dia}T12:00:00Z`).getUTCMonth() === mes);

  return NextResponse.json({
    colunas: ["Dia programado", "OP", "Frente", "Peças", "Feitas", "Programado", "Concluído", "%"],
    linhas: doPeriodo.map((d) => [
      fmtD(d.dia), `OP-${d.opNumero}`, d.frente,
      d.pecas, d.pecasFeitas, kg(d.kgPlanejado), kg(d.kgFeito),
      d.pct == null ? "—" : `${String(d.pct).replace(".", ",")}%`,
    ]),
    total: doPeriodo.length,
  });
}
