// POST /api/comercial/aditivo/[id]/cobrar  { alvos?: ["a@x"] } — reenvia o comunicado do aditivo
// (com o PDF e o MESMO link de aceite) a quem ainda não confirmou. Reusa o convite; nunca cria outro.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { blocoAceite, urlBase } from "@/lib/kickoff-email";
import { carregarComunicado, gerarComunicadoAditivoPDF, montarEmailAditivo } from "@/lib/aditivo-comunicado";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = z.object({ alvos: z.array(z.string()).optional() }).parse(await req.json().catch(() => ({}))); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const dados = await carregarComunicado(params.id);
  if (!dados) return NextResponse.json({ error: "Aditivo não encontrado" }, { status: 404 });
  const { ad } = dados;
  const alvos = new Set((body.alvos || []).map((e) => e.toLowerCase()));
  const pendentes = ad.aceites.filter((a) => !a.aceitoEm && (!alvos.size || alvos.has(a.email.toLowerCase())));
  if (!pendentes.length) return NextResponse.json({ error: "Ninguém pendente para cobrar neste aditivo." }, { status: 400 });

  const pdf = Buffer.from(await gerarComunicadoAditivoPDF(dados));
  const { subject, html } = montarEmailAditivo({ dados, userName: user.name, lembrete: true });
  const baseUrl = urlBase();
  const resultados = [];
  for (const p of pendentes) {
    const r = await sendEmail({
      to: p.email, replyTo: user.email || undefined, subject,
      html: html.replace("__ACEITE__", blocoAceite(`${baseUrl}/aditivo/aceite/${p.token}`)),
      text: `Seu aceite do Aditivo ${ad.numero} da OP ${ad.op.numero} está pendente. Confirme: ${baseUrl}/aditivo/aceite/${p.token}`,
      attachments: [{ filename: `Comunicado Aditivo ${ad.numero} - OP-${ad.op.numero}.pdf`, content: pdf.toString("base64") }],
    });
    resultados.push({ ...p, ok: !!r?.ok, error: r?.error || null });
  }
  const enviados = resultados.filter((r) => r.ok);
  if (!enviados.length) return NextResponse.json({ error: "Nenhum e-mail foi enviado: " + (resultados[0]?.error || "falha no envio") }, { status: 502 });
  await prisma.$transaction([
    ...enviados.map((r) => prisma.aditivoAceite.update({ where: { id: r.id }, data: { cobradoEm: new Date(), cobrancas: { increment: 1 } } })),
    prisma.auditLog.create({ data: { userId: user.id, action: "COBRAR_ACEITE_ADITIVO", entity: "Aditivo", entityId: ad.id, diff: { opNumero: ad.op.numero, aditivo: ad.numero, cobrados: enviados.map((r) => r.email) } } }),
  ]);
  return NextResponse.json({ success: true, enviados: enviados.length, falhas: resultados.filter((r) => !r.ok).map((r) => r.email) });
}
