// GET /api/engenharia/indicadores/iso/detalhe?indicador=&ano=&mes=
// Os registros do período (mês, ou o ano com mes=-1) que compõem cada indicador da Engenharia.
//
// ⚠ Indicador que não se abre não se discute na reunião: cada card tem de mostrar DE ONDE saiu o
// número — peça a peça, RNC a RNC, tarefa a tarefa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { retrabalhoDoAno, SETOR_RETRABALHO } from "@/lib/retrabalho";
import { EH_RNC_DE_PROJETO } from "@/lib/indicadores-engenharia-iso";

export const runtime = "nodejs";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const kg = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("pt-BR")} kg`);
const num = (n) => (n == null ? "—" : n.toLocaleString("pt-BR"));

export async function GET(req) {
  try { await requireRole(["ADMIN", "ENGENHARIA", "QUALIDADE"]); }
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

  // ── RETRABALHO DA ENGENHARIA — peça a peça, como o Vitor definiu (28/08/2026): "somado de acordo
  // com as peças que forem abertas RNC e que for de responsabilidade da engenharia".
  if (indicador === "retrabalho_engenharia") {
    const dados = await retrabalhoDoAno(prisma, ano);
    const meses = anoTodo ? [...Array(12).keys()] : [mes];
    const somaMeses = (v) => meses.reduce((t, m) => t + (v[m] || 0), 0);
    const daEng = dados.registros.filter((r) => meses.includes(r.mes) && SETOR_RETRABALHO[r.setor]?.processo === "ENGENHARIA");

    const linhas = daEng
      .sort((a, b) => new Date(a.data) - new Date(b.data))
      .map((r) => [
        fmtD(r.data),
        r.numeroRnc ? `RNC ${String(r.numeroRnc).replace(/[_-]/g, "/")}` : "apontamento",
        r.opNumero ? `OP-${String(r.opNumero).replace(/^0+/, "").padStart(3, "0")}` : "—",
        r.marca || "—",
        r.qtdPecas ? num(r.qtdPecas) : "—",
        r.kg > 0 ? kg(r.kg) + (r.estimado ? " (estimado)" : "") : "— (sem peso)",
        r.descricao || "—",
      ]);

    const pesoEng = somaMeses(dados.porSetor.ENGENHARIA ?? []) ||
      daEng.reduce((t, r) => t + (r.kg || 0), 0);
    const producao = somaMeses(dados.producao);
    const perc = producao > 0 ? Math.round((pesoEng / producao) * 1000) / 10 : null;
    const semPeso = daEng.filter((r) => !(r.kg > 0)).length;
    // ⚠ a cobertura vai junto: sem peso não há percentual, e um índice baixo por falta de dado se
    // lê como um mês excelente.
    const aviso = semPeso ? ` · ⚠ ${semPeso} registro(s) sem peso — o percentual cobre só os demais` : "";
    return NextResponse.json({
      titulo: "Retrabalho gerado pela Engenharia",
      colunas: ["Data", "Registro", "OP", "Marca / desenho", "Peças", "Peso", "Descrição"],
      linhas,
      resumo: `${kg(pesoEng)} retrabalhados por erro de projeto${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`} de ${kg(producao)} produzidos (corte) · ${daEng.length} registro(s)${aviso}`,
    });
  }

  // ── ERROS DE PROJETO — as RNCs cuja área é Engenharia/Projeto.
  if (indicador === "erros_projeto") {
    const rncs = await prisma.naoConformidade.findMany({
      where: { data: { gte: pIni, lt: pFim } },
      select: { numero: true, ano: true, data: true, opNumero: true, cliente: true, processoArea: true, desenhoProjetoMarca: true, descricao: true, disposicao: true, status: true },
      orderBy: { data: "asc" },
    });
    const doProjeto = rncs.filter((r) => EH_RNC_DE_PROJETO.test(r.processoArea || ""));
    const linhas = doProjeto.map((r) => [
      `RNC ${r.numero}/${r.ano}`, fmtD(r.data),
      r.opNumero ? `OP-${r.opNumero}` : "—", r.desenhoProjetoMarca || "—",
      r.descricao || "—", r.disposicao || "—", r.status || "—",
    ]);
    return NextResponse.json({
      titulo: "Erros de Projeto (RNC)",
      colunas: ["RNC", "Data", "OP", "Marca / desenho", "Descrição", "Disposição", "Status"],
      linhas,
      resumo: `${doProjeto.length} RNC(s) de Engenharia/Projeto no período (meta 0)`,
    });
  }

  // ── ADERÊNCIA AO PRAZO — tarefas de Engenharia concluídas no período.
  if (indicador === "aderencia_prazo_projeto") {
    // ⚠ a OP não está na tarefa: vem do cronograma dono dela.
    const tar = await prisma.cronogramaTarefa.findMany({
      where: { departamento: "ENGENHARIA", dataFimReal: { gte: pIni, lt: pFim }, dataFimPrevista: { not: null } },
      select: { nome: true, dataFimPrevista: true, dataFimBase: true, dataFimReal: true, cronograma: { select: { opNumero: true } } },
      orderBy: { dataFimReal: "asc" },
    });
    const dias = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
    const linhas = tar.map((t) => {
      const atraso = dias(t.dataFimReal, t.dataFimPrevista);
      return [
        t.cronograma?.opNumero ? `OP-${t.cronograma.opNumero}` : "—", t.nome || "—",
        fmtD(t.dataFimPrevista),
        // ⚠ a data BASE (o combinado original) vai ao lado: o previsto se move quando o cronograma é
        // replanejado, e sem ver as duas não dá para saber se a tarefa cumpriu o prazo ou se o prazo
        // é que andou até ela.
        t.dataFimBase ? fmtD(t.dataFimBase) : "—",
        fmtD(t.dataFimReal),
        atraso <= 0 ? "No prazo" : `${atraso} dia(s) de atraso`,
      ];
    });
    const noPrazo = tar.filter((t) => new Date(t.dataFimReal) <= new Date(t.dataFimPrevista)).length;
    const perc = tar.length ? Math.round((noPrazo / tar.length) * 1000) / 10 : null;
    // as que ficaram para trás e nem foram baixadas — não entram na conta, mas precisam ser ditas
    const abertasVencidas = await prisma.cronogramaTarefa.count({
      where: { departamento: "ENGENHARIA", dataFimReal: null, dataFimPrevista: { lt: new Date(), not: null } },
    });
    const aviso = abertasVencidas
      ? ` · ⚠ ${abertasVencidas} tarefa(s) de Engenharia venceram e seguem SEM data de conclusão no cronograma: não entram neste índice`
      : "";
    return NextResponse.json({
      titulo: "Aderência ao Prazo de Entrega do Projeto",
      colunas: ["OP", "Tarefa", "Previsto", "Base", "Concluído", "Situação"],
      linhas,
      resumo: tar.length
        ? `${noPrazo} de ${tar.length} tarefa(s) concluídas no prazo${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`}${aviso}`
        : `Nenhuma tarefa de Engenharia com data real de conclusão no período — o indicador só enxerga tarefa baixada no cronograma.${aviso}`,
    });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
