// GET /api/producao/indicadores/iso/detalhe?indicador=&ano=&mes=
// Registros do período (mês, ou ano se mes=-1) que compõem um indicador ISO de Produção.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { historicoProducao } from "@/lib/indicadores-producao-iso";
import { pesoRealPecas } from "@/lib/peso-op";

export const runtime = "nodejs";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
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

  // Cumprimento dos Prazos de Fabricação — planejado (peso das OPs previstas p/ o período) vs
  // realizado (peso expedido nos romaneios). % = expedido ÷ planejado.
  if (indicador === "prazo_fabricacao") {
    const ops = await prisma.oP.findMany({
      where: { dataFimPrevista: { gte: pIni, lt: pFim } },
      select: { id: true, numero: true, obra: true, dataFimPrevista: true, pecasConjunto: { select: { fonte: true, tipoPeca: true, pesoTotalKg: true } } },
      orderBy: { dataFimPrevista: "asc" },
    });
    const les = ops.length ? await prisma.listaExpedicao.findMany({ where: { opId: { in: ops.map((o) => o.id) } }, select: { opId: true, pesoContratado: true } }) : [];
    const contratado = new Map(les.map((l) => [l.opId, l.pesoContratado || 0]));
    let planTot = 0, semPeso = 0;
    const linhas = ops.map((o) => {
      const daLista = pesoRealPecas(o.pecasConjunto);
      const peso = daLista || contratado.get(o.id) || 0; planTot += peso; if (peso === 0) semPeso += 1;
      const marca = daLista ? "" : peso ? " (contratado)" : "";
      return [`OP-${o.numero}`, o.obra || "—", fmtD(o.dataFimPrevista), peso === 0 ? "— (sem peso)" : kg(peso) + marca];
    });
    const roms = await prisma.romaneioPrevio.aggregate({ where: { emitidoEm: { gte: pIni, lt: pFim } }, _sum: { pesoKg: true } });
    const expTot = roms._sum.pesoKg || 0;
    const perc = planTot > 0 ? Math.round((expTot / planTot) * 1000) / 10 : null;
    const avisoLista = semPeso ? ` · ${semPeso} OP(s) sem peso (sem LE/LPC nem contratado na Lista de Expedição)` : "";
    return NextResponse.json({
      titulo: "Cumprimento dos Prazos de Fabricação", colunas: ["OP", "Obra", "Previsão", "Peso planejado"], linhas,
      resumo: `${notaManual}${kg(expTot)} expedido de ${kg(planTot)} planejados (${ops.length} OP prevista(s))${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`}${avisoLista}`,
    });
  }

  // Retrabalho — apontamentos (FORM 34) + RNCs sem apontamento, repartidos POR SETOR.
  //
  // ⚠⚠ A TABELA É POR SETOR, não uma lista de ocorrências. Vitor (27/08/2026): "nos indicadores
  // desses setores colocar essa informação". Uma lista de 36 linhas de outubro não responde "qual
  // setor gerou o retrabalho do mês" — a tabela por setor responde, e a lista fica no detalhe.
  //
  // ⚠ A COBERTURA VAI JUNTO. Sem peso não há percentual: em janeiro/2026 só 1 dos 8 apontamentos
  // tinha peso, e um "0,4%" sem essa ressalva se lê como um mês excelente.
  if (indicador === "retrabalho") {
    const { retrabalhoDoAno, SETORES_RETRABALHO } = await import("@/lib/retrabalho");
    const dados = await retrabalhoDoAno(prisma, ano);
    const meses = anoTodo ? [...Array(12).keys()] : [mes];
    const somaMeses = (v) => meses.reduce((t, m) => t + (v[m] || 0), 0);

    const prod = somaMeses(dados.producao);
    const totRt = somaMeses(dados.totalKg);
    const linhas = SETORES_RETRABALHO
      .map((st) => ({ st, kgSetor: somaMeses(dados.porSetor[st.id]) }))
      .filter((x) => x.kgSetor > 0)
      .sort((a, b) => b.kgSetor - a.kgSetor)
      .map(({ st, kgSetor }) => [
        st.nome,
        String(dados.registros.filter((r) => r.setor === st.id && meses.includes(r.mes)).length),
        kg(kgSetor),
        prod > 0 ? `${(Math.round((kgSetor / prod) * 1000) / 10).toLocaleString("pt-BR")}%` : "—",
      ]);
    const semSetor = somaMeses(dados.semSetor);
    if (semSetor > 0) linhas.push(["Sem setor identificado", "—", kg(semSetor), prod > 0 ? `${(Math.round((semSetor / prod) * 1000) / 10).toLocaleString("pt-BR")}%` : "—"]);

    const n = meses.reduce((t, m) => t + (dados.qtd[m] || 0), 0);
    const nPeso = meses.reduce((t, m) => t + (dados.qtdComPeso[m] || 0), 0);
    const perc = prod > 0 ? Math.round((totRt / prod) * 1000) / 10 : null;
    const cobertura = n > 0 && nPeso < n
      ? ` · ⚠ ${nPeso} de ${n} apontamentos com peso — o percentual cobre só esses`
      : "";
    return NextResponse.json({
      titulo: "Retrabalho por setor", colunas: ["Setor", "Apontamentos", "Peso retrabalhado", "% da produção"], linhas,
      resumo: `${notaManual}${kg(totRt)} retrabalhado de ${kg(prod)} produzidos (corte)${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`}${cobertura}`,
    });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
