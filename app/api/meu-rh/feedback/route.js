// POST /api/meu-rh/feedback  { mensagem, categoria?, anonimo? }
// Funcionário envia sugestão/feedback ao RH. Guarda no banco e avisa o RH por e-mail.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFuncionario } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const CATEGORIAS = ["SUGESTAO", "RECLAMACAO", "ELOGIO", "DUVIDA", "OUTRO"];
const CAT_LABEL = { SUGESTAO: "Sugestão", RECLAMACAO: "Reclamação", ELOGIO: "Elogio", DUVIDA: "Dúvida", OUTRO: "Outro" };

const schema = z.object({
  mensagem: z.string().trim().min(3, "Escreva sua mensagem").max(4000),
  categoria: z.enum(CATEGORIAS).optional().default("SUGESTAO"),
  anonimo: z.boolean().optional().default(false),
});

export async function POST(req) {
  let user;
  try { user = await requireFuncionario(); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const { mensagem, categoria, anonimo } = parsed.data;

  const func = await prisma.funcionario.findUnique({
    where: { id: user.funcionarioId },
    select: { nome: true, email: true, setor: { select: { nome: true } } },
  });

  const fb = await prisma.feedbackRH.create({
    data: {
      funcionarioId: anonimo ? null : user.funcionarioId,
      funcionarioNome: anonimo ? null : (func?.nome || user.name || null),
      anonimo, categoria, mensagem,
    },
  });

  // Notifica o RH por e-mail (best-effort — o feedback já está salvo de qualquer forma).
  try {
    let rh = await prisma.user.findMany({
      where: { ativo: true, email: { not: null }, modulos: { some: { modulo: "RH" } } },
      select: { email: true },
    });
    if (!rh.length) {
      rh = await prisma.user.findMany({ where: { ativo: true, tipo: "ADMIN", email: { not: null } }, select: { email: true } });
    }
    const destinos = [...new Set(rh.map((u) => u.email).filter(Boolean))];
    if (destinos.length) {
      const autor = anonimo ? "Funcionário (anônimo)" : `${func?.nome || user.name}${func?.setor?.nome ? " · " + func.setor.nome : ""}`;
      const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#002945">
        <p style="font-size:15px"><strong>💬 Novo feedback no portal do funcionário</strong></p>
        <p style="margin:4px 0"><strong>Tipo:</strong> ${escapeHtml(CAT_LABEL[categoria] || categoria)}</p>
        <p style="margin:4px 0"><strong>De:</strong> ${escapeHtml(autor)}</p>
        <div style="background:#f6f8fa;border:1px solid #eee;border-radius:8px;padding:14px;margin:12px 0;white-space:pre-wrap;font-size:14px">${escapeHtml(mensagem)}</div>
        <p><a href="${origin}/rh/mural" style="display:inline-block;background:#006EAB;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">Ver no portal</a></p>
      </div>`;
      const text = `Novo feedback (${CAT_LABEL[categoria] || categoria}) de ${autor}:\n\n${mensagem}\n\nVer: ${origin}/rh/mural`;
      await sendEmail({
        to: destinos,
        subject: `💬 Feedback do funcionário — ${CAT_LABEL[categoria] || categoria}`,
        html, text,
        ...(anonimo || !func?.email ? {} : { replyTo: func.email }),
      });
    }
  } catch { /* segue */ }

  return NextResponse.json({ success: true, id: fb.id });
}
