import "server-only";
import { prisma } from "@/lib/prisma";
import { SITUACAO } from "@/lib/fiscal/politica-regras";

// ─── O REGISTRO DE VALIDAÇÃO DAS REGRAS ──────────────────────────────────────
//
// Quem leu o banco. A regra em si não mora aqui — mora em `lib/fiscal/`, no git.
//
// ⚠⚠ CADA DECISÃO É UMA LINHA NOVA; a vigente é a mais recente por `regraId`. Sobrescrever apagaria
// a contestação que motivou a revisão, que é justamente o que alguém vai querer ler depois para
// entender por que a regra mudou.

const CAMPOS = { id: true, regraId: true, estado: true, impressao: true, fonte: true, ressalva: true, porId: true, porNome: true, em: true };

/**
 * A decisão VIGENTE de cada regra, em lote.
 *
 * ⚠⚠ DEVOLVE `null` QUANDO A LEITURA FALHA, nunca um Map vazio. Map vazio diria "nenhuma regra foi
 * contestada" — uma afirmação sobre um registro que ninguém conseguiu ler. Quem consome transforma
 * o `null` em recomendação SUSPENSA, não em recomendação liberada.
 */
export async function decisoesVigentes() {
  try {
    // ⚠ Uma consulta só: o catálogo tem dezenas de regras e o simulador pergunta por várias por vez.
    const linhas = await prisma.fiscalValidacaoRegra.findMany({ select: CAMPOS, orderBy: { em: "asc" } });
    const porRegra = new Map();
    for (const l of linhas) porRegra.set(l.regraId, l); // a última da ordem crescente vence
    return porRegra;
  } catch {
    return null;
  }
}

/** O histórico de uma regra — inclusive as decisões superadas. */
export async function historicoDaRegra(regraId) {
  return prisma.fiscalValidacaoRegra.findMany({ where: { regraId }, select: CAMPOS, orderBy: { em: "desc" } });
}

/**
 * Registra uma decisão.
 *
 * ⚠ A `impressao` vem de QUEM CHAMA, e tem que ser a do conteúdo que a pessoa viu na tela. Recalcular
 * aqui atestaria a versão do servidor no instante do clique, que pode já ser outra.
 */
export async function decidir({ regraId, estado, impressao, fonte, ressalva }, user) {
  if (![SITUACAO.VALIDADA, SITUACAO.CONTESTADA].includes(estado)) throw new Error("Estado inválido.");
  if (!regraId || !impressao) throw new Error("Informe a regra e a versão conferida.");

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.fiscalValidacaoRegra.findFirst({ where: { regraId }, orderBy: { em: "desc" }, select: CAMPOS });
    const linha = await tx.fiscalValidacaoRegra.create({
      data: {
        regraId, estado, impressao,
        fonte: fonte?.trim() || null, ressalva: ressalva?.trim() || null,
        porId: user.id, porNome: user.name ?? user.email ?? user.id,
      },
      select: CAMPOS,
    });
    await tx.auditLog.create({
      data: { userId: user.id, action: `FISCAL_REGRA_${estado}`, entity: "FiscalValidacaoRegra", entityId: regraId,
        diff: { antes: anterior, depois: linha } },
    });
    return linha;
  });
}
