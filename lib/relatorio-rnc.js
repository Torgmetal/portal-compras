import "server-only";
import { prisma } from "./prisma";

/**
 * A RNC aberta pela reprovação (número e ano), para o "RNC Nº" do pull-off sair sozinho — em TODO caminho que
 * gera o PDF: a tela (`pdfDoRelatorio`), o link de assinatura, o anexo do e-mail e a cópia arquivada na pasta
 * da obra. Até a verificação de 02/10/2026 só a tela buscava, e quem assinava recebia o campo em branco.
 * Só o pull-off tem o campo; falhar a consulta não segura o documento (sai o que o inspetor digitou).
 * @returns {Promise<{numero:number, ano:number}|null>}
 */
export async function rncDoRelatorio(rel) {
  if (!rel?.rncId || rel.tipo !== "PULL_OFF") return null;
  return prisma.naoConformidade.findUnique({ where: { id: rel.rncId }, select: { numero: true, ano: true } }).catch(() => null);
}
