// ─── DE-PARA: O QUE SE COTA × QUEM COTA ───────────────────────────────────────────────────────
// Vitor (01/09/2026): "Terças Z também precisam aparecer junto com a matéria prima, Curvas de GC
// também; já lanternim tem a categoria própria dele nos itens comerciais (…) trazer o botão de
// cotação nesses itens também, grade de piso e demais que estiverem lá, seria bom vc trazer
// separado para não cometermos erro de enviar para cotação".
//
// ⚠⚠ ITEM SEM FAMÍLIA NÃO GANHA BOTÃO. É a regra que atende o pedido dele: mandar telha para quem
// vende parafuso não é só inútil — queima a relação com o fornecedor e polui o histórico de
// cotação. Onde eu não tenho certeza (steel deck, linha de vida), o item aparece dizendo que falta
// definir a família, em vez de eu escolher por conta e o e-mail sair errado.
//
// ⚠ AS FAMÍLIAS SÃO AS DO VENDOR LIST, como estão cadastradas hoje — 15 em uso. Elas são mais finas
// que as 10 originais (Terças Z e Curvas GC são subdivisões de aço), e é por isso que uma família
// de cotação pode juntar várias: quem vende terça Z é o mesmo mundo de quem vende perfil.

/** Uma "família de cotação" agrupa as categorias do vendor list que atendem o mesmo pedido. */
export const FAMILIAS_COTACAO = {
  ACO: {
    rotulo: "Aço e perfis",
    // Vitor (01/09): terça Z e curva de guarda-corpo saem do mesmo fornecedor do perfil.
    categorias: ["MATERIA_PRIMA", "TERCAS_Z", "CURVAS_GC"],
  },
  TINTA: { rotulo: "Tintas", categorias: ["TINTA", "THINNER"] },
  TELHAS: { rotulo: "Telhas, calhas e rufos", categorias: ["TELHAS_CALHAS_E_RUFOS"] },
  LANTERNIM: { rotulo: "Lanternim", categorias: ["LANTERNIN"] },
  GRADE_PISO: { rotulo: "Grade de piso", categorias: ["GRADE_DE_PISO", "TELAS_E_GRADIL"] },
  FIXADORES: { rotulo: "Fixadores", categorias: ["PARAFUSOS"] },
};

/**
 * Família de cotação de cada item comercial do estudo.
 * `null` = ainda não definida — a tela pede a definição em vez de mandar para o fornecedor errado.
 */
export const FAMILIA_DO_ITEM = {
  TELHA_TERMO: "TELHAS",
  TELHA_SIMPLES: "TELHAS",
  CALHAS: "TELHAS",
  RUFOS: "TELHAS",
  LANTERNIM: "LANTERNIM",
  GRADE_PISO: "GRADE_PISO",
  CHUMBADORES: "FIXADORES",
  // ⚠ SEM PALPITE AQUI. Veneziana costuma sair do mesmo funileiro da calha, steel deck é laminado
  // e linha de vida é item de segurança — mas "costuma" não basta quando o efeito é um e-mail para
  // o fornecedor errado. Ficam sem família até alguém da Torg dizer qual é.
  VENEZIANAS: null,
  STEEL_DECK: null,
  LINHA_VIDA: null,
};

const norm = (s) => String(s ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "_");

/** As categorias do vendor list que atendem uma família de cotação. */
export const categoriasDaFamilia = (fam) => FAMILIAS_COTACAO[fam]?.categorias || [];

/** O fornecedor serve a esta família? Compara pelas categorias cadastradas nele. */
export function fornecedorAtende(fornecedor, fam) {
  const alvos = categoriasDaFamilia(fam).map(norm);
  if (!alvos.length) return false;
  const cats = Array.isArray(fornecedor?.categorias) ? fornecedor.categorias : [fornecedor?.categorias];
  return cats.filter(Boolean).some((c) => {
    const k = norm(typeof c === "string" ? c : c?.nome || c?.codigo || "");
    return alvos.some((a) => k === a || k.startsWith(a));
  });
}
