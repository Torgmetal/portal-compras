// ─── A FOLHA DO PINTOR, SOZINHA E POR ESTRUTURA ─────────────────────────────────────────────────
//
// Vitor (15/10/2026): gerar o caderno de pintura também pela aba Qualidade da OP — "o ideal seria trazer as
// informações para o pintor, as demais páginas podem ser geradas apenas na produção conforme está". E, no mesmo
// dia: "no caso da tinta amarela ela recebe o primer e depois o acabamento amarelo, assim como a azul — no PLP
// isso não está claro e muito menos na folha do pintor".
//
// Por isso a folha é UM BLOCO POR ESTRUTURA, com a sequência que aquela peça recebe (lib/plp-esquema.js): primer e
// o acabamento da SUA cor, numerados 1ª, 2ª… — nunca a lista crua do PLP, que punha as duas cores em sequência.
//
// ⚠ SÓ SAI COM O PLP COMPLETO E COERENTE (`problemasPlp`, lib/pintura-lote.js). Folha com "⚠ falta" no lugar do
// número, ou vazia por falta de PLP, vai para a mão de quem está com a pistola; o botão diz o que falta e a
// Qualidade corrige o PLP.
//
// Só o que o pintor usa: diluente, ESPESSURA ÚMIDA (o que o pente marca na hora) e secagem — a seca não, ele só a
// mede depois de curar (Vitor, 07/09/2026). Puro, para o teste e para a tela.

const nb = (v, dec = 0) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** null quando pode gerar; senão a mensagem com o que corrigir no PLP. */
export function bloqueioDaFolha(d = {}) {
  const p = Array.isArray(d.problemasPlp) ? d.problemasPlp : [];
  return p.length ? `A folha do pintor só sai com o PLP completo. Corrija no PLP:\n• ${p.join("\n• ")}` : null;
}

/** Um bloco por estrutura, com as demãos na ordem em que a peça as recebe. */
export function blocosDoPintor(d = {}) {
  const porCor = Array.isArray(d.porCor) ? d.porCor : [];
  return (Array.isArray(d.esquema) ? d.esquema : []).map((e) => {
    const area = e.cor ? porCor.find((c) => c.cor === e.cor) : null;
    return {
      titulo: `${String(e.item || "").toUpperCase()}${e.cor ? ` — ${e.cor}` : ""}`,
      resumo: area ? `${area.pecas} peça(s) · ${nb(area.m2, 2)} m²` : "",
      demaos: (e.demaos || []).map((m, i) => ({
        titulo: `${i + 1}ª demão${m.camada ? ` — ${m.camada}` : ""}`,
        produto: m.produto || "",
        cor: m.cor || "",
        diluente: m.diluicaoPct == null ? "" : `${Number(m.diluicaoPct).toLocaleString("pt-BR")}%`,
        umida: m.umida == null ? "" : `${Math.round(m.umida)} µm`,
        secagem: m.secagem || "",
      })),
    };
  });
}
