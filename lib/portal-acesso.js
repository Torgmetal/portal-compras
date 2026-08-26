import "server-only";
import { prisma } from "./prisma";

// ─── O REGISTRO DE QUEM ABRIU E DO QUE BAIXOU ─────────────────────────────────
// Vitor (26/08/2026): "preciso do histórico do acesso, através do e-mail enviado, e o que foi
// aberto e feito download, para as pessoas que enviamos".
//
// ⚠ REGISTRAR NUNCA PODE DERRUBAR O ACESSO. Se a gravação falhar, o cliente continua vendo a obra
// e baixando o documento — perder uma linha de histórico é ruim; barrar o cliente na porta por
// causa dela seria pior, e é exatamente o tipo de erro que só aparece no pior momento.
const ip = (req) =>
  (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
  req.headers.get("x-real-ip") || null;

/** Quem é a pessoa por trás do `?d=` do link. Sem código, o acesso fica anônimo — e isso é dado. */
export async function destinatarioDoCodigo(codigo, portalId) {
  if (!codigo) return null;
  return prisma.portalDestinatario
    .findFirst({ where: { codigo: String(codigo), portalId }, select: { id: true, nome: true, email: true } })
    .catch(() => null);
}

export async function registrarAcesso(req, { portal, codigo, evento, documento = null, documentoId = null, secao = null }) {
  try {
    const dest = await destinatarioDoCodigo(codigo, portal.id);
    await prisma.portalAcesso.create({
      data: {
        portalId: portal.id, opNumero: portal.opNumero,
        destinatarioId: dest?.id || null, email: dest?.email || null,
        evento, documento, documentoId, secao,
        ip: ip(req), userAgent: (req.headers.get("user-agent") || "").slice(0, 300) || null,
      },
    });
    const agora = new Date();
    if (dest) {
      await prisma.portalDestinatario.update({
        where: { id: dest.id },
        data: {
          ...(evento === "DOWNLOAD" ? { downloads: { increment: 1 } } : { aberturas: { increment: 1 } }),
          ultimoAcessoEm: agora,
          // ⚠ o primeiro acesso só se grava uma vez — é o dado que responde "ele chegou a abrir?"
          ...(await primeiroAinda(dest.id) ? { primeiroAcessoEm: agora } : {}),
        },
      });
    }
  } catch { /* silêncio de propósito: ver o comentário do topo */ }
}

async function primeiroAinda(id) {
  const d = await prisma.portalDestinatario.findUnique({ where: { id }, select: { primeiroAcessoEm: true } }).catch(() => null);
  return d ? !d.primeiroAcessoEm : false;
}
