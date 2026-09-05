"use client";

export const fmtData = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

export const fmtKg = (v) => {
  if (!v) return "0 kg";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};

export function fmtQtd(v) {
  if (!v) return "0";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function fmtPeso(v) {
  if (!v) return "0";
  return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
