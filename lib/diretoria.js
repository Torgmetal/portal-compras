import "server-only";
import { prisma } from "./prisma";
import { requireUser } from "./session";

// Módulo Diretoria — acesso restrito por allowlist de e-mail. Ao contrário do
// requireRole/requireAcesso (onde ADMIN passa por tudo), aqui NINGUÉM entra sem
// estar liberado: só o dono e quem ele incluir na AcessoDiretoria.
export const DIRETORIA_OWNER = "vitor@torg.com.br";

const norm = (e) => (e || "").toLowerCase().trim();

export function ehDonoDiretoria(email) {
  return norm(email) === DIRETORIA_OWNER;
}

/** true se o e-mail é o dono OU está na allowlist. */
export async function temAcessoDiretoria(email) {
  const e = norm(email);
  if (!e) return false;
  if (e === DIRETORIA_OWNER) return true;
  const row = await prisma.acessoDiretoria.findUnique({ where: { email: e } });
  return !!row;
}

/** Gate da página/API do módulo — Forbidden se não estiver liberado (nem ADMIN burla). */
export async function requireDiretoria() {
  const user = await requireUser();
  if (!(await temAcessoDiretoria(user.email))) throw new Error("Forbidden");
  return user;
}

/** Só o dono gerencia a allowlist (liberar/revogar). */
export async function requireDonoDiretoria() {
  const user = await requireUser();
  if (!ehDonoDiretoria(user.email)) throw new Error("Forbidden");
  return user;
}
