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

/** Formata peso compacto: >= 1000 kg vira "Xt", senão "X kg". */
export const fmtPesoCompacto = (v) => {
  if (v == null || v === 0) return "0 kg";
  const kg = Number(v);
  if (Math.abs(kg) >= 1000)
    return `${(kg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}t`;
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};

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
