// POST /api/planejamento/tarefas/distribuir — cria em lote as tarefas revisadas
// (vindas da extração por IA) na semana/ano escolhidos, distribuindo aos setores.
// Cada tarefa gera compromissos na agenda dos usuários do setor (best-effort) e,
// se enviarEmail, manda UM resumo por setor aos destinatários selecionados.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { criarCompromissosDaTarefa } from "@/lib/compromissos";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { SETOR_LABEL } from "@/lib/comunicacao-setor";

export const runtime = "nodejs";
export const maxDuration = 60;

const SETORES = ["PRODUCAO", "PINTURA", "PCP", "EXPEDICAO", "COMERCIAL", "ENGENHARIA", "COMPRAS", "ALMOXARIFADO", "FINANCEIRO", "RH", "PLANEJAMENTO"];
const PRIO_LABEL = { ALTA: "🔴 Alta", MEDIA: "🟡 Média", BAIXA: "🟢 Baixa" };
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim().toLowerCase());

const schema = z.object({
  semanaIso: z.number().int().min(1).max(53),
  ano: z.number().int().min(2024),
  tarefas: z.array(z.object({
    titulo: z.string().min(1),
    descricao: z.string().nullable().optional(),
    setor: z.enum(SETORES),
    prioridade: z.enum(["ALTA", "MEDIA", "BAIXA"]).default("MEDIA"),
    responsavel: z.string().nullable().optional(),
    dataPrevista: z.string().nullable().optional(),
    opNumero: z.string().nullable().optional(),
    doCliente: z.boolean().optional(),
    clienteNome: z.string().nullable().optional(),
    clienteEmail: z.string().nullable().optional(),
  })).min(1).max(100),
  enviarEmail: z.boolean().optional(),
  destinatariosPorSetor: z.record(z.array(z.string())).optional(),
});

const fmtPrazo = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);

function htmlResumoSetor({ setor, tarefas, semanaIso, ano, autor, base }) {
  const linhas = tarefas.map((t) => {
    const prazo = fmtPrazo(t.dataPrevista);
    const op = t.opNumero ? `OP-${String(t.opNumero).padStart(3, "0")}` : null;
    const meta = [op, prazo ? `prazo ${prazo}` : null, t.responsavel ? `resp. ${escapeHtml(t.responsavel)}` : null].filter(Boolean).join(" · ");
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:13px;color:#002945;">
        <b>${escapeHtml(t.titulo)}</b>${meta ? `<br><span style="font-size:11px;color:#576D7E;">${meta}</span>` : ""}
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap;">${PRIO_LABEL[t.prioridade] || t.prioridade}</td>
    </tr>`;
  }).join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
      <div style="background:#0D1F3C;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">📋 Tarefas para ${escapeHtml(SETOR_LABEL[setor] || setor)}</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:.9;">Workspace Torg — Planejamento · Semana ${semanaIso}/${ano}</p>
      </div>
    <div style="height:4px;background:#F4801F;"></div>
      <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:14px;color:#002945;margin:0 0 12px;">O Planejamento distribuiu <b>${tarefas.length} tarefa(s)</b> para o seu setor:</p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:6px;overflow:hidden;">${linhas}</table>
        ${base ? `<p style="margin:16px 0 0;"><a href="${base}/planejamento/tarefas" style="background:#006EAB;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:6px;display:inline-block;">Ver no portal</a></p>` : ""}
        <p style="margin:16px 0 0;font-size:12px;color:#576D7E;border-top:1px solid #e5e7eb;padding-top:12px;">
          Distribuído por <b>${escapeHtml(autor || "Planejamento")}</b>. Ao concluir uma tarefa, avise o <b>Torguinho</b> no portal que ele marca como concluída.
        </p>
      </div>
    </div>`;
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: "Dados inválidos: " + (e.issues?.[0]?.message || e.message) }, { status: 400 }); }

  // resolve opId + e-mail do cliente das OPs citadas (uma vez só)
  const numeros = [...new Set(body.tarefas.map((t) => t.opNumero).filter(Boolean))];
  const ops = numeros.length ? await prisma.oP.findMany({ where: { numero: { in: numeros } }, select: { id: true, numero: true, clienteEmail: true } }) : [];
  const opPorNumero = new Map(ops.map((o) => [o.numero, o]));
  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim().toLowerCase());

  let criadas = 0;
  const porSetor = {};
  const tarefasPorSetor = {};
  for (const t of body.tarefas) {
    const op = t.opNumero ? opPorNumero.get(t.opNumero) : null;
    // e-mail do cliente: o informado, senão o cadastrado na OP
    const clienteEmail = t.doCliente
      ? (emailValido(t.clienteEmail) ? String(t.clienteEmail).trim().toLowerCase() : (emailValido(op?.clienteEmail) ? op.clienteEmail.trim().toLowerCase() : null))
      : null;
    const tarefa = await prisma.tarefaPlanejamento.create({
      data: {
        titulo: t.titulo,
        descricao: t.descricao || null,
        opNumero: t.opNumero || null,
        opId: op?.id || null,
        setor: t.setor,
        semanaIso: body.semanaIso,
        ano: body.ano,
        prioridade: t.prioridade || "MEDIA",
        responsavel: t.responsavel || null,
        dataPrevista: t.dataPrevista ? new Date(t.dataPrevista) : null,
        doCliente: !!t.doCliente,
        clienteNome: t.doCliente ? (t.clienteNome || null) : null,
        clienteEmail,
        createdById: user.id,
      },
    });
    await criarCompromissosDaTarefa(tarefa, user.id).catch(() => {});
    criadas++;
    porSetor[t.setor] = (porSetor[t.setor] || 0) + 1;
    (tarefasPorSetor[t.setor] ||= []).push(t);
  }

  // Envio de e-mail (best-effort) — um resumo por setor aos destinatários escolhidos
  const emails = { enviados: 0, porSetor: {}, falhas: [] };
  if (body.enviarEmail) {
    const base = (() => { try { return new URL(req.url).origin; } catch { return null; } })();
    const sel = body.destinatariosPorSetor || {};
    for (const setor of Object.keys(tarefasPorSetor)) {
      const to = [...new Set((sel[setor] || []).map((e) => String(e).trim().toLowerCase()).filter(emailOk))];
      if (to.length === 0) { emails.porSetor[setor] = 0; continue; }
      const html = htmlResumoSetor({ setor, tarefas: tarefasPorSetor[setor], semanaIso: body.semanaIso, ano: body.ano, autor: user.name, base });
      const subject = `📋 ${tarefasPorSetor[setor].length} tarefa(s) — ${SETOR_LABEL[setor] || setor} (Semana ${body.semanaIso}/${body.ano})`;
      const r = await sendEmail({ to, subject, html });
      if (r.ok) { emails.enviados += to.length; emails.porSetor[setor] = to.length; }
      else { emails.porSetor[setor] = 0; emails.falhas.push({ setor, erro: r.error }); }
    }
  }

  await prisma.auditLog.create({ data: { userId: user.id, action: "DISTRIBUIR_TAREFAS_IA", entity: "TarefaPlanejamento", entityId: `${body.ano}-W${body.semanaIso}`, diff: { criadas, porSetor, emailsEnviados: emails.enviados } } }).catch(() => {});

  return NextResponse.json({ success: true, criadas, porSetor, emails });
}
