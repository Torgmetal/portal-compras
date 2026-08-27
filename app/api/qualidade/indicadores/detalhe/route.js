// GET /api/qualidade/indicadores/detalhe?indicador=&ano=&mes=
// Registros do período (mês, ou ano se mes=-1) que compõem um indicador ISO da
// Qualidade — auditoria de onde saiu o número. Retorna { titulo, colunas, linhas, resumo }.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { numRNC } from "@/lib/nao-conformidade";

export const runtime = "nodejs";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const AUD_LABEL = { AGENDADA: "Agendada", REALIZADA: "Realizada", EMITIDO: "Emitida", FINALIZADO: "Finalizada" };
const AUD_OK = new Set(["REALIZADA", "EMITIDO", "FINALIZADO"]);

export async function GET(req) {
  try { await requireRole(["ADMIN", "QUALIDADE", "RH"]); }
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

  // RNCs recebidas do cliente (pertinentes) no período.
  // ⚠ RETRABALHO DA ENGENHARIA — o que o erro de projeto custou em peso. Vitor (27/08/2026):
  // "apenas se for apontado que o erro foi da engenharia, aí sim você lista no indicador da
  // engenharia". Cada linha traz o registro (RNC ou apontamento) para o número poder ser aberto.
  if (indicador === "retrabalho_engenharia") {
    const { retrabalhoDoAno } = await import("@/lib/retrabalho");
    const dados = await retrabalhoDoAno(prisma, ano);
    const meses = anoTodo ? [...Array(12).keys()] : [mes];
    const regs = dados.registros.filter((r) => r.setor === "ENGENHARIA" && meses.includes(r.mes));
    const prod = meses.reduce((t, m) => t + (dados.producao[m] || 0), 0);
    const kgEng = meses.reduce((t, m) => t + (dados.porSetor.ENGENHARIA[m] || 0), 0);
    const kgFmt = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;
    const linhas = regs
      .sort((a, b) => new Date(a.data) - new Date(b.data))
      .map((r) => [
        r.numeroRnc ? `RNC ${String(r.numeroRnc).replace(/[_-]/g, "/")}` : "Apontamento",
        fmtD(r.data), r.marca || "—", r.opNumero || "—",
        r.kg ? `${kgFmt(r.kg)}${r.estimado ? " *" : ""}` : "sem peso",
        r.descricao || "—",
      ]);
    const semPeso = regs.filter((r) => !r.kg).length;
    const perc = prod > 0 ? Math.round((kgEng / prod) * 1000) / 10 : null;
    return NextResponse.json({
      titulo: "Retrabalho gerado pela Engenharia",
      colunas: ["Registro", "Data", "Marca", "OP", "Peso", "O que houve"],
      linhas,
      resumo: `${kgFmt(kgEng)} de ${kgFmt(prod)} produzidos (corte)${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`}`
        + `${semPeso ? ` · ⚠ ${semPeso} de ${regs.length} sem peso — o percentual cobre só os demais` : ""}`
        + `${regs.some((r) => r.estimado) ? " · * peso deduzido do cadastro pela marca" : ""}`,
    });
  }

  // ⚠ ABSENTEÍSMO — quem faltou, quanto e em que setor. O índice sozinho não se discute: 14,7% em
  // agosto parece a fábrica inteira faltando, quando quatro pessoas em afastamento longo respondem
  // por 76 dos 132,5 dias. A tabela mostra as duas coisas.
  if (indicador === "absenteismo") {
    const { absenteismoDoAno } = await import("@/lib/absenteismo-planilha");
    const d = await absenteismoDoAno(ano);
    if (!d.achou) return NextResponse.json({ error: d.erro || "Planilha de presença não encontrada." }, { status: 404 });

    const meses = anoTodo ? d.meses : d.meses.filter((m) => m.mes === mes);
    if (!meses.length) return NextResponse.json({ titulo: "Absenteísmo", colunas: ["Colaborador"], linhas: [], resumo: "Sem registro de presença neste período." });

    const uteis = meses.reduce((s2, m) => s2 + m.diasUteis, 0);
    const faltas = meses.reduce((s2, m) => s2 + m.faltas, 0);
    const longos = meses.flatMap((m) => m.afastamentoLongo.pessoas.map((p) => p.nome));
    const kgLongos = meses.reduce((s2, m) => s2 + m.afastamentoLongo.faltas, 0);

    // uma linha por pessoa, somando os meses do período
    const porPessoa = new Map();
    for (const m of meses) {
      for (const p of m.detalhe) {
        const a = porPessoa.get(p.nome) || { nome: p.nome, funcao: p.funcao, setor: p.setor, dias: 0, uteis: 0 };
        a.dias += p.dias; a.uteis += p.uteis;
        porPessoa.set(p.nome, a);
      }
    }
    const linhas = [...porPessoa.values()]
      .sort((a, b) => b.dias - a.dias)
      .map((p) => [
        p.nome, p.setor || "—", p.funcao || "—",
        `${p.dias.toLocaleString("pt-BR")} dia(s)`,
        p.uteis ? `${(Math.round((p.dias / p.uteis) * 1000) / 10).toLocaleString("pt-BR")}%` : "—",
        longos.includes(p.nome) ? "afastamento longo" : "",
      ]);
    const pct = uteis > 0 ? Math.round((faltas / uteis) * 1000) / 10 : null;
    const pctSemLongo = uteis > 0 ? Math.round(((faltas - kgLongos) / uteis) * 1000) / 10 : null;
    return NextResponse.json({
      titulo: "Absenteísmo — controle de presença",
      colunas: ["Colaborador", "Setor", "Função", "Faltas", "% do próprio período", ""],
      linhas,
      resumo: `${faltas.toLocaleString("pt-BR")} dias de ausência em ${uteis.toLocaleString("pt-BR")} dias úteis`
        + `${pct == null ? "" : ` · ${pct.toLocaleString("pt-BR")}%`}`
        + `${kgLongos > 0 ? ` · desses, ${kgLongos.toLocaleString("pt-BR")} dias são de afastamento longo (${[...new Set(longos)].length} pessoa(s)) — sem eles o índice seria ${pctSemLongo?.toLocaleString("pt-BR")}%` : ""}`
        + ` · fonte: ${d.arquivo}`,
    });
  }

  if (indicador === "rnc_cliente") {
    const rncs = await prisma.naoConformidade.findMany({
      where: { data: { gte: pIni, lt: pFim }, pertinente: true, OR: [{ tipo: "CLIENTE" }, { origem: "CLIENTE" }] },
      select: { numero: true, ano: true, cliente: true, data: true, descricao: true }, orderBy: { data: "asc" },
    });
    const linhas = rncs.map((r) => [numRNC(r.numero, r.ano), r.cliente || "—", fmtD(r.data), r.descricao || "—"]);
    return NextResponse.json({ titulo: "Índice de RNCs Recebidas do Cliente", colunas: ["Nº", "Cliente", "Data", "Descrição"], linhas, resumo: `${rncs.length} RNC(s) de cliente pertinente(s) no período` });
  }

  // Recorrência de NC — todas as NCs do período, marcando as recorrentes.
  if (indicador === "recorrencia_nc") {
    const rncs = await prisma.naoConformidade.findMany({
      where: { data: { gte: pIni, lt: pFim } },
      select: { numero: true, ano: true, data: true, descricao: true, recorrente: true }, orderBy: { data: "asc" },
    });
    const linhas = rncs.map((r) => [numRNC(r.numero, r.ano), fmtD(r.data), r.descricao || "—", r.recorrente ? "Sim" : "Não"]);
    const rec = rncs.filter((r) => r.recorrente).length;
    return NextResponse.json({ titulo: "Recorrência de Não Conformidades", colunas: ["Nº", "Data", "Descrição", "Recorrente"], linhas, resumo: `${rec} recorrente(s) de ${rncs.length} NC(s) · ${rncs.length ? Math.round((rec / rncs.length) * 1000) / 10 : 0}%` });
  }

  // Plano de auditorias internas — auditorias do período (realizadas vs planejadas).
  if (indicador === "plano_auditorias") {
    const aud = await prisma.auditoriaInterna.findMany({
      where: { dataAuditoria: { gte: pIni, lt: pFim } },
      select: { numero: true, setor: true, dataAuditoria: true, status: true }, orderBy: { dataAuditoria: "asc" },
    });
    const hoje = new Date();
    const linhas = aud.map((a) => [`RAI-${String(a.numero).padStart(3, "0")}`, a.setor || "—", fmtD(a.dataAuditoria), a.dataAuditoria > hoje ? "Programada" : (AUD_LABEL[a.status] || a.status)]);
    const vencidas = aud.filter((a) => a.dataAuditoria <= hoje);
    const real = vencidas.filter((a) => AUD_OK.has(a.status)).length;
    const futuras = aud.length - vencidas.length;
    return NextResponse.json({ titulo: "Cumprimento do Plano de Auditorias Internas", colunas: ["Nº", "Setor", "Data", "Situação"], linhas, resumo: `${real} realizada(s) de ${vencidas.length} vencida(s) · ${vencidas.length ? Math.round((real / vencidas.length) * 100) : 0}%${futuras ? ` · ${futuras} programada(s) p/ depois` : ""}` });
  }

  // Plano de calibração — equipamentos (controle de documentos) e situação (vigência = mês inteiro).
  if (indicador === "plano_calibracao") {
    const eqs = await prisma.documentoQualidade.findMany({ where: { categoria: "EQUIPAMENTOS", ativo: true, dataValidade: { not: null } }, select: { nome: true, dataValidade: true }, orderBy: { dataValidade: "asc" } });
    const fimVal = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0); // último dia do mês da validade
    const now = new Date();
    const refMs = anoTodo ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) : Date.UTC(ano, mes + 1, 0);
    const linhas = eqs.map((e) => { const V = new Date(e.dataValidade); const emDia = fimVal(V) >= refMs; return [e.nome || "—", `${String(V.getUTCMonth() + 1).padStart(2, "0")}/${V.getUTCFullYear()}`, emDia ? "Em dia" : "Vencido"]; });
    const venc = eqs.filter((e) => fimVal(new Date(e.dataValidade)) < refMs).length;
    return NextResponse.json({ titulo: "Cumprimento do Plano de Calibração", colunas: ["Equipamento", "Validade (mês)", "Situação"], linhas, resumo: `${eqs.length - venc} em dia de ${eqs.length} · ${venc} vencido(s)` });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
