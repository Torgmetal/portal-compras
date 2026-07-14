// Público (sem login, via token) — o SETOR responde a cobrança dos MARCOS de
// produção. Por marco é OBRIGATÓRIO informar: se FINALIZOU → data de conclusão
// + evidência (o que aconteceu); se NÃO → a nova data prevista. Atualiza os
// marcos no cronograma, registra a evidência e avisa o Planejamento.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { getEmailsSetor } from "@/lib/comunicacao-setor";

export const runtime = "nodejs";

const DEPT_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos", FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem" };
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

async function carregarMarcos(tarefaIds) {
  if (!tarefaIds?.length) return [];
  const ts = await prisma.cronogramaTarefa.findMany({
    where: { id: { in: tarefaIds } },
    select: { id: true, nome: true, dataFimPrevista: true, percentualRealizado: true, cronograma: { select: { opNumero: true, titulo: true } } },
  });
  const byId = new Map(ts.map((t) => [t.id, t]));
  return tarefaIds.map((id) => byId.get(id)).filter(Boolean).map((t) => ({
    id: t.id, nome: t.nome, opNumero: t.cronograma?.opNumero || null, obra: t.cronograma?.titulo || null,
    dataPrevista: t.dataFimPrevista, concluido: (t.percentualRealizado || 0) >= 100,
  }));
}

export async function GET(_req, { params }) {
  const cob = await prisma.cobrancaMarco.findUnique({ where: { token: params.token } });
  if (!cob) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  return NextResponse.json({
    success: true,
    cobranca: {
      departamento: cob.departamento,
      departamentoLabel: DEPT_LABEL[cob.departamento] || cob.departamento,
      respondido: cob.respondido,
      respondidoPor: cob.respondidoPor,
      respostas: cob.respostas || null,
    },
    marcos: await carregarMarcos(cob.tarefaIds),
  });
}

const schema = z.object({
  respondidoPor: z.string().min(1, "Informe seu nome").max(100),
  respostas: z.array(z.object({
    tarefaId: z.string(),
    status: z.enum(["FINALIZADO", "NAO_FINALIZADO"]),
    novaData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    dataConclusao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    evidencia: z.string().max(1000).optional().nullable(),
  })).min(1),
});

export async function POST(req, { params }) {
  const cob = await prisma.cobrancaMarco.findUnique({ where: { token: params.token } });
  if (!cob) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  if (cob.respondido) return NextResponse.json({ success: false, error: "Esta cobrança já foi respondida." }, { status: 400 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const respondidoPor = body.respondidoPor.trim().slice(0, 100);
  const validas = body.respostas.filter((r) => cob.tarefaIds.includes(r.tarefaId));

  // Amarrado: todo marco cobrado precisa de resposta, com os campos do seu status.
  const respondidos = new Set(validas.map((r) => r.tarefaId));
  if (cob.tarefaIds.some((id) => !respondidos.has(id))) {
    return NextResponse.json({ success: false, error: "Responda todos os marcos." }, { status: 400 });
  }
  for (const r of validas) {
    if (r.status === "FINALIZADO" && (!r.dataConclusao || !(r.evidencia || "").trim())) {
      return NextResponse.json({ success: false, error: "Marco finalizado precisa da data de conclusão e da evidência." }, { status: 400 });
    }
    if (r.status === "NAO_FINALIZADO" && !r.novaData) {
      return NextResponse.json({ success: false, error: "Marco não finalizado precisa da nova data prevista." }, { status: 400 });
    }
  }

  const ops = [];
  for (const r of validas) {
    if (r.status === "FINALIZADO") {
      const dc = new Date(r.dataConclusao + "T12:00:00Z");
      const ev = (r.evidencia || "").trim().slice(0, 1000);
      ops.push(prisma.cronogramaTarefa.update({ where: { id: r.tarefaId }, data: { percentualRealizado: 100, dataFimReal: dc, observacao: ev } }));
      if (cob.createdById) ops.push(prisma.cronogramaRegistro.create({ data: { tarefaId: r.tarefaId, descricao: `✅ Concluído em ${fmtD(dc)} (cobrança respondida por ${respondidoPor}). Evidência: ${ev}`, createdById: cob.createdById } }));
    } else {
      const nd = new Date(r.novaData + "T12:00:00Z");
      const ev = (r.evidencia || "").trim().slice(0, 1000);
      ops.push(prisma.cronogramaTarefa.update({ where: { id: r.tarefaId }, data: { dataFimPrevista: nd } }));
      if (cob.createdById) ops.push(prisma.cronogramaRegistro.create({ data: { tarefaId: r.tarefaId, descricao: `🗓️ Nova data prevista ${fmtD(nd)} (cobrança respondida por ${respondidoPor})${ev ? ` — ${ev}` : ""}`, createdById: cob.createdById } }));
    }
  }
  ops.push(prisma.cobrancaMarco.update({ where: { id: cob.id }, data: { respondido: true, respondidoEm: new Date(), respondidoPor, respostas: validas } }));
  await prisma.$transaction(ops);

  await prisma.auditLog.create({
    data: { userId: cob.createdById || null, action: "RESPONDER_COBRANCA_MARCOS", entity: "CobrancaMarco", entityId: cob.id, diff: { respondidoPor, respostas: validas } },
  }).catch(() => {});

  // avisa o Planejamento
  try {
    const to = [...new Set((await getEmailsSetor("PLANEJAMENTO")).map((e) => String(e).toLowerCase()))];
    if (to.length) {
      const marcos = await carregarMarcos(cob.tarefaIds);
      const nomeById = new Map(marcos.map((m) => [m.id, m]));
      const linhas = validas.map((r) => {
        const m = nomeById.get(r.tarefaId);
        const fin = r.status === "FINALIZADO";
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eef1f4;font-size:13px;color:#002945;">${escapeHtml(m?.nome || "—")}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eef1f4;font-size:13px;white-space:nowrap;color:${fin ? "#059669" : "#F4801F"};font-weight:600;">${fin ? `Concluído ${fmtD(r.dataConclusao)}` : `Nova data ${fmtD(r.novaData)}`}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eef1f4;font-size:12px;color:#576D7E;">${escapeHtml((r.evidencia || "").slice(0, 200))}</td>
        </tr>`;
      }).join("");
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:660px;margin:0 auto;">
          <div style="background:#006EAB;color:#fff;padding:16px 22px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:17px;">📨 Cobrança respondida — ${escapeHtml(DEPT_LABEL[cob.departamento] || cob.departamento)}</h2>
          </div>
          <div style="background:#f9fafb;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            <p style="font-size:14px;color:#002945;margin:0 0 12px;"><b>${escapeHtml(respondidoPor)}</b> respondeu a cobrança dos marcos:</p>
            <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              <thead><tr style="background:#f3f4f6;"><th style="text-align:left;padding:7px 10px;font-size:11px;color:#576D7E;">Marco</th><th style="text-align:left;padding:7px 10px;font-size:11px;color:#576D7E;">Situação</th><th style="text-align:left;padding:7px 10px;font-size:11px;color:#576D7E;">Evidência / obs.</th></tr></thead>
              <tbody>${linhas}</tbody>
            </table>
            <p style="font-size:12px;color:#576D7E;margin:14px 0 0;">Veja em Planejamento › Tarefas › Cobrança (e no cronograma, nos registros de cada marco).</p>
          </div>
        </div>`;
      await sendEmail({ to, subject: `📨 Cobrança respondida — ${DEPT_LABEL[cob.departamento] || cob.departamento} (${respondidoPor})`, html });
    }
  } catch (e) { console.error("[cobranca-marcos] aviso ao planejamento falhou:", e?.message); }

  return NextResponse.json({ success: true });
}
