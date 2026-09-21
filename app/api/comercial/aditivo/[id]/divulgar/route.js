// POST /api/comercial/aditivo/[id]/divulgar  { para: "a@x, b@y", mensagem? }
// Manda o Comunicado de Aditivo (PDF + e-mail com botão de aceite por pessoa), avisa no sino os
// módulos de produção e marca o aditivo como DIVULGADO. Vitor (16/09/2026): "um aviso para os
// setores sobre esses aditivos". Mesmo desenho do Kick Off (aceite por token, cobrança no painel).
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { blocoAceite, urlBase } from "@/lib/kickoff-email";
import { carregarComunicado, gerarComunicadoAditivoPDF, montarEmailAditivo } from "@/lib/aditivo-comunicado";
import { criarNotificacao } from "@/lib/notificacoes";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ para: z.string().min(3, "Informe os e-mails dos envolvidos"), mensagem: z.string().max(2000).optional().nullable() });
const MODULOS_AVISO = ["ENGENHARIA", "PLANEJAMENTO", "PCP", "PRODUCAO", "QUALIDADE", "EXPEDICAO", "COMPRAS", "FINANCEIRO", "FISCAL"];

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const emails = [...new Set(body.para.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const invalidos = emails.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!emails.length || invalidos.length) return NextResponse.json({ error: `E-mail inválido: ${invalidos.join(", ") || "(vazio)"}` }, { status: 400 });

  const dados = await carregarComunicado(params.id);
  if (!dados) return NextResponse.json({ error: "Aditivo não encontrado" }, { status: 404 });
  const { ad } = dados;

  const pdf = Buffer.from(await gerarComunicadoAditivoPDF(dados));
  const nomePdf = `Comunicado Aditivo ${ad.numero} - OP-${ad.op.numero}.pdf`;
  const { subject, html } = montarEmailAditivo({ dados, mensagem: body.mensagem, userName: user.name });
  const baseUrl = urlBase();

  const resultados = [];
  for (const email of emails) {
    // ⚠ reusa o convite de quem já tem (reenvio não duplica pendência), cria só para quem é novo
    let aceite = ad.aceites.find((a) => a.email.toLowerCase() === email);
    if (!aceite) aceite = await prisma.aditivoAceite.create({ data: { aditivoId: ad.id, email, token: randomUUID() } });
    const r = await sendEmail({
      to: email, replyTo: user.email || undefined, subject,
      html: html.replace("__ACEITE__", blocoAceite(`${baseUrl}/aditivo/aceite/${aceite.token}`)),
      text: `Aditivo ${ad.numero} da OP ${ad.op.numero} — ${ad.op.cliente}. Confirme seu aceite: ${baseUrl}/aditivo/aceite/${aceite.token}`,
      attachments: [{ filename: nomePdf, content: pdf.toString("base64") }],
    });
    resultados.push({ email, ok: !!r?.ok, error: r?.error || null });
  }
  const enviados = resultados.filter((r) => r.ok);
  if (!enviados.length) return NextResponse.json({ error: "Nenhum e-mail foi enviado: " + (resultados[0]?.error || "falha no envio") }, { status: 502 });

  const divulgadoPara = [...new Set([...(ad.divulgadoPara || "").split(",").map((s) => s.trim()).filter(Boolean), ...enviados.map((r) => r.email)])].join(", ");
  await prisma.aditivo.update({ where: { id: ad.id }, data: { status: ad.status === "RASCUNHO" ? "DIVULGADO" : ad.status, divulgadoEm: ad.divulgadoEm || new Date(), divulgadoPara } });
  await criarNotificacao({
    tipo: "ADITIVO_DIVULGADO", titulo: `Aditivo ${ad.numero} · OP-${ad.op.numero} · ${ad.op.cliente}`,
    mensagem: dados.pedido ? `${dados.pedido.rotulo} ${dados.pedido.codigo}${dados.pedido.descricao ? ` — ${dados.pedido.descricao}` : ""}` : (ad.descricao || "").slice(0, 160),
    link: `/comercial/${ad.op.id}?vista=obra#aditivo-${ad.numero}`, origemUserId: user.id, modulos: MODULOS_AVISO, chaveEvento: `aditivo-divulgado:${ad.id}`,
  });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "DIVULGAR_ADITIVO", entity: "Aditivo", entityId: ad.id,
            diff: { opNumero: ad.op.numero, aditivo: ad.numero, enviados: enviados.map((r) => r.email), falhas: resultados.filter((r) => !r.ok).map((r) => r.email) } },
  }).catch(() => {});
  return NextResponse.json({ success: true, enviados: enviados.length, falhas: resultados.filter((r) => !r.ok).map((r) => r.email) });
}
