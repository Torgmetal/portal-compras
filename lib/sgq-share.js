import "server-only";
import { prisma } from "@/lib/prisma";

// Base do SGQ no servidor (SharePoint). O compartilhamento externo é sempre relativo a ela.
export const SGQ_BASE = "/Administrativo/SGQ ISO 9001-2015";

/** Valida um token de compartilhamento: existe, ativo e não expirado. Retorna o share ou null. */
export async function validarShare(token) {
  if (!token) return null;
  let s;
  try { s = await prisma.compartilhamentoSGQ.findUnique({ where: { token } }); } catch { return null; }
  if (!s || !s.ativo) return null;
  if (s.expiraEm && new Date(s.expiraEm) < new Date()) return null;
  return s;
}

/** Um caminho (pasta) pode ser listado? Raiz ("") mostra as pastas liberadas; senão precisa
 *  estar dentro de uma delas. */
export function caminhoPermitido(path, pastas) {
  if (path === "") return true;
  return (pastas || []).some((P) => path === P || path.startsWith(P + "/"));
}

/** Um arquivo pode ser baixado? Precisa estar DENTRO de uma pasta liberada (e ser PDF — checado à parte). */
export function arquivoPermitido(path, pastas) {
  return (pastas || []).some((P) => path.startsWith(P + "/"));
}

/** Registra o acesso (contagem + último acesso) sem bloquear a resposta. */
export function registrarAcesso(id) {
  prisma.compartilhamentoSGQ.update({ where: { id }, data: { acessos: { increment: 1 }, ultimoAcesso: new Date() } }).catch(() => {});
}
