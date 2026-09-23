import { prisma } from "@/lib/prisma";
import { normalizar, STATUS } from "@/lib/fiscal/classificacao-produto";

// ─── AS TRANSIÇÕES DO REGISTRO ───────────────────────────────────────────────
//
// ⚠⚠ DEPOIS DE APROVADA, A LINHA NÃO SE EDITA (achado do Codex, 23/09/2026). Padrão, código, NCM e
// fundamento são o CONTEÚDO da decisão: mudá-los em lugar apagaria a decisão que já orientou uma
// emissão, e o histórico é justamente o que dá valor ao registro. Trocar exige `substituir`, que
// revoga a anterior e aprova a nova na MESMA transação — dois passos soltos deixariam a janela em
// que nenhuma das duas vale, ou pior, as duas.
//
// ⚠ A auditoria vai na mesma transação, e o estado anterior é conferido DENTRO dela (`updateMany`
// com o status esperado no `where`). Ler antes e gravar depois deixa duas aprovações simultâneas
// passarem — a mesma lição da Conferência de Peça.

const CAMPOS = {
  id: true, codigoProduto: true, padraoDescricao: true, padraoNormalizado: true, ncm: true,
  fundamento: true, normaChave: true, observacao: true, status: true, substituiId: true,
  criadoPorId: true, criadoPorNome: true, criadoEm: true,
  aprovadoPorId: true, aprovadoPorNome: true, aprovadoEm: true,
  revogadoPorId: true, revogadoPorNome: true, revogadoEm: true, motivoRevogacao: true,
};

const auditar = (tx, { user, action, id, diff }) => tx.auditLog.create({
  data: { userId: user.id, action, entity: "FiscalClassificacaoProduto", entityId: id, diff },
});

const quem = (user) => ({ id: user.id, nome: user.name ?? user.email ?? user.id });

/**
 * TODOS os verbetes APROVADOS, para o casamento em lote.
 *
 * ⚠⚠ EM LOTE, NUNCA POR ITEM (achado do Codex): uma NF-e de 24 itens viraria 24 consultas, e os
 * verbetes globais seriam relidos 24 vezes. A tabela é pequena por natureza — é um cadastro que a
 * contabilidade escreve à mão.
 *
 * ⚠⚠ E SE A LEITURA FALHAR, QUEM CHAMA RECEBE `null`, não uma lista vazia. Lista vazia vira "não há
 * classificação para esta peça", que é uma AFIRMAÇÃO sobre o cadastro — e o cadastro não foi lido.
 */
export async function verbetesAprovados() {
  try {
    return await prisma.fiscalClassificacaoProduto.findMany({
      where: { status: STATUS.APROVADA },
      select: CAMPOS,
      orderBy: [{ codigoProduto: "asc" }, { padraoNormalizado: "asc" }],
    });
  } catch {
    return null;
  }
}

export async function listar({ status } = {}) {
  return prisma.fiscalClassificacaoProduto.findMany({
    where: status ? { status } : undefined,
    select: CAMPOS,
    orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
  });
}

/** Propor é gratuito e não orienta ninguém — por isso não tem trava além do padrão não-vazio. */
export async function propor(dados, user) {
  const padraoNormalizado = normalizar(dados.padraoDescricao);
  if (!padraoNormalizado) throw new Error("O padrão da descrição não pode ser vazio depois de normalizado.");

  return prisma.$transaction(async (tx) => {
    const linha = await tx.fiscalClassificacaoProduto.create({
      data: {
        codigoProduto: dados.codigoProduto?.trim() || null,
        padraoDescricao: dados.padraoDescricao.trim(),
        padraoNormalizado,
        ncm: String(dados.ncm).replace(/\D/g, ""),
        fundamento: dados.fundamento.trim(),
        normaChave: dados.normaChave?.trim() || null,
        observacao: dados.observacao?.trim() || null,
        substituiId: dados.substituiId ?? null,
        status: STATUS.PROPOSTA,
        criadoPorId: user.id,
        criadoPorNome: quem(user).nome,
      },
      select: CAMPOS,
    });
    await auditar(tx, { user, action: "FISCAL_CLASSIFICACAO_PROPOR", id: linha.id, diff: { depois: linha } });
    return linha;
  });
}

/**
 * ⚠⚠ O CONFLITO DE ÍNDICE PARCIAL É RESPOSTA, NÃO ERRO 500. Duas propostas com o mesmo padrão
 * aprovadas quase juntas: a segunda bate no índice único e precisa dizer *por quê* — senão quem
 * clicou vê "erro ao aprovar" e tenta de novo para sempre.
 */
const ehConflito = (e) => /Unique constraint|23505|_aprovada_/i.test(String(e?.message ?? ""));

export async function aprovar(id, user) {
  try {
    return await prisma.$transaction(async (tx) => {
      const antes = await tx.fiscalClassificacaoProduto.findUnique({ where: { id }, select: CAMPOS });
      if (!antes) throw new Error("NAO_ENCONTRADA");
      const n = await tx.fiscalClassificacaoProduto.updateMany({
        where: { id, status: STATUS.PROPOSTA },
        data: { status: STATUS.APROVADA, aprovadoPorId: quem(user).id, aprovadoPorNome: quem(user).nome, aprovadoEm: new Date() },
      });
      if (n.count === 0) throw new Error("ESTADO_MUDOU");
      const depois = await tx.fiscalClassificacaoProduto.findUnique({ where: { id }, select: CAMPOS });
      await auditar(tx, { user, action: "FISCAL_CLASSIFICACAO_APROVAR", id, diff: { antes, depois } });
      return depois;
    });
  } catch (e) {
    if (ehConflito(e)) throw new Error("JA_EXISTE_APROVADA");
    throw e;
  }
}

export async function revogar(id, motivo, user) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.fiscalClassificacaoProduto.findUnique({ where: { id }, select: CAMPOS });
    if (!antes) throw new Error("NAO_ENCONTRADA");
    const n = await tx.fiscalClassificacaoProduto.updateMany({
      where: { id, status: { in: [STATUS.PROPOSTA, STATUS.APROVADA] } },
      data: { status: STATUS.REVOGADA, revogadoPorId: quem(user).id, revogadoPorNome: quem(user).nome, revogadoEm: new Date(), motivoRevogacao: motivo?.trim() || null },
    });
    if (n.count === 0) throw new Error("ESTADO_MUDOU");
    const depois = await tx.fiscalClassificacaoProduto.findUnique({ where: { id }, select: CAMPOS });
    await auditar(tx, { user, action: "FISCAL_CLASSIFICACAO_REVOGAR", id, diff: { antes, depois } });
    return depois;
  });
}

/**
 * TROCAR uma classificação aprovada por outra — revoga a anterior e aprova a nova NA MESMA
 * TRANSAÇÃO.
 *
 * ⚠⚠ DOIS PASSOS SOLTOS NÃO SERVEM. Revogar e depois aprovar deixa uma janela em que a peça não
 * tem classificação nenhuma; aprovar e depois revogar bate no índice único, porque por um instante
 * as duas valem. E o índice existe justamente para isso não acontecer.
 *
 * ⚠ A nova nasce APROVADA, com `substituiId` apontando para a anterior: é a cadeia da decisão, e é
 * o que permite responder "o que valia antes desta" sem adivinhar por data.
 */
export async function substituir(idAntiga, dados, user) {
  const padraoNormalizado = normalizar(dados.padraoDescricao);
  if (!padraoNormalizado) throw new Error("O padrão da descrição não pode ser vazio depois de normalizado.");

  try {
    return await prisma.$transaction(async (tx) => {
      const antes = await tx.fiscalClassificacaoProduto.findUnique({ where: { id: idAntiga }, select: CAMPOS });
      if (!antes) throw new Error("NAO_ENCONTRADA");
      const n = await tx.fiscalClassificacaoProduto.updateMany({
        where: { id: idAntiga, status: STATUS.APROVADA },
        data: { status: STATUS.REVOGADA, revogadoPorId: quem(user).id, revogadoPorNome: quem(user).nome, revogadoEm: new Date(), motivoRevogacao: dados.motivoRevogacao?.trim() || "Substituída por uma classificação nova." },
      });
      if (n.count === 0) throw new Error("ESTADO_MUDOU");

      const nova = await tx.fiscalClassificacaoProduto.create({
        data: {
          codigoProduto: dados.codigoProduto?.trim() || null,
          padraoDescricao: dados.padraoDescricao.trim(),
          padraoNormalizado,
          ncm: String(dados.ncm).replace(/\D/g, ""),
          fundamento: dados.fundamento.trim(),
          normaChave: dados.normaChave?.trim() || null,
          observacao: dados.observacao?.trim() || null,
          substituiId: idAntiga,
          status: STATUS.APROVADA,
          criadoPorId: quem(user).id, criadoPorNome: quem(user).nome,
          aprovadoPorId: quem(user).id, aprovadoPorNome: quem(user).nome, aprovadoEm: new Date(),
        },
        select: CAMPOS,
      });
      await auditar(tx, { user, action: "FISCAL_CLASSIFICACAO_SUBSTITUIR", id: nova.id, diff: { antes, depois: nova } });
      return nova;
    });
  } catch (e) {
    if (ehConflito(e)) throw new Error("JA_EXISTE_APROVADA");
    throw e;
  }
}
