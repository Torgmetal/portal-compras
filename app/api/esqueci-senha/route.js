// POST /api/esqueci-senha — envia código de 6 dígitos para o email do usuário
// POST /api/esqueci-senha?acao=verificar — valida o código
// POST /api/esqueci-senha?acao=resetar — altera a senha com código válido
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

// Gera código numérico de 6 dígitos (não começa com 0)
function gerarCodigo() {
  const n = crypto.randomInt(100000, 999999);
  return String(n);
}

// Máximo de códigos errados por token antes de invalidá-lo — trava o brute-force
// do código de 6 dígitos (900k combinações). Com 5 tentativas por token e
// expiração de 15 min, a chance de adivinhar é desprezível.
const MAX_TENTATIVAS = 5;

// Rate-limit por IP em CADA etapa (defesa em profundidade; o cap por token é o
// controle robusto por sobreviver a cold starts / múltiplas instâncias).
const limEnviar = createRateLimiter({ name: "esqueci-enviar", maxRequests: 5, windowMs: 15 * 60_000 });
const limTentar = createRateLimiter({ name: "esqueci-tentar", maxRequests: 12, windowMs: 15 * 60_000 });

// Comparação timing-safe de códigos de mesmo tamanho.
function codigoConfere(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Busca o token ATIVO do usuário (não usado, não expirado). Só existe um por vez
// (enviarCodigo invalida os anteriores).
function tokenAtivoDoUsuario(userId) {
  return prisma.passwordResetToken.findFirst({
    where: { userId, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
}

// Registra uma tentativa errada e invalida o token ao atingir o limite.
async function registrarTentativaErrada(token) {
  const tentativas = (token.tentativas || 0) + 1;
  await prisma.passwordResetToken.update({
    where: { id: token.id },
    data: { tentativas, ...(tentativas >= MAX_TENTATIVAS ? { used: true } : {}) },
  }).catch(() => {});
  return tentativas >= MAX_TENTATIVAS;
}

// ─── Schemas Zod ───────────────────────────────────────────────

const schemaEnviar = z.object({
  email: z.string().email("E-mail inválido").toLowerCase(),
});

const schemaVerificar = z.object({
  email: z.string().email().toLowerCase(),
  codigo: z.string().length(6, "Código deve ter 6 dígitos"),
});

const schemaResetar = z.object({
  email: z.string().email().toLowerCase(),
  codigo: z.string().length(6),
  novaSenha: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres"),
  confirmarSenha: z.string(),
}).refine((d) => d.novaSenha === d.confirmarSenha, {
  message: "As senhas não coincidem",
  path: ["confirmarSenha"],
});

// ─── POST ──────────────────────────────────────────────────────

export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const acao = searchParams.get("acao");

  if (acao === "verificar") return verificarCodigo(req);
  if (acao === "resetar") return resetarSenha(req);
  return enviarCodigo(req);
}

// ─── Etapa 1: Enviar código por email ─────────────────────────

async function enviarCodigo(req) {
  const rl = limEnviar(req);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Muitas solicitações. Tente novamente mais tarde." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body;
  try {
    body = schemaEnviar.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  // Sempre retorna sucesso para não revelar se o email existe
  const user = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true, name: true, ativo: true },
  });

  if (!user || !user.ativo) {
    // Simula delay para não dar timing attack
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
    return NextResponse.json({ success: true });
  }

  // Invalida tokens anteriores do usuário
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  // Gera novo código
  const codigo = gerarCodigo();
  await prisma.passwordResetToken.create({
    data: {
      token: codigo,
      userId: user.id,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutos
    },
  });

  // Envia email — para recuperação de senha o envio é obrigatório (não best-effort)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://workspace.torg.com.br";
  const resultado = await sendEmail({
    to: body.email,
    subject: "Código de recuperação de senha — Workspace Torg",
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="${baseUrl}/torg-logo.svg" alt="Torg Metal" width="140" style="margin-bottom: 8px;" />
          <p style="color: #576D7E; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; margin: 0;">Workspace Torg</p>
        </div>
        <h2 style="color: #002945; font-size: 20px; margin: 0 0 8px;">Recuperação de senha</h2>
        <p style="color: #576D7E; font-size: 14px; line-height: 1.6;">
          Olá <strong>${user.name}</strong>, você solicitou a recuperação de senha do seu acesso ao portal.
        </p>
        <div style="background: #F0F7FF; border: 2px solid #006EAB; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <p style="color: #576D7E; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Seu código de verificação</p>
          <p style="color: #002945; font-size: 36px; font-weight: 800; letter-spacing: 8px; margin: 0; font-family: monospace;">${codigo}</p>
        </div>
        <p style="color: #576D7E; font-size: 13px; line-height: 1.5;">
          Este código expira em <strong>15 minutos</strong>. Se você não solicitou essa recuperação, ignore este email.
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="color: #9CA3AF; font-size: 11px; text-align: center;">
          Workspace Torg — Portal interno da Torg Metal
        </p>
      </div>
    `,
    text: `Olá ${user.name}, seu código de recuperação de senha é: ${codigo}. Este código expira em 15 minutos.`,
  });

  // Se o envio falhou, invalida o token e avisa o usuário
  if (!resultado.ok) {
    console.error("[esqueci-senha] falha no envio do email para", body.email, ":", resultado.error);
    // Invalida o token para não deixar código perdido no banco
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });
    return NextResponse.json(
      { success: false, error: "Não foi possível enviar o e-mail. Tente novamente em alguns minutos." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

// ─── Etapa 2: Verificar código ─────────────────────────────────

async function verificarCodigo(req) {
  const rl = limTentar(req);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body;
  try {
    body = schemaVerificar.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Código inválido ou expirado." },
      { status: 400 }
    );
  }

  const token = await tokenAtivoDoUsuario(user.id);
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Código inválido ou expirado." },
      { status: 400 }
    );
  }

  // Confere o código com trava de tentativas: erra → incrementa; ao atingir o
  // limite, invalida o token (força pedir um novo).
  if (!codigoConfere(token.token, body.codigo)) {
    const bloqueou = await registrarTentativaErrada(token);
    return NextResponse.json(
      { success: false, error: bloqueou ? "Muitas tentativas erradas. Solicite um novo código." : "Código inválido ou expirado." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, valido: true });
}

// ─── Etapa 3: Resetar senha ───────────────────────────────────

async function resetarSenha(req) {
  const rl = limTentar(req);
  if (!rl.success) {
    return NextResponse.json(
      { success: false, error: "Muitas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  let body;
  try {
    body = schemaResetar.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Código inválido ou expirado." },
      { status: 400 }
    );
  }

  // Busca o token ATIVO do usuário e confere o código com trava de tentativas.
  const token = await tokenAtivoDoUsuario(user.id);
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Código inválido ou expirado. Solicite um novo." },
      { status: 400 }
    );
  }
  if (!codigoConfere(token.token, body.codigo)) {
    const bloqueou = await registrarTentativaErrada(token);
    return NextResponse.json(
      { success: false, error: bloqueou ? "Muitas tentativas erradas. Solicite um novo código." : "Código inválido ou expirado. Solicite um novo." },
      { status: 400 }
    );
  }

  // Atualiza senha e marca token como usado
  const hash = await bcrypt.hash(body.novaSenha, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hash },
    }),
    prisma.passwordResetToken.update({
      where: { id: token.id },
      data: { used: true },
    }),
  ]);

  // AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "password_reset_via_email",
      entity: "User",
      entityId: user.id,
      diff: { metodo: "codigo_email" },
    },
  });

  return NextResponse.json({ success: true });
}
