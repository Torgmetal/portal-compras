// GET /api/engenharia/indicadores/iso/detalhe?indicador=&ano=&mes=
// Os registros do período (mês, ou o ano com mes=-1) que compõem cada indicador da Engenharia.
//
// ⚠ Indicador que não se abre não se discute na reunião: cada card tem de mostrar DE ONDE saiu o
// número — peça a peça, RNC a RNC, tarefa a tarefa.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { retrabalhoDoAno, SETOR_RETRABALHO } from "@/lib/retrabalho";
import { EH_RNC_DE_PROJETO, ehDeRnc } from "@/lib/indicadores-engenharia-iso";

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
    const todosEng = dados.registros.filter((r) => meses.includes(r.mes) && SETOR_RETRABALHO[r.setor]?.processo === "ENGENHARIA");
    // ⚠ só o que tem RNC entra no índice (regra do Vitor, 28/08/2026); o resto vira ressalva.
    const daEng = todosEng.filter(ehDeRnc);
    const foraSemRnc = todosEng.filter((r) => !ehDeRnc(r));
    const kgForaSemRnc = foraSemRnc.reduce((t, r) => t + (r.kg || 0), 0);

    const linhas = daEng
      .sort((a, b) => new Date(a.data) - new Date(b.data))
      .map((r) => [
        fmtD(r.data),
        `RNC ${String(r.numeroRnc || "").replace(/[_-]/g, "/") || "—"}`,
        r.opNumero ? `OP-${String(r.opNumero).replace(/^0+/, "").padStart(3, "0")}` : "—",
        r.marca || "—",
        r.qtdPecas ? num(r.qtdPecas) : "—",
        r.kg > 0 ? kg(r.kg) + (r.estimado ? " (estimado)" : "") : "— (sem peso)",
        r.descricao || "—",
      ]);

    const pesoEng = daEng.reduce((t, r) => t + (r.kg || 0), 0);
    const producao = somaMeses(dados.producao);
    const perc = producao > 0 ? Math.round((pesoEng / producao) * 1000) / 10 : null;
    const semPeso = daEng.filter((r) => !(r.kg > 0)).length;
    // ⚠ a cobertura vai junto: sem peso não há percentual, e um índice baixo por falta de dado se
    // lê como um mês excelente.
    const aviso = semPeso ? ` · ⚠ ${semPeso} RNC(s) sem peça escolhida da Lista de Expedição — sem peça não há peso` : "";
    // ⚠ o que ficou FORA precisa aparecer: um índice em 0% por falta de RNC se lê como "não houve
    // retrabalho", e nesses meses houve — só não foi formalizado.
    const avisoFora = kgForaSemRnc > 0
      ? ` · ⚠ fora do índice: ${kg(kgForaSemRnc)} em ${foraSemRnc.length} apontamento(s) do FORM 34 com origem Engenharia mas SEM RNC aberta`
      : "";
    return NextResponse.json({
      titulo: "Retrabalho gerado pela Engenharia",
      colunas: ["Data", "RNC", "OP", "Marca / desenho", "Peças", "Peso", "Descrição"],
      linhas,
      resumo: `${kg(pesoEng)} retrabalhados por erro de projeto${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`} de ${kg(producao)} produzidos (corte) · ${daEng.length} RNC(s)${aviso}${avisoFora}`,
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
    // ⚠ a OP não está na tarefa: vem do CRONOGRAMA dono dela. Vitor (28/08/2026): "as que estiverem
    // em atraso você deve apontar e informar de qual cronograma se trata" — sem a OP, uma lista de
    // "Detalhamento" e "Modelo" repetidos não diz de qual obra é o atraso.
    const selTarefa = { nome: true, dataFimPrevista: true, dataFimBase: true, dataFimReal: true, cronograma: { select: { opNumero: true, nome: true } } };
    const [tar, emAtraso] = await Promise.all([
      prisma.cronogramaTarefa.findMany({
        where: { departamento: "ENGENHARIA", dataFimReal: { gte: pIni, lt: pFim }, dataFimPrevista: { not: null } },
        select: selTarefa, orderBy: { dataFimReal: "asc" },
      }),
      // vencidas e ainda EM ABERTO com prazo no período — entram como atraso no mês do vencimento
      prisma.cronogramaTarefa.findMany({
        where: { departamento: "ENGENHARIA", dataFimReal: null, dataFimPrevista: { gte: pIni, lt: pFim < hoje ? pFim : hoje } },
        select: selTarefa, orderBy: { dataFimPrevista: "asc" },
      }),
    ]);
    const dias = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
    const daObra = (t) => (t.cronograma?.opNumero ? `OP-${t.cronograma.opNumero}` : t.cronograma?.nome || "—");
    const linhas = tar.map((t) => {
      const atraso = dias(t.dataFimReal, t.dataFimPrevista);
      return [
        daObra(t), t.nome || "—",
        fmtD(t.dataFimPrevista),
        // ⚠ a data BASE (o combinado original) vai ao lado: o previsto se move quando o cronograma é
        // replanejado, e sem ver as duas não dá para saber se a tarefa cumpriu o prazo ou se o prazo
        // é que andou até ela.
        t.dataFimBase ? fmtD(t.dataFimBase) : "—",
        fmtD(t.dataFimReal),
        atraso <= 0 ? "No prazo" : `${atraso} dia(s) de atraso`,
      ];
    });
    // as vencidas e em aberto entram na lista com a data real vazia — é o atraso que ainda corre
    for (const t of emAtraso) {
      linhas.push([
        daObra(t), t.nome || "—",
        fmtD(t.dataFimPrevista), t.dataFimBase ? fmtD(t.dataFimBase) : "—",
        "— (em aberto)",
        `EM ATRASO há ${dias(hoje, t.dataFimPrevista)} dia(s)`,
      ]);
    }
    const noPrazo = tar.filter((t) => new Date(t.dataFimReal) <= new Date(t.dataFimPrevista)).length;
    const total = tar.length + emAtraso.length;
    const perc = total ? Math.round((noPrazo / total) * 1000) / 10 : null;
    const aviso = emAtraso.length
      ? ` · ${emAtraso.length} vencida(s) e ainda em aberto no cronograma, contadas como atraso`
      : "";
    return NextResponse.json({
      titulo: "Aderência ao Prazo de Entrega do Projeto",
      colunas: ["Cronograma (OP)", "Tarefa", "Previsto", "Base", "Concluído", "Situação"],
      linhas,
      resumo: total
        ? `${noPrazo} de ${total} tarefa(s) no prazo${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`}${aviso}`
        : "Nenhuma tarefa de Engenharia com prazo ou conclusão no período.",
    });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
