import "server-only";
import { prisma } from "@/lib/prisma";

// ─── A IMAGEM DA ASSINATURA, QUANDO O SNAPSHOT NÃO TEM ───────────────────────────────────────
//
// `AssinaturaDocumento.imagemUrl` é um SNAPSHOT: a imagem do cadastro copiada no ato de assinar.
// O snapshot é proposital — quando alguém troca a imagem no cadastro, o documento antigo continua
// mostrando o que valia no dia.
//
// ⚠⚠ SÓ QUE QUEM ASSINOU ANTES DE TER IMAGEM FICAVA SEM ELA PARA SEMPRE. Vitor (04/09/2026): "a
// assinatura dos relatórios deve sair conforme a imagem que deixamos anexa no cadastro (…) o
// Alexandre Stival já assinou". A conta dele não tinha imagem na hora de assinar, então o documento
// saiu só com nome e data — e anexar a imagem depois não mudava nada, porque o snapshot já estava
// gravado vazio. A única saída era pedir para assinar de novo.
//
// Aqui o vazio é preenchido com a imagem ATUAL do cadastro, casando por e-mail. Não é reescrever
// história: é usar o que existe onde não havia nada. Assinatura que JÁ tem imagem não é tocada.
//
// ⚠ Não confundir com lib/assinatura-imagem.js, que é o preparo da foto no navegador (recorte e
// limpeza) antes de subir para o cadastro.
// ⚠⚠ O CARIMBO É DO TITULAR DA ASSINATURA, NÃO DE QUEM RECEBEU O LINK. Vitor (24/09/2026): "Relatório
// de EVS e LP da OP-102 está puxando os relatórios sem assinatura". Naquela manhã os convites pendentes
// do Alexandre Stival foram desviados para o e-mail do Vitor, a pedido dele — o registro é o
// REDIRECIONAR_CONVITE_ASSINATURA do AuditLog: "apenas destino alterado", nome mantido. Ele assinou
// pelos links, a imagem foi procurada pelo e-mail do CONVITE (o dele, sem carimbo cadastrado) e o
// quadro do Alexandre saiu só com nome e data nos cinco. Nos RIP-102 o carimbo tinha sido posto à mão
// uma hora antes, também a pedido dele (CORRIGIR_CARIMBO_ASSINATURA).
//
// O registro do desvio é o único lugar que guarda de quem a assinatura é. Lido daqui, o carimbo segue
// o titular — no ato de assinar (`imagemDoCadastro`) e em quem já assinou (`completarImagens`).
// ⚠ Titular sem imagem NÃO cai para a imagem de quem recebeu o link: seria a assinatura de uma pessoa
// no quadro de outra.
const DESVIO_DE_CONVITE = "REDIRECIONAR_CONVITE_ASSINATURA";

/** id da assinatura → e-mail do TITULAR (o destino de antes do primeiro desvio). */
export async function titularesDesviados(ids) {
  const lista = [...new Set((ids || []).filter(Boolean))];
  if (!lista.length) return new Map();
  const logs = await prisma.auditLog.findMany({
    where: { action: DESVIO_DE_CONVITE, entity: "AssinaturaDocumento", entityId: { in: lista } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, diff: true },
  }).catch(() => []);
  const titular = new Map();
  for (const l of logs || []) {
    const email = l?.diff?.antes?.email;
    if (email && !titular.has(l.entityId)) titular.set(l.entityId, String(email).toLowerCase());
  }
  return titular;
}

export async function completarImagens(assinaturas) {
  const lista = Array.isArray(assinaturas) ? assinaturas : [];
  const semImagem = lista.filter((a) => a?.assinadoEm && !a?.imagemUrl && (a?.email || a?.id));
  if (!semImagem.length) return lista;

  const titulares = await titularesDesviados(semImagem.map((a) => a.id));
  const emailDoCarimbo = (a) => titulares.get(a?.id) || (a?.email ? String(a.email).toLowerCase() : null);
  const emails = [...new Set(semImagem.map(emailDoCarimbo).filter(Boolean))];
  if (!emails.length) return lista;
  const users = await prisma.user.findMany({
    where: { email: { in: emails }, assinaturaUrl: { not: null } },
    select: { email: true, assinaturaUrl: true },
  }).catch(() => []);
  if (!users?.length) return lista;

  const porEmail = new Map(users.map((u) => [String(u.email).toLowerCase(), u.assinaturaUrl]));
  return lista.map((a) => {
    if (!a?.assinadoEm || a?.imagemUrl) return a;
    const email = emailDoCarimbo(a);
    return email && porEmail.has(email) ? { ...a, imagemUrl: porEmail.get(email) } : a;
  });
}

/** A imagem do cadastro que vai no quadro desta assinatura, no ato de assinar: a do titular, se o convite foi desviado. */
export async function imagemDoCadastro(a) {
  const [comImagem] = await completarImagens([{ id: a?.id, email: a?.email, assinadoEm: new Date(), imagemUrl: null }]);
  return comImagem?.imagemUrl || null;
}
