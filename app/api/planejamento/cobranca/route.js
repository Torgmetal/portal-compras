// Cobrança do Planejamento: itens que precisam de cobrança dos setores —
// MARCOS de produção (tarefas do cronograma com duração 0) e ENTREGAS
// programadas (PlanejamentoCarga ainda não romaneadas). GET lista;
// POST envia um e-mail de cobrança pro setor responsável.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { fmtOP } from "@/lib/utils";

export const runtime = "nodejs";

const DIA = 86400000;
const JANELA_PROX = 14 * DIA; // "próximo" = vence nos próximos 14 dias
// Departamento do cronograma → módulo do sistema (pra achar quem recebe)
const DEPT_MODULO = { COMERCIAL: "COMERCIAL", ENGENHARIA: "ENGENHARIA", SUPRIMENTOS: "COMPRAS", FABRICACAO: "PRODUCAO", EXPEDICAO: "EXPEDICAO", MONTAGEM: "PRODUCAO" };
const DEPT_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos", FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem" };

const classifica = (d, now) => { const t = +new Date(d); return t < now ? "ATRASADO" : t <= now + JANELA_PROX ? "PROXIMO" : "FUTURO"; };
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const utc0 = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };
// Marco = tarefa de duração zero (início == fim). Não uso duracaoDias: ele fica
// 0 em quase tudo (só o "Gerar Datas" preenche; o import do .mpp não), então
// pegaria todas as tarefas. As datas são a fonte confiável.
const ehMarco = (t) => t.dataInicioPrevista && t.dataFimPrevista && utc0(t.dataInicioPrevista) === utc0(t.dataFimPrevista);

export async function GET() {
  try { await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO", "COMERCIAL", "EXPEDICAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const now = Date.now();

  // MARCOS = tarefas de duração zero (início==fim) de cronograma ativo, não concluídas
  const marcosRaw = await prisma.cronogramaTarefa.findMany({
    where: {
      cronograma: { ativo: true },
      isSummary: false,
      dataInicioPrevista: { not: null },
      dataFimPrevista: { not: null },
      percentualRealizado: { lt: 100 },
    },
    select: {
      id: true, nome: true, departamento: true, dataInicioPrevista: true, dataFimPrevista: true, percentualRealizado: true,
      cronograma: { select: { id: true, opNumero: true, titulo: true } },
    },
    orderBy: { dataFimPrevista: "asc" },
    take: 2000,
  });
  const marcos = marcosRaw
    .filter(ehMarco)
    .map((m) => ({
      id: m.id, nome: m.nome, departamento: m.departamento || null,
      opNumero: m.cronograma?.opNumero || null, cronogramaId: m.cronograma?.id || null,
      data: m.dataFimPrevista, pct: Math.round(m.percentualRealizado || 0),
      situacao: classifica(m.dataFimPrevista, now),
    }))
    .filter((m) => m.situacao !== "FUTURO");

  // ENTREGAS = cargas planejadas ainda não romaneadas (não expedidas)
  const entregasRaw = await prisma.planejamentoCarga.findMany({
    where: { romaneioId: null, status: { not: "CANCELADO" } },
    select: {
      id: true, dataPrevista: true, status: true,
      op: { select: { numero: true, cliente: true } },
      _count: { select: { itens: true } },
    },
    orderBy: { dataPrevista: "asc" },
    take: 500,
  });
  const entregas = entregasRaw
    .map((e) => ({
      id: e.id, opNumero: e.op?.numero || null, cliente: e.op?.cliente || null,
      data: e.dataPrevista, status: e.status, itens: e._count?.itens || 0,
      situacao: classifica(e.dataPrevista, now),
    }))
    .filter((e) => e.situacao !== "FUTURO");

  return NextResponse.json({ marcos, entregas });
}

// POST — cobra um setor sobre seus marcos atrasados/próximos.
export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const departamento = String(body.departamento || "").toUpperCase();
  const mensagem = (body.mensagem || "").toString().slice(0, 500);
  if (!DEPT_MODULO[departamento]) return NextResponse.json({ error: "Departamento inválido" }, { status: 400 });

  const now = Date.now();
  const marcosRaw = await prisma.cronogramaTarefa.findMany({
    where: {
      cronograma: { ativo: true }, departamento, isSummary: false,
      dataInicioPrevista: { not: null }, dataFimPrevista: { not: null }, percentualRealizado: { lt: 100 },
    },
    select: { nome: true, dataInicioPrevista: true, dataFimPrevista: true, cronograma: { select: { opNumero: true } } },
    orderBy: { dataFimPrevista: "asc" }, take: 500,
  });
  const marcos = marcosRaw.filter(ehMarco).filter((m) => classifica(m.dataFimPrevista, now) !== "FUTURO");
  if (!marcos.length) return NextResponse.json({ error: "Nenhum marco atrasado/próximo neste setor." }, { status: 400 });

  // Destinatários: usuários com o módulo do setor + ADMs
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, OR: [{ modulos: { some: { modulo: DEPT_MODULO[departamento] } } }, { tipo: "ADMIN" }] },
    select: { email: true },
  });
  const emails = [...new Set(usuarios.map((u) => u.email).filter(Boolean))];
  if (!emails.length) return NextResponse.json({ error: "Ninguém cadastrado para receber neste setor." }, { status: 400 });

  const linhas = marcos.map((m) => {
    const atras = classifica(m.dataFimPrevista, now) === "ATRASADO";
    return `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eef1f4;font-size:13px;color:#002945;">${escapeHtml(m.nome)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eef1f4;font-size:13px;color:#576D7E;white-space:nowrap;">${m.cronograma?.opNumero ? escapeHtml(fmtOP(m.cronograma.opNumero)) : "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eef1f4;font-size:13px;white-space:nowrap;color:${atras ? "#b91c1c" : "#576D7E"};font-weight:${atras ? 700 : 400};">${fmtD(m.dataFimPrevista)}${atras ? " (atrasado)" : ""}</td>
    </tr>`;
  }).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:#006EAB;color:#fff;padding:16px 22px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:17px;">Cobrança — ${escapeHtml(DEPT_LABEL[departamento] || departamento)}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Marcos de produção atrasados ou próximos do vencimento</p>
      </div>
      <div style="background:#f9fafb;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        ${mensagem ? `<p style="font-size:13px;color:#002945;background:#eef6fb;border-radius:8px;padding:10px 14px;margin:0 0 14px;">${escapeHtml(mensagem)}</p>` : ""}
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f3f4f6;">
            <th style="text-align:left;padding:7px 10px;font-size:11px;color:#576D7E;">Marco</th>
            <th style="text-align:left;padding:7px 10px;font-size:11px;color:#576D7E;">OP</th>
            <th style="text-align:left;padding:7px 10px;font-size:11px;color:#576D7E;">Data</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        <p style="font-size:11px;color:#9aa5b1;margin:16px 0 0;">Enviado por ${escapeHtml(user.name || "Planejamento Torg")} pelo Portal Torg.</p>
      </div>
    </div>`;

  const r = await sendEmail({ to: emails, subject: `Cobrança de marcos — ${DEPT_LABEL[departamento] || departamento} (${marcos.length})`, html });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "COBRAR_SETOR_MARCOS", entity: "Cronograma", entityId: departamento, diff: { departamento, marcos: marcos.length, emails: emails.length, ok: r.ok } },
  }).catch(() => {});

  if (!r.ok) return NextResponse.json({ error: `Falha ao enviar: ${r.error}` }, { status: 502 });
  return NextResponse.json({ success: true, enviados: emails.length, marcos: marcos.length });
}
