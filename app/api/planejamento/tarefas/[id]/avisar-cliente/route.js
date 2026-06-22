// POST /api/planejamento/tarefas/[id]/avisar-cliente
// Planejamento dispara um e-mail ao cliente (cobrança da data ou confirmação de
// conclusão) com botões de 1 clique que levam a uma página pública (sem login).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { gerarTokenForte } from "@/lib/token";

export const runtime = "nodejs";

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim().toLowerCase());
const fmtPrazo = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);

const schema = z.object({
  clienteEmail: z.string().optional().nullable(),
  clienteNome: z.string().max(120).optional().nullable(),
  mensagem: z.string().max(500).optional().nullable(),
  tipo: z.enum(["COBRANCA", "CONFIRMACAO"]).optional(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch { return NextResponse.json({ error: "Dados inválidos" }, { status: 400 }); }

  const tarefa = await prisma.tarefaPlanejamento.findUnique({
    where: { id: params.id },
    include: { op: { select: { numero: true, cliente: true, obra: true } } },
  });
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const email = emailOk(body.clienteEmail) ? body.clienteEmail.trim().toLowerCase()
    : (emailOk(tarefa.clienteEmail) ? tarefa.clienteEmail.trim().toLowerCase() : null);
  if (!email) return NextResponse.json({ error: "Informe um e-mail de cliente válido (ou cadastre na OP)." }, { status: 400 });

  const token = tarefa.clienteToken || gerarTokenForte();
  const base = (() => { try { return new URL(req.url).origin; } catch { return ""; } })();
  const link = `${base}/cliente/tarefa/${token}`;
  const clienteNome = (body.clienteNome || tarefa.clienteNome || tarefa.op?.cliente || "").trim();
  const op = tarefa.opNumero ? `OP-${String(tarefa.opNumero).padStart(3, "0")}` : null;
  const prazo = fmtPrazo(tarefa.dataPrevista);
  const tipo = body.tipo || "COBRANCA";

  await prisma.tarefaPlanejamento.update({
    where: { id: tarefa.id },
    data: { clienteToken: token, clienteEmail: email, clienteNome: clienteNome || null, clienteAvisadoEm: new Date() },
  });

  const intro = tipo === "CONFIRMACAO"
    ? "Para fecharmos este item, você poderia confirmar se já foi concluído de sua parte?"
    : "Estamos aguardando este item da sua parte para seguir com a obra. Pode nos atualizar?";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#006EAB;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Torg Metal — ${op ? escapeHtml(op) : "Acompanhamento"}</h2>
        ${tarefa.op?.obra || tarefa.op?.cliente ? `<p style="margin:4px 0 0;font-size:13px;opacity:.9;">${escapeHtml(tarefa.op?.obra || tarefa.op?.cliente)}</p>` : ""}
      </div>
      <div style="background:#f9fafb;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        ${clienteNome ? `<p style="font-size:14px;color:#002945;margin:0 0 10px;">Olá, ${escapeHtml(clienteNome)}!</p>` : ""}
        <p style="font-size:14px;color:#002945;margin:0 0 6px;">${escapeHtml(intro)}</p>
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:12px 0;">
          <p style="margin:0;font-size:15px;font-weight:700;color:#002945;">${escapeHtml(tarefa.titulo)}</p>
          ${prazo ? `<p style="margin:6px 0 0;font-size:13px;color:#576D7E;">Data combinada: <b>${prazo}</b></p>` : ""}
          ${tarefa.descricao ? `<p style="margin:6px 0 0;font-size:13px;color:#576D7E;">${escapeHtml(tarefa.descricao)}</p>` : ""}
        </div>
        ${body.mensagem ? `<p style="font-size:13px;color:#002945;background:#eef6fb;border-radius:8px;padding:10px 14px;margin:0 0 14px;">${escapeHtml(body.mensagem)}</p>` : ""}
        <p style="font-size:13px;color:#576D7E;margin:0 0 10px;">Responda com 1 clique:</p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
          <td style="padding:4px;">
            <a href="${link}?acao=concluido" style="background:#059669;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block;">✅ Já concluí / forneci</a>
          </td>
          <td style="padding:4px;">
            <a href="${link}?acao=nova_data" style="background:#F4801F;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block;">🗓️ Informar nova data</a>
          </td>
        </tr></table>
        <p style="font-size:11px;color:#9aa5b1;margin:16px 0 0;text-align:center;">Ou acesse: <a href="${link}" style="color:#006EAB;">${link}</a><br>Não é necessário login. Enviado por ${escapeHtml(user.name || "Planejamento Torg")}.</p>
      </div>
    </div>`;

  const subject = `${op ? op + " — " : ""}${tarefa.titulo} — precisamos da sua confirmação`;
  const r = await sendEmail({ to: email, subject, html });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "AVISAR_CLIENTE_TAREFA", entity: "TarefaPlanejamento", entityId: tarefa.id, diff: { email, tipo, emailOk: r.ok } },
  }).catch(() => {});

  if (!r.ok) return NextResponse.json({ error: `Falha ao enviar: ${r.error}` }, { status: 502 });
  return NextResponse.json({ success: true, email });
}
