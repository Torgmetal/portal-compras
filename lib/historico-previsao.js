// ─── DE ONDE VEIO A DATA DE ENTREGA QUE ESTÁ VALENDO ─────────────────────────
//
// Lê o `PrazoHistorico` de um pedido para os Prazos das RMs. Separado de `painel-prazos-rm.js`
// (24/09/2026), que já passava do teto de linhas; lá ele continua reexportado.

/**
 * A previsão atual veio do FORNECEDOR, pelo portal público?
 *
 * ⚠⚠ O CARTÃO MOSTRAVA SÓ A DATA NOVA, indistinguível da original (achado meu ao responder o
 * Matheus em 18/09/2026). Quem olha a tela precisa diferenciar "esta data veio do fornecedor
 * ontem, depois de cobrarmos" de "esta data sempre foi essa" — sem isso, um fornecedor empurra o
 * prazo, o pedido sai do vermelho e ninguém percebe que nada de fato melhorou.
 *
 * ⚠ Vale só para a ÚLTIMA alteração: uma edição interna depois dele devolve a autoria a quem
 * editou, e manter o crédito do fornecedor ali seria mentir sobre de quem é a data que vale.
 */
export function origemDaPrevisao(pedido) {
  const hist = [...(pedido?.prazoHistorico || [])]
    .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));
  const ultima = hist[hist.length - 1];
  if (!ultima || !String(ultima.motivo || "").startsWith("[Fornecedor]")) return null;
  return {
    em: ultima.criadoEm,
    // ⚠ Sem o prefixo: ele é marcador de origem, não parte do recado.
    motivo: String(ultima.motivo).replace(/^\[Fornecedor\]\s*/, "").trim() || null,
  };
}

/**
 * Cada vez que a data de entrega mudou: de quando, para quando, quem e por quê.
 *
 * ⚠⚠ A REMARCAÇÃO FEITA POR DENTRO NÃO DEIXAVA RASTRO NO CARTÃO (24/09/2026). Matheus: *"alterei
 * nos pedidos 2010 e 1977, mas não ficou o histórico nem a observação que eu escrevi"*. O
 * `PrazoHistorico` estava gravado; a tela só lia o que tinha o prefixo `[Fornecedor]`, e a data
 * mudava sem explicação — quem olhava via "29/09 · em 5 dias" sem saber que era a terceira data.
 *
 * ⚠ `doFornecedor` continua separando as duas origens: o recado de terceiro sem login não pode
 * parecer decisão da Torg (ver `origemDaPrevisao`).
 */
export function historicoDaPrevisao(pedido) {
  return [...(pedido?.prazoHistorico || [])]
    .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm))
    .map((h) => {
      const texto = String(h.motivo || "");
      const doFornecedor = texto.startsWith("[Fornecedor]");
      return {
        id: h.id,
        de: h.prazoAnterior || null,
        para: h.prazoNovo,
        em: h.criadoEm,
        por: h.alteradoPor?.name || null,
        motivo: texto.replace(/^\[Fornecedor\]\s*/, "").trim() || null,
        doFornecedor,
      };
    });
}
