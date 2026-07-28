// POST /api/engenharia/listas/avisar-revisao — dispara o aviso de revisão de uma
// lista (LE/LPC) aos destinatários selecionados (usuários da Torg).
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { cabecalhoEmail } from "@/lib/email-layout";
import { escapeHtml } from "@/lib/html";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  tipo: z.enum(["LE", "LPC"]),
  opNumero: z.string().min(1),
  obra: z.string().optional().nullable(),
  destinatarios: z.array(z.string().email()).min(1).max(200),
});

const NOME = { LE: "Lista de Expedição (LE)", LPC: "Lista de Peças por Conjunto (LPC)" };

export async function POST(req) {
  let user;
  try { user = await requireRole(["ADMIN", "ENGENHARIA", "PCP", "PLANEJAMENTO", "PRODUCAO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const nomeLista = NOME[body.tipo];
  const obraTxt = body.obra ? ` — ${escapeHtml(body.obra)}` : "";
  const html = `${cabecalhoEmail("Revisão de lista — " + escapeHtml(nomeLista))}
    <div style="padding:20px 24px;font-size:14px;color:#111;line-height:1.6;">
      <p>Foi importada uma <b>nova revisão</b> da <b>${escapeHtml(nomeLista)}</b> da <b>OP ${escapeHtml(body.opNumero)}</b>${obraTxt}.</p>
      <p>Por favor, considerem a <b>versão mais recente</b> da lista no acompanhamento do setor de vocês.</p>
      <p style="color:#64748b;font-size:12px;margin-top:18px;">Aviso disparado por ${escapeHtml(user.name || user.email || "")} pelo Workspace Torg (Portal de Engenharia).</p>
    </div>`;
  const text = `Nova revisão da ${nomeLista} da OP ${body.opNumero}${body.obra ? " — " + body.obra : ""}. Considerem a versão mais recente da lista.`;

  const r = await sendEmail({
    to: body.destinatarios,
    subject: `[Torg] Revisão da ${nomeLista} — OP ${body.opNumero}`,
    html,
    text,
    replyTo: user.email || undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error || "Falha ao enviar o e-mail." }, { status: 502 });
  return NextResponse.json({ ok: true, enviados: body.destinatarios.length });
}
