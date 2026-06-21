// DRE Alvo 2026 (gerencial) — construído pela diretoria no início do ano.
// Valores ANUAIS (col E da planilha "DRE ALVO - TORG 2026"). O realizado é
// montado a partir do faturamento (ContaReceber) e do a pagar por categoria,
// mapeado aos grupos do DRE pelo PREFIXO do categoriaNome do Omie.
//
// Mapeamento prefixo categoriaNome → grupo (confirmado com os subtotais do alvo):
//   3=MP  5=MIP  6=MOD  7=MOI  8=Diretas Terceiras  10=Indireta Fabricação
//   4=Fretes/Inspeção(s/meta)  14=Pessoal ADM  11=Administrativas  13=Utilidades
//   12=Prestadores  15=Marketing  16=Impostos/Taxas  20=Financeiras  21=Ativos
//   2=Deduções (impostos s/ venda; "2.x parcelamento" vai p/ Financeiras)

export const DRE_ANO = 2026;
export const DRE_RECEITA_BRUTA_ANO = 33600000;

// Grupos de custo/despesa (folhas), com alvo anual e os prefixos que somam o realizado.
export const DRE_GRUPOS = [
  // ── CUSTO (entra no Custo Total) ──
  { key: "mp", label: "Custos Diretos MP", secao: "CUSTO", alvoAno: 7950116.67, prefixos: ["3"] },
  { key: "mod", label: "MOD (Torg)", secao: "CUSTO", alvoAno: 2785666.67, prefixos: ["6"] },
  { key: "moi", label: "MOI (Torg)", secao: "CUSTO", alvoAno: 1858482.67, prefixos: ["7"] },
  { key: "terceiras", label: "Diretas Terceiras", secao: "CUSTO", alvoAno: 1560000, prefixos: ["8"] },
  { key: "mip", label: "Material Intermediário (MIP)", secao: "CUSTO", alvoAno: 720000, prefixos: ["5"] },
  { key: "indireta", label: "Despesa Indireta de Fabricação", secao: "CUSTO", alvoAno: 588000, prefixos: ["10"] },
  { key: "frete", label: "Fretes e Inspeção (sem meta)", secao: "CUSTO", alvoAno: 0, prefixos: ["4"] },
  // ── SG&A (entra no SG&A) ──
  { key: "variaveis", label: "Gastos Variáveis (comissões)", secao: "SGA", alvoAno: 2099680.76, prefixos: [] },
  { key: "pessoal", label: "Despesa com Pessoal (ADM)", secao: "SGA", alvoAno: 2524666.67, prefixos: ["14"] },
  { key: "admin", label: "Despesas Administrativas", secao: "SGA", alvoAno: 1418400, prefixos: ["11"] },
  { key: "utilidades", label: "Utilidades e Manutenções", secao: "SGA", alvoAno: 846480, prefixos: ["13"] },
  { key: "prestadores", label: "Prestadores de Serviço", secao: "SGA", alvoAno: 516000, prefixos: ["12"] },
  { key: "marketing", label: "Marketing", secao: "SGA", alvoAno: 27000, prefixos: ["15"] },
  { key: "impostosTaxas", label: "Impostos, Taxas e Contribuição", secao: "SGA", alvoAno: 42000, prefixos: ["16"] },
  // ── Abaixo do operacional ──
  { key: "ativos", label: "Ativos (investimentos)", secao: "ATIVO", alvoAno: 2790000, prefixos: ["21"] },
  { key: "financeiras", label: "Despesas Financeiras", secao: "FINANCEIRA", alvoAno: 847200, prefixos: ["20"] },
];

// Linhas de resultado (subtotais) com seu alvo anual da planilha.
export const DRE_RESULTADOS = {
  deducoes: 5040000,        // E9 (15% da receita)
  receitaLiquida: 28560000, // E11
  custoTotal: 15462266.01,  // E13
  resultadoBruto: 13097733.99, // E63
  sga: 7474227.43,          // E65
  resultadoOperacional: 5623506.56, // E125
  resultadoFinal: 1986306.56, // E141
};

/** Prefixo do categoriaNome do Omie (1º número antes do "."). Ex: "20.6 - Empréstimo" → "20". */
export function prefixoCategoria(nome) {
  const m = (nome || "").trim().match(/^(\d+)/);
  return m ? m[1] : null;
}

/** É parcelamento/dívida lançado no prefixo "2" (vai p/ Financeiras, não Deduções). */
export function ehParcelamento(nome) {
  return /parcelamento/i.test(nome || "");
}
