// POST /api/comercial/op/[id]/kickoff/enviar  { para, mensagem?, tipo }
// tipo "GERAL": divulgação animada de início de obra aos setores (escopo,
//   cronograma, prioridades, pesos, entrega, pintura, inspeção, atenções).
// tipo "FISCAL": comunicado para fiscal/financeiro (faturamento por linha,
//   nota de retorno, dados fiscais do cliente).
// Sem valores em R$ em nenhum dos dois.
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { montarEmailKickoff, blocoAceite, urlBase, SELECT_OP_EMAIL_KICKOFF } from "@/lib/kickoff-email";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  para: z.string().min(3, "Informe os e-mails dos envolvidos"),
  mensagem: z.string().max(2000).optional().nullable(),
  tipo: z.enum(["GERAL", "FISCAL"]).default("GERAL"),
});
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const emails = body.para.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const invalidos = emails.filter((e) => !EMAIL_RE.test(e));
  if (emails.length === 0 || invalidos.length) {
    return NextResponse.json({ error: `E-mail inválido: ${invalidos.join(", ") || "(vazio)"}` }, { status: 400 });
  }

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: SELECT_OP_EMAIL_KICKOFF });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const k = op.kickoff;
  if (!k) return NextResponse.json({ error: "Salve o Kick Off antes de enviar." }, { status: 400 });

  const baseUrl = urlBase();
  // ⚠ o corpo do comunicado mora em lib/kickoff-email.js — a cobrança dos pendentes usa o MESMO.
  const { subject, html } = montarEmailKickoff({ op, tipo: body.tipo, mensagem: body.mensagem, userName: user.name });


  // Envio individual: cada destinatário ganha um token de ACEITE próprio e o
  // e-mail leva o botão "Li e estou de acordo" com o link único.
  const resultados = [];
  for (const email of emails) {
    const token = randomUUID();
    await prisma.kickoffAceite.create({
      data: { kickoffId: k.id, tipo: body.tipo, email, token },
    });
    const htmlFinal = html.replace("__ACEITE__", blocoAceite(`${baseUrl}/kickoff/aceite/${token}`));
    const r = await sendEmail({
      to: email,
      replyTo: user.email,
      subject,
      html: htmlFinal,
      text: `Kick Off da OP ${op.numero} — ${op.cliente}. Confirme seu aceite: ${baseUrl}/kickoff/aceite/${token}`,
    });
    resultados.push({ email, ok: r.ok, error: r.error || null });
  }

  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length === emails.length) {
    return NextResponse.json({ error: "Nenhum e-mail foi enviado: " + (falhas[0]?.error || "falha no envio") }, { status: 502 });
  }

  await prisma.oPKickOff.update({
    where: { opId: op.id },
    data: { enviadoPara: emails.join(", "), enviadoEm: new Date() },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ENVIAR_KICKOFF", entity: "OPKickOff", entityId: k.id, diff: { opNumero: op.numero, tipo: body.tipo, para: emails, falhas: falhas.map((f) => f.email) } },
  }).catch(() => {});

  return NextResponse.json({ success: true, enviados: resultados.filter((r) => r.ok).length, falhas: falhas.map((f) => f.email) });
}
