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
    const linhas = aud.map((a) => [`RAI-${String(a.numero).padStart(3, "0")}`, a.setor || "—", fmtD(a.dataAuditoria), AUD_LABEL[a.status] || a.status]);
    const real = aud.filter((a) => AUD_OK.has(a.status)).length;
    return NextResponse.json({ titulo: "Cumprimento do Plano de Auditorias Internas", colunas: ["Nº", "Setor", "Data", "Situação"], linhas, resumo: `${real} realizada(s) de ${aud.length} planejada(s) · ${aud.length ? Math.round((real / aud.length) * 100) : 0}%` });
  }

  return NextResponse.json({ error: "Este indicador ainda não tem detalhamento." }, { status: 404 });
}
