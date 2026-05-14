// GET /api/email-teste — endpoint de diagnostico do Resend.
// Mostra status da config + dispara email de teste pro usuario logado.
// Util pra validar rapido apos configurar RESEND_API_KEY no Vercel.
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function GET() {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMPRAS"]);
  } catch {
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 });
  }

  const status = {
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM || "(nao definido — usando default onboarding@resend.dev)",
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "(nao definido — usando default workspace-torg.vercel.app)",
    userEmail: user.email,
  };

  if (!status.RESEND_API_KEY) {
    return NextResponse.json({
      ok: false,
      status,
      msg: "RESEND_API_KEY nao configurada. Email nao sera enviado. Configure no Vercel: Settings -> Environment Variables -> Add RESEND_API_KEY com o valor da sua conta Resend (resend.com).",
    });
  }

  const result = await sendEmail({
    to: user.email,
    subject: "[Workspace Torg] Teste de envio de email",
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 540px; margin: 0 auto;">
        <h2 style="color: #0a3a5c;">Email funcionando ✓</h2>
        <p style="color: #4a5568;">
          Esse e o email de teste do Workspace Torg. Se voce esta lendo isso,
          a config do Resend ta correta e os emails de notificacao vao chegar normalmente.
        </p>
        <p style="margin-top: 24px;">
          <a href="https://workspace-torg.vercel.app/compras"
             style="background: #1976d2; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
            Abrir Workspace Torg
          </a>
        </p>
      </div>
    `,
    text: "Email funcionando. Workspace Torg ja consegue mandar notificacoes.",
  });

  return NextResponse.json({
    ok: result.ok,
    status,
    resendResult: result,
    enviadoPara: user.email,
  });
}
