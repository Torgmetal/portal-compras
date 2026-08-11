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

/** Um caminho (pasta) pode ser listado? Raiz ("") sempre; dentro de uma pasta liberada; ou
 *  um ancestral de algum documento escolhido (navegação da árvore virtual que recria as pastas). */
export function caminhoPermitido(path, share) {
  if (path === "") return true;
  const pastas = share?.pastas || [];
  const documentos = share?.documentos || [];
  if (pastas.some((P) => path === P || path.startsWith(P + "/"))) return true;
  if (documentos.some((d) => d.startsWith(path + "/"))) return true;
  return false;
}

/** Reconstrói a estrutura de pastas dos DOCUMENTOS escolhidos: dado um caminho, devolve as
 *  subpastas (virtuais) e os arquivos que estão diretamente nele. Mantém tudo organizado
 *  por seção/pasta em vez de jogar os PDFs soltos na raiz (Vitor 09/08). */
export function filhosDosDocumentos(documentos, path) {
  const prefixo = path ? path + "/" : "";
  const pastas = new Set();
  const arquivos = [];
  for (const d of documentos || []) {
    if (!d.startsWith(prefixo)) continue;
    const resto = d.slice(prefixo.length);
    const barra = resto.indexOf("/");
    if (barra === -1) arquivos.push({ nome: resto, tipo: "file", caminho: d });
    else pastas.add(resto.slice(0, barra));
  }
  return {
    pastas: [...pastas].map((f) => ({ nome: f, tipo: "folder", caminho: prefixo + f })),
    arquivos,
  };
}

/** Um arquivo pode ser baixado? DENTRO de uma pasta liberada OU listado nos documentos
 *  específicos do link (e ser PDF — checado à parte). */
export function arquivoPermitido(path, share) {
  const pastas = share?.pastas || [];
  const documentos = share?.documentos || [];
  return documentos.includes(path) || pastas.some((P) => path.startsWith(P + "/"));
}

/** Registra o acesso (contagem + último acesso) sem bloquear a resposta. */
export function registrarAcesso(id) {
  prisma.compartilhamentoSGQ.update({ where: { id }, data: { acessos: { increment: 1 }, ultimoAcesso: new Date() } }).catch(() => {});
}
