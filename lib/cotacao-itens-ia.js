import { BASE_TOTAL, ehTotalComImposto, toleranciaDe } from "./cotacao-total-pdf";

// ─── O QUE A IA DEVOLVEU, ANTES DE VIRAR PREÇO NA TELA DO FORNECEDOR ─────────────────────────
//
// Saiu de `app/api/parse-cotacao-ai/route.js` em 21/09/2026: a rota passava de 410 linhas (teto
// 350) e esta é a parte que decide NÚMERO, não a que fala com a Anthropic — é aqui que o teste
// precisa bater, sem subir rota nem gastar chamada de IA.

// Arredonda pra N casas decimais — evita problemas com inputs step="0.01"
// e bate com a precisao mostrada nas propostas (PDF, Omie, etc).
function round2(n) {
  if (n == null || isNaN(n)) return n;
  return Math.round(Number(n) * 100) / 100;
}

/**
 * O PREÇO LIDO SOBREVIVE, É CORRIGIDO OU SÓ GERA AVISO — e em que base está o total.
 *
 * ⚠⚠ ATÉ 21/09/2026 SÓ HAVIA DUAS SAÍDAS, E A ERRADA MEXIA NO DINHEIRO (achado do Codex). Vendo
 * `preço × qtd` divergir do total declarado, a rotina concluía que o "preço" extraído era o TOTAL
 * da linha e reescrevia o unitário para `total ÷ qtd`. Num PDF cujo total vem COM IPI — o layout
 * da SOUFER, medido em 17 de 17 linhas — isso sobe a proposta do fornecedor em 3,25% sozinho: o
 * portal inventando dinheiro no documento de outra empresa.
 *
 * ⚠ A terceira saída é estreita de propósito (ver `ehTotalComImposto`) e é a mais conservadora
 * das três: não converte nada, não reescreve nada, só avisa e carimba a base. Ambiguidade vira
 * aviso, nunca reescrita.
 *
 * @returns {{safePrec:number, warnings:string[], baseTotal:string}}
 */
function avaliarPreco({ precoUnit, qtd, totalDeclarado, ipiPct }) {
  const warnings = [];
  let safePrec = precoUnit;

  // 1. Reject precos absurdos (> R$ 10.000 por unidade — improvavel pra aco)
  if (precoUnit > 10000) {
    warnings.push(`Preco unitario R$ ${precoUnit.toFixed(2)} suspeito (>10k/un)`);
    safePrec = 0;
  }

  // 2. VALIDA ARITMETICA: se tem qtd, preco e total, todos > 0,
  //    o preco x qtd deve bater com o total (tolerancia 1%).
  const temTudo = qtd > 0 && safePrec > 0 && totalDeclarado != null && totalDeclarado > 0;
  const calculado = safePrec * qtd;
  if (!temTudo || Math.abs(calculado - totalDeclarado) <= toleranciaDe(totalDeclarado)) {
    return { safePrec, warnings, baseTotal: BASE_TOTAL.LIQUIDO };
  }

  if (ehTotalComImposto({ totalDeclarado, precoUnit: safePrec, qtd, ipiPct })) {
    warnings.push(
      `Total declarado (${totalDeclarado.toFixed(2)}) parece incluir o IPI de ${Number(ipiPct)}% ` +
      `sobre ${calculado.toFixed(2)} — preco unitario mantido como lido`
    );
    // ⚠⚠ E A BASE ACOMPANHA O TOTAL. Carimbar LIQUIDO aqui devolveria pela tela o alarme falso que
    // este arquivo existe para matar: o total com imposto seria comparado contra `preço × qtd`.
    return { safePrec, warnings, baseTotal: BASE_TOTAL.COM_IPI };
  }

  // O preco nao bate. Tenta corrigir: o "preco unit" extraido provavelmente e
  // o TOTAL da linha. Recalcula como total/qtd.
  const sugerido = totalDeclarado / qtd;
  if (sugerido > 0 && sugerido < 10000) {
    warnings.push(
      `Preco corrigido: ${precoUnit.toFixed(2)} -> ${sugerido.toFixed(4)} ` +
      `(${precoUnit} parecia ser o total; total/qtd = ${sugerido.toFixed(4)})`
    );
    safePrec = sugerido;
  } else {
    warnings.push(
      `Preco e total nao batem: ${precoUnit} x ${qtd} = ${calculado.toFixed(2)} ` +
      `mas total declarado e ${totalDeclarado.toFixed(2)}`
    );
  }
  return { safePrec, warnings, baseTotal: BASE_TOTAL.LIQUIDO };
}

/** A linha que a IA devolveu aponta para uma linha da RM que existe de verdade? */
function rmIndexValido(rmIndex, rmCount) {
  if (rmIndex == null) return null;
  if (typeof rmIndex !== "number" || rmIndex < 0 || rmIndex >= rmCount) return null;
  return rmIndex;
}

export function sanitizeItens(itens, rmCount) {
  return (itens || []).map((it) => {
    const qtd = Number(it.qtd) || 0;
    const totalDeclarado = it.totalBruto != null ? Number(it.totalBruto) : null;
    const { safePrec, warnings, baseTotal } = avaliarPreco({
      precoUnit: Number(it.precoUnit) || 0, qtd, totalDeclarado, ipiPct: it.ipiPct,
    });
    const rmIndex = rmIndexValido(it.rmIndex, rmCount);

    // Arredonda tudo pra 2 casas — o input do form tem step="0.01" e rejeita
    // valores com mais casas (ex: 6.4823). E nem o PDF nem o Omie usam mais
    // que 2 casas, entao a precisao extra so atrapalha.
    const qtdRound = round2(qtd);
    return {
      rmIndex,
      descricao: String(it.descricao || ""),
      qtd: qtdRound,
      qtdCotada: qtdRound,
      unidade: String(it.unidade || "").toUpperCase(),
      precoUnit: round2(safePrec),
      icmsPct: it.icmsPct != null ? round2(Number(it.icmsPct)) : null,
      ipiPct: it.ipiPct != null ? round2(Number(it.ipiPct)) : null,
      totalBruto: round2(totalDeclarado != null ? totalDeclarado : safePrec * qtd),
      // ⚠ O contrato do prompt é `totalBruto = precoUnit × qtd`, LÍQUIDO — mas contrato de prompt
      // não é garantia: quando a aritmética diz que veio com imposto, é a aritmética que vale.
      baseTotal,
      prazoEntrega: it.prazoEntrega || "",
      observacao: it.observacao || "",
      _warning: warnings.length > 0 ? warnings.join(" | ") : null,
    };
  });
}
