// GET /api/rh/indicadores/iso/detalhe?indicador=&ano=&mes=
// Registros do período (mês, ou ano se mes=-1) que compõem um indicador ISO de RH.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { regrasParaFuncionario, checarRegraDocumento, dispensadoDocumentos } from "@/lib/regras-documentos";
import { documentosDeProntuarioSeguro, mesclarDocs } from "@/lib/prontuario-certificados";

export const runtime = "nodejs";
export const maxDuration = 60;

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const NAT = { DOENCA: "Doença", ACIDENTE: "Acidente de trabalho", MATERNIDADE: "Maternidade", OUTROS: "Outros" };

export async function GET(req) {
  try { await requireRole(["ADMIN", "RH"]); }
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

  // Turnover — admissões e desligamentos do período.
  if (indicador === "turnover") {
    const [adm, dem] = await Promise.all([
      prisma.funcionario.findMany({ where: { dataAdmissao: { gte: pIni, lt: pFim } }, select: { nome: true, dataAdmissao: true, cargo: { select: { nome: true } } }, orderBy: { dataAdmissao: "asc" } }),
      prisma.funcionario.findMany({ where: { dataDemissao: { gte: pIni, lt: pFim } }, select: { nome: true, dataDemissao: true, tipoDesligamento: true, cargo: { select: { nome: true } } }, orderBy: { dataDemissao: "asc" } }),
    ]);
    const linhas = [
      ...adm.map((f) => ["Admissão", f.nome, fmtD(f.dataAdmissao), f.cargo?.nome || "—"]),
      ...dem.map((f) => ["Desligamento", f.nome, fmtD(f.dataDemissao), f.tipoDesligamento || f.cargo?.nome || "—"]),
    ];
    return NextResponse.json({ titulo: "Turnover (Taxa de Rotatividade)", colunas: ["Movimento", "Colaborador", "Data", "Detalhe"], linhas, resumo: `${adm.length} admissão(ões) + ${dem.length} desligamento(s) no período` });
  }

  // Absenteísmo — do controle de presença do RH (/Qualidade/Presença.xlsx), pessoa a pessoa.
  // ⚠ o detalhamento tem de sair da MESMA fonte do card: com o card lendo a planilha e a tabela
  // lendo `Afastamento`, o número de cima nunca fecharia com a lista de baixo.
  if (indicador === "absenteismo") {
    const { absenteismoDoAno } = await import("@/lib/absenteismo-planilha");
    const d = await absenteismoDoAno(ano);
    if (d.achou && d.meses.length) {
      const meses = anoTodo ? d.meses : d.meses.filter((m) => m.mes === mes);
      const uteis = meses.reduce((t, m) => t + m.diasUteis, 0);
      const faltas = meses.reduce((t, m) => t + m.faltas, 0);
      const longos = new Set(meses.flatMap((m) => m.afastamentoLongo.pessoas.map((p) => p.nome)));
      const diasLongos = meses.reduce((t, m) => t + m.afastamentoLongo.faltas, 0);
      const porPessoa = new Map();
      for (const m of meses) for (const p of m.detalhe) {
        const a = porPessoa.get(p.nome) || { ...p, dias: 0, uteis: 0 };
        a.dias += p.dias; a.uteis += p.uteis;
        porPessoa.set(p.nome, a);
      }
      const linhas = [...porPessoa.values()].sort((a, b) => b.dias - a.dias).map((p) => [
        p.nome, p.setor || "—", p.funcao || "—",
        `${p.dias.toLocaleString("pt-BR")} dia(s)`,
        p.uteis ? `${(Math.round((p.dias / p.uteis) * 1000) / 10).toLocaleString("pt-BR")}%` : "—",
        longos.has(p.nome) ? "afastamento longo" : "",
      ]);
      const pct = uteis > 0 ? Math.round((faltas / uteis) * 1000) / 10 : null;
      const semLongo = uteis > 0 ? Math.round(((faltas - diasLongos) / uteis) * 1000) / 10 : null;
      return NextResponse.json({
        titulo: "Absenteísmo — controle de presença",
        colunas: ["Colaborador", "Setor", "Função", "Faltas", "% do próprio período", ""],
        linhas,
        resumo: `${faltas.toLocaleString("pt-BR")} dias de ausência em ${uteis.toLocaleString("pt-BR")} dias úteis`
          + `${pct == null ? "" : ` · ${pct.toLocaleString("pt-BR")}%`}`
          + `${diasLongos > 0 ? ` · desses, ${diasLongos.toLocaleString("pt-BR")} dias são afastamento longo (${longos.size} pessoa(s)) — sem eles o índice seria ${semLongo?.toLocaleString("pt-BR")}%` : ""}`
          + ` · fonte: ${d.arquivo}`,
      });
    }
    // sem a planilha: cai nos afastamentos formais, como era antes
    const af = await prisma.afastamento.findMany({ where: { dataInicio: { gte: pIni, lt: pFim } }, select: { dataInicio: true, dataFim: true, diasAfastado: true, natureza: true, funcionario: { select: { nome: true } } }, orderBy: { dataInicio: "asc" } });
    const linhas = af.map((a) => [a.funcionario?.nome || "—", NAT[a.natureza] || a.natureza || "—", fmtD(a.dataInicio), String(a.diasAfastado ?? "—")]);
    const totDias = af.reduce((s2, a) => s2 + (a.diasAfastado || 0), 0);
    return NextResponse.json({ titulo: "Absenteísmo", colunas: ["Colaborador", "Natureza", "Início", "Dias"], linhas, resumo: `${d.erro || "Planilha de presença indisponível"} — mostrando os afastamentos formais: ${af.length} · ${totDias} dia(s)` });
  }

  // Acidentes com afastamento — acidentes COM_AFASTAMENTO do período.
  if (indicador === "acidentes_afastamento") {
    const ac = await prisma.acidenteTrabalho.findMany({ where: { data: { gte: pIni, lt: pFim }, tipo: "COM_AFASTAMENTO" }, select: { data: true, funcionarioNome: true, gravidade: true, diasPerdidos: true }, orderBy: { data: "asc" } });
    const linhas = ac.map((a) => [fmtD(a.data), a.funcionarioNome || "—", a.gravidade || "—", String(a.diasPerdidos ?? 0)]);
    return NextResponse.json({ titulo: "Índice de acidente com afastamento", colunas: ["Data", "Colaborador", "Gravidade", "Dias perdidos"], linhas, resumo: `${ac.length} acidente(s) com afastamento no período (meta 0)` });
  }

  // Atendimento das competências — snapshot: colaboradores CLT e se têm todos os documentos
  // obrigatórios do setor em dia (RH Documentos + regras por setor/CCT).
  if (indicador === "atendimento_competencias") {
    const [fs, dispRows] = await Promise.all([
      prisma.funcionario.findMany({ where: { ativo: true }, select: { id: true, nome: true, tipoContrato: true, setor: { select: { nome: true } }, cargo: { select: { nome: true } }, documentos: { where: { ativo: true }, select: { tipo: true, dataValidade: true, ativo: true } } }, orderBy: { nome: "asc" } }),
      prisma.documentoDispensa.findMany({ select: { funcionarioId: true, tipo: true } }),
    ]);
    const dispMap = new Map();
    for (const d of dispRows) { if (!dispMap.has(d.funcionarioId)) dispMap.set(d.funcionarioId, new Set()); dispMap.get(d.funcionarioId).add(d.tipo); }
    // Certificados do prontuário como documentos + cobertura "só quem já está no prontuário".
    const { docsPorFunc: docsProntuario, comProntuario, ok: prontuarioOk } =
      await documentosDeProntuarioSeguro(fs.map((f) => ({ id: f.id, nome: f.nome })));
    const linhas = []; let comRegras = 0, atende = 0;
    for (const f of fs) {
      const setor = f.setor?.nome || "";
      if (dispensadoDocumentos(f.tipoContrato, setor)) continue;
      if (prontuarioOk && !comProntuario.has(f.id)) continue; // cobertura: só quem já está no Prontuário (se disponível)
      const regras = regrasParaFuncionario(setor, f.cargo?.nome);
      if (!regras.length) continue;
      comRegras++;
      const disp = dispMap.get(f.id) || new Set();
      const docsF = mesclarDocs(f.documentos, docsProntuario.get(f.id)); // RH + prontuário (complementa)
      // regras exigidas (desconta as dispensáveis marcadas como dispensadas p/ o funcionário)
      const exigidas = regras.filter((rg) => !(rg.dispensavel && disp.has(rg.tipo)));
      const falta = exigidas.filter((rg) => { const st = checarRegraDocumento(rg, docsF).status; return st !== "OK" && st !== "VENCENDO"; }).length;
      if (falta === 0) atende++;
      linhas.push([f.nome, f.cargo?.nome || "—", falta === 0 ? "Atende (todos em dia)" : `Faltam ${falta} de ${exigidas.length}`]);
    }
    const perc = comRegras > 0 ? Math.round((atende / comRegras) * 1000) / 10 : null;
    // ⚠ a apuração do indicador é SEMESTRAL; este detalhamento é sempre a foto de HOJE (é o que
    // dá para conferir nome a nome). Dizer isso evita a leitura de que o número do semestre está errado.
    return NextResponse.json({ titulo: "Atendimento das Competências", colunas: ["Colaborador", "Cargo", "Documentos"], linhas, resumo: `${atende} de ${comRegras} colaborador(es) no Prontuário Eletrônico com todos os documentos em dia${perc == null ? "" : ` · ${perc.toLocaleString("pt-BR")}%`} — foto de hoje; o indicador é apurado no fechamento de cada semestre` });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
