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
  revisao: z.string().max(20).optional().nullable(), // ex.: "R01"
  mudancas: z.string().max(2000).optional().nullable(), // o que mudou (quem importou descreve)
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
  const revTxt = body.revisao ? ` (${escapeHtml(body.revisao)})` : "";
  const mudancasBloco = body.mudancas && body.mudancas.trim()
    ? `<div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border-left:3px solid #F4801F;border-radius:4px;">
         <p style="margin:0 0 4px;font-weight:600;font-size:13px;">O que mudou nesta revisão</p>
         <p style="margin:0;white-space:pre-wrap;">${escapeHtml(body.mudancas.trim())}</p>
       </div>`
    : "";
  const html = `${cabecalhoEmail("Revisão de lista — " + escapeHtml(nomeLista))}
    <div style="padding:20px 24px;font-size:14px;color:#111;line-height:1.6;">
      <p>Foi importada uma <b>nova revisão${revTxt}</b> da <b>${escapeHtml(nomeLista)}</b> da <b>OP ${escapeHtml(body.opNumero)}</b>${obraTxt}.</p>
      <p>Por favor, considerem a <b>versão mais recente</b> da lista no acompanhamento do setor de vocês.</p>
      ${mudancasBloco}
      <p style="color:#64748b;font-size:12px;margin-top:18px;">Aviso disparado por ${escapeHtml(user.name || user.email || "")} pelo Workspace Torg (Portal de Engenharia).</p>
    </div>`;
  const text = `Nova revisão${body.revisao ? " " + body.revisao : ""} da ${nomeLista} da OP ${body.opNumero}${body.obra ? " — " + body.obra : ""}. Considerem a versão mais recente da lista.${body.mudancas && body.mudancas.trim() ? "\n\nO que mudou:\n" + body.mudancas.trim() : ""}`;

  const r = await sendEmail({
    to: body.destinatarios,
    subject: `[Torg] Revisão${body.revisao ? " " + body.revisao : ""} da ${nomeLista} — OP ${body.opNumero}`,
    html,
    text,
    replyTo: user.email || undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.error || "Falha ao enviar o e-mail." }, { status: 502 });
  return NextResponse.json({ ok: true, enviados: body.destinatarios.length });
}
