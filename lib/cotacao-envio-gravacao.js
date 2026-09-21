// A gravação do envio de cotação: uma cotação por fornecedor, os itens de cada uma, o registro
// de Envio por RM e a mudança de status — tudo numa transação só.
//
// ⚠⚠ EM LOTE, NÃO LINHA A LINHA. A função da Vercel roda em iad1 (Washington) e o Neon fica em
// sa-east-1 (São Paulo): cada statement é uma ida e volta de ~120 ms. A versão anterior fazia um
// `create` aninhado por cotação (1 INSERT por item) e um `create` por Envio: na T122-001, 7
// fornecedores × 9 itens = 63 inserts de item + 7 cotações + 7 envios + status ≈ 85 idas e voltas
// ≈ 10 s, contra o teto PADRÃO de 5 s da transação interativa do Prisma. Resultado (21/09/2026):
// "O servidor respondeu 500 sem detalhes". Agora são 6 statements, independentemente do tamanho.
//
// ⚠ O token nasce AQUI, antes do INSERT, e é a chave para casar o que voltou do banco com o
// fornecedor pedido — `createManyAndReturn` devolve as linhas, mas a ordem não é garantia do SQL.
import { randomUUID } from "node:crypto";

// ⚠ Teto explícito e folgado. O padrão (5 s) foi o que derrubou a T122-001; `maxWait` é o tempo
// para CONSEGUIR uma conexão do pooler, que também sofre quando o Neon está acordando.
export const OPCOES_TX = { timeout: 30_000, maxWait: 10_000 };

/** A linha de CotacaoItem de um item da RM, com o abatimento de estoque quando houver. */
export function linhaDeItem(it, abatimento) {
  const peso = Number(it.peso) || 0;
  // Sem resposta de estoque: cota a quantidade cheia (peso em KG p/ aço).
  if (!abatimento || abatimento.barrasDisponiveis <= 0) {
    return { rmItemId: it.id, precoUnit: 0, qtdCotada: peso > 0 ? peso : it.qtd };
  }
  return {
    rmItemId: it.id,
    precoUnit: 0,
    qtdCotada: abatimento.qtdCotada,
    qtdPecasCotada: abatimento.barrasACotar,
    estoqueAbatidoQtd: abatimento.barrasDisponiveis,
  };
}

/**
 * Grava as cotações do envio. Roda DENTRO de `prisma.$transaction` (recebe o `tx`).
 * @returns {Promise<Array<{id, token, fornecedorNome, fornecedorEmail, rmsVinculadas: string[]}>>}
 */
export async function gravarCotacoes(tx, { fornecedores, itensCotaveis, rmsEnvolvidas, rmPrincipal, faturamento, prazo, observacao, estoque, user, prazoTexto }) {
  const pedidos = fornecedores.map((f) => ({
    rmId: rmPrincipal.id,
    fornecedorId: f.fornecedorId || null,
    fornecedorNome: f.nome.trim().toUpperCase(),
    fornecedorEmail: f.email,
    cnpj: f.cnpj || null,
    nCodOmie: f.nCodOmie || null,
    faturamento,
    prazoResposta: prazo,
    observacao: observacao || null,
    token: randomUUID(),
    status: "PENDENTE",
  }));

  const criadas = await tx.cotacao.createManyAndReturn({
    data: pedidos,
    select: { id: true, token: true, fornecedorNome: true, fornecedorEmail: true },
  });
  // Casa pelo token (único, gerado acima), nunca pela posição.
  const porToken = new Map(criadas.map((c) => [c.token, c]));
  const cotacoes = pedidos.map((p) => {
    const c = porToken.get(p.token);
    if (!c) throw new Error(`Cotação de ${p.fornecedorNome} não voltou do banco após a gravação.`);
    return c;
  });

  await tx.cotacaoItem.createMany({
    data: cotacoes.flatMap((c) => itensCotaveis.map((it) => ({ cotacaoId: c.id, ...linhaDeItem(it, estoque.porItem.get(it.id)) }))),
  });

  // Registra envio nas RMs que de fato têm itens na cotação
  await tx.envio.createMany({
    data: cotacoes.flatMap((c) => rmsEnvolvidas.map((rm) => ({ rmId: rm.id, fornecedorNome: c.fornecedorNome, fornecedorEmail: c.fornecedorEmail }))),
  });

  // Marca itens PENDENTES como EM_COTACAO
  await tx.rMItem.updateMany({
    where: { id: { in: itensCotaveis.map((i) => i.id) }, status: "PENDENTE" },
    data: { status: "EM_COTACAO" },
  });

  // Atualiza status das RMs que estavam ABERTA para EM_COTACAO
  const rmIdsAberta = rmsEnvolvidas.filter((rm) => rm.status === "ABERTA").map((rm) => rm.id);
  if (rmIdsAberta.length > 0) {
    await tx.rM.updateMany({ where: { id: { in: rmIdsAberta } }, data: { status: "EM_COTACAO" } });
  }

  await tx.auditLog.create({
    data: {
      userId: user.id,
      action: "enviar_cotacao",
      entity: "RM",
      entityId: rmPrincipal.id,
      diff: {
        rmsVinculadas: rmsEnvolvidas.map((r) => r.numero),
        fornecedores: fornecedores.length,
        itens: itensCotaveis.length,
        prazo: prazoTexto || null,
        estoqueAbatidos: estoque.abatidos.length || undefined,
        estoqueExcluidos: estoque.excluidos.length || undefined,
      },
    },
  });

  return cotacoes.map((c) => ({
    id: c.id,
    token: c.token,
    fornecedorNome: c.fornecedorNome,
    fornecedorEmail: c.fornecedorEmail,
    rmsVinculadas: rmsEnvolvidas.map((r) => r.numero),
  }));
}
