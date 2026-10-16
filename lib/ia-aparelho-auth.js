// ─── AUTENTICAÇÃO DO APARELHO (token do PC do projetista) ───────────────────────────────────────
//
// Compartilhada pelo portão de IA (`lib/ia-portao.js`) e pelas rotas `/api/engenharia-ia/app/*`: o app Torg
// Engenharia não tem sessão NextAuth, só o token do aparelho. Ordem: aparelho ATIVO → usuário ativo com o módulo
// ENGENHARIA (ou ADMIN, mesma regra do `requireRole`).
//
// ⚠ Este helper NÃO grava consumo (`iaUso`): quem registra "recusado_acesso" é o portão, que é quem tem esse
// conceito. Por isso a recusa 403 devolve `aparelho` junto — para o portão registrar sem reler o banco.
import "server-only";
import { prisma } from "./prisma";
import { hashToken } from "./ia-engenharia";

export function tokenDoPedido(req) {
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return bearer || req.headers.get("x-api-key")?.trim() || null;
}

/** @returns {Promise<{aparelho, user} | {recusa: {status: 401|403, mensagem: string, aparelho?: object}}>} */
export async function autenticarAparelho(req) {
  const token = tokenDoPedido(req);
  if (!token) return { recusa: { status: 401, mensagem: "Aparelho não identificado: ligue este PC à sua conta no portal (Engenharia › IA › Vincular)." } };
  const aparelho = await prisma.iaAparelho.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!aparelho || aparelho.status !== "ATIVO" || !aparelho.userId) {
    return { recusa: { status: 401, mensagem: "Este aparelho não está autorizado (revogado ou não aprovado). Fale com o administrador do portal." } };
  }
  const user = await prisma.user.findUnique({ where: { id: aparelho.userId }, select: { id: true, ativo: true, tipo: true, name: true } });
  const temModulo = user?.tipo === "ADMIN" || (user && await prisma.userModulo.findFirst({ where: { userId: user.id, modulo: "ENGENHARIA" } }));
  if (!user?.ativo || !temModulo) {
    return { recusa: { status: 403, mensagem: "Seu usuário não tem acesso ao módulo Engenharia no portal.", aparelho } };
  }
  return { aparelho, user };
}

/** Recusa no formato das rotas /app: `{ ok:false, error }`. */
export function respostaRecusa(recusa) {
  return Response.json({ ok: false, error: recusa.mensagem }, { status: recusa.status, headers: { "cache-control": "no-store" } });
}

/**
 * Autentica e chama `fn({ aparelho, user })`. Exceção vira 500 genérico — a mensagem real (que pode citar banco,
 * caminhos ou SQL) fica no log do servidor, nunca na resposta ao PC do projetista.
 */
export async function comAparelho(req, fn) {
  try {
    const r = await autenticarAparelho(req);
    if (r.recusa) return respostaRecusa(r.recusa);
    return await fn({ aparelho: r.aparelho, user: r.user });
  } catch (e) {
    console.error("[engenharia-ia/app] falha interna:", e);
    return Response.json({ ok: false, error: "falha interna" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
