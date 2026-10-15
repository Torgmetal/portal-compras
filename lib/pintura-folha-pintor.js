// ─── A FOLHA DO PINTOR, SOZINHA ─────────────────────────────────────────────────────────────────
//
// Vitor (15/10/2026): gerar o caderno de pintura também pela aba Qualidade da OP — "o ideal seria trazer as
// informações para o pintor, as demais páginas podem ser geradas apenas na produção conforme está".
//
// No caderno completo (lib/pintura-excel-cliente.js) a folha 3 aponta por FÓRMULA para a folha 2, para se
// recalcular quando alguém preenche as células amarelas. Sozinha não há folha 2: os números saem CALCULADOS
// aqui, com a MESMA conta (úmida = seca × (100 + %diluição) ÷ sólidos por volume). Faltando dado, a célula diz
// o que falta e onde se corrige — nunca um número inventado na mão de quem está com a pistola.
//
// Só o que o pintor usa: diluente, ESPESSURA ÚMIDA (o que o pente marca na hora) e secagem — a seca não, ele só
// a mede depois de curar (Vitor, 07/09/2026). Puro, para o teste e para a tela.

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** As linhas de cada demão, com o texto pronto para a célula. `d` é a resposta de /api/pcp/pintura. */
export function linhasDoPintor(d = {}) {
  const demaos = Array.isArray(d.demaos) ? d.demaos : [];
  const camadas = Array.isArray(d.camadas) ? d.camadas : [];
  return demaos.map((m, i) => {
    const c = camadas[i] || {};
    const seca = num(c.seca), sv = num(c.sv), dil = num(c.diluicaoPct);
    const faltam = [seca == null && "espessura seca", sv == null && "sólidos por volume", dil == null && "diluição"].filter(Boolean);
    return {
      titulo: `Demão ${m.ordem ?? i + 1}${m.camada ? ` — ${m.camada}` : ""}`,
      produto: m.produto || "⚠ falta o produto no PLP",
      cor: m.cor || "",
      diluente: dil == null ? "⚠ falta a diluição no PLP" : `${dil.toLocaleString("pt-BR")}%`,
      umida: faltam.length ? `⚠ falta ${faltam.join(", ")} no PLP` : `${Math.round((seca * (100 + dil)) / sv)} µm`,
      secagem: m.secagem || "⚠ falta a secagem no PLP",
    };
  });
}
