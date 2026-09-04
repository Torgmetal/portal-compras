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
export async function completarImagens(assinaturas) {
  const lista = Array.isArray(assinaturas) ? assinaturas : [];
  const semImagem = lista.filter((a) => a?.assinadoEm && !a?.imagemUrl && a?.email);
  if (!semImagem.length) return lista;

  const emails = [...new Set(semImagem.map((a) => String(a.email).toLowerCase()))];
  const users = await prisma.user.findMany({
    where: { email: { in: emails }, assinaturaUrl: { not: null } },
    select: { email: true, assinaturaUrl: true },
  }).catch(() => []);
  if (!users.length) return lista;

  const porEmail = new Map(users.map((u) => [String(u.email).toLowerCase(), u.assinaturaUrl]));
  return lista.map((a) => (
    a?.assinadoEm && !a?.imagemUrl && a?.email && porEmail.has(String(a.email).toLowerCase())
      ? { ...a, imagemUrl: porEmail.get(String(a.email).toLowerCase()) }
      : a
  ));
}
