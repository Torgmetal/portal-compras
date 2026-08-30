export const uid = () => Math.random().toString(36).slice(2, 9);

export const today = () => new Date().toISOString().slice(0, 10);

export const fmt = (v) =>
  v != null
    ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

/**
 * Formata número interno da OP para exibição ao usuário.
 * O formato interno é "T82A" (T = controle de projeto), mas o
 * usuário enxerga "OP-82".
 * @param {string|null|undefined} numero  — valor cru do campo `numero` da OP
 * @returns {string} Ex.: "OP-82", "OP-100". Retorna "—" se vazio.
 */
export const fmtOP = (numero) => {
  if (!numero) return "—";
  const m = String(numero).match(/(\d+)/);
  return m ? `OP-${m[1]}` : numero;
};

/** Formata peso em kg com separador brasileiro. Retorna "—" se nulo. */
export const fmtKg = (v) =>
  v != null
    ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`
    : "—";

/** Formata peso sempre em kg (número real, sem converter para tonelada). */
export const fmtPesoCompacto = (v) => {
  if (v == null || v === 0) return "0 kg";
  const kg = Number(v);
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};

/**
 * Valor em reais na escala BRASILEIRA: mil · mi · bi.
 *
 * ⚠ Vitor (29/08/2026): "melhore a forma de mostrar esses números, parece que fez de qualquer
 * jeito; traga o valor total, não fique inventando as coisas — temos padrões para seguir". O card
 * mostrava `R$ 1333,5M`: "M" inglês colado numa vírgula decimal brasileira, e sem virar bilhão —
 * então R$ 1,33 bilhão aparecia como se fossem mil e trezentos de alguma coisa.
 *
 * Aqui a escala é a que se fala em português (mil, mi, bi) e o número exato continua disponível
 * em `fmt()`, para ficar embaixo do resumo. Resumo serve para comparar de relance; o total exato é
 * o que se leva para uma reunião.
 */
export const fmtMoedaCompacta = (v) => {
  const n = Number(v || 0);
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${s}R$ ${(a / 1_000_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`;
  if (a >= 1_000_000) return `${s}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${s}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${s}R$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

/** Reais sem centavos — para o total exato, onde o centavo só polui. */
export const fmtMoedaInteira = (v) =>
  v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}` : "—";

/** Formata data para dd/mm/aaaa pt-BR. Retorna "—" se nulo. */
export const fmtData = (d) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

/** Formata percentual inteiro. Ex: 75 → "75%" */
export const fmtPct = (v) => `${Math.round(v)}%`;

/** Formata numero inteiro com separador de milhar pt-BR. */
export const fmtNum = (v) =>
  v != null
    ? Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : "—";

// Paleta Torg Metal: azuis + laranja, sem verde/roxo
export const STATUS_COLORS = {
  Aberta: "bg-torg-orange-100 text-torg-orange-700",
  "Em Cotação": "bg-torg-blue-100 text-torg-blue-700",
  Cotada: "bg-torg-blue-200 text-torg-blue-800",
  Aprovada: "bg-torg-blue-50 text-torg-dark border border-torg-blue-300",
  "Pedido Gerado": "bg-torg-dark text-white",
};
