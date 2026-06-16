// POST /api/qualidade/data-books/[id]/enviar-cliente  { email }
// Gera o link público de aceite (token), marca ENVIADO_CLIENTE e envia o e-mail ao
// cliente. Exige ao menos 1 aprovação interna. Reenviar é permitido (reusa o token).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarTokenForte } from "@/lib/token";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const fmtOP = (n) => (n ? `OP-${String(n).padStart(3, "0")}` : "—");

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "QUALIDADE"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = z.object({ email: z.string().email("E-mail inválido").toLowerCase() }).parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 });
  }

  const book = await prisma.dataBookQualidade.findUnique({
    where: { id: params.id },
    include: { aprovacoes: { select: { id: true } } },
  });
  if (!book) return NextResponse.json({ success: false, error: "Data book não encontrado" }, { status: 404 });
  if (book.aprovacoes.length === 0) {
    return NextResponse.json({ success: false, error: "O data book precisa de ao menos uma aprovação interna antes de enviar ao cliente." }, { status: 400 });
  }
  if (book.status === "ACEITO") {
    return NextResponse.json({ success: false, error: "Este data book já foi aceito pelo cliente." }, { status: 400 });
  }

  const token = book.tokenCliente || gerarTokenForte(32);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const baseUrl = (process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.startsWith("http")) ? process.env.NEXTAUTH_URL : (host ? `https://${host}` : "");
  const link = `${baseUrl}/data-book/aceite/${token}`;

  await prisma.dataBookQualidade.update({
    where: { id: params.id },
    data: { tokenCliente: token, clienteEmail: body.email, enviadoClienteEm: new Date(), status: book.status === "ACEITO" ? "ACEITO" : "ENVIADO_CLIENTE" },
  });

  const op = fmtOP(book.opNumero);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#002945">
      <div style="background:#002945;padding:22px 24px;border-radius:8px 8px 0 0">
        <div style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:.5px">TORG METAL</div>
        <div style="color:#9ec0e0;font-size:12px;margin-top:2px">Data Book da Qualidade</div>
      </div>
      <div style="border:1px solid #e3e6ea;border-top:none;border-radius:0 0 8px 8px;padding:24px">
        <p style="font-size:15px;margin:0 0 12px">Prezado(a) cliente,</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
          O Data Book da Qualidade ${book.obra ? `da obra <strong>${book.obra}</strong> ` : ""}(<strong>${op}</strong>) está concluído e disponível para sua revisão e aceite.
        </p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 20px">
          Acesse o link abaixo para visualizar e baixar o dossiê completo. Não havendo ressalvas, confirme o recebimento e o aceite da obra com um clique.
        </p>
        <p style="text-align:center;margin:0 0 22px">
          <a href="${link}" style="background:#006eab;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">Abrir Data Book e dar aceite</a>
        </p>
        <p style="font-size:12px;color:#576d7e;line-height:1.5;margin:0;border-top:1px solid #eee;padding-top:14px">
          Se o botão não funcionar, copie e cole no navegador:<br><span style="color:#006eab;word-break:break-all">${link}</span>
        </p>
      </div>
    </div>`;
  const text = `Data Book da Qualidade ${op}${book.obra ? " — " + book.obra : ""}. Acesse para revisar e dar o aceite: ${link}`;

  let enviado = true;
  try {
    await sendEmail({ to: body.email, subject: `Data Book da Qualidade — ${op}${book.obra ? " — " + book.obra : ""} (para seu aceite)`, html, text });
  } catch {
    enviado = false; // o link continua válido; o e-mail pode ser reenviado/copiado
  }

  await prisma.auditLog
    .create({ data: { userId: user.id, action: "ENVIAR_DATABOOK_CLIENTE", entity: "DataBookQualidade", entityId: params.id, diff: { email: body.email, enviado } } })
    .catch(() => {});

  return NextResponse.json({ success: true, link, enviado });
}
