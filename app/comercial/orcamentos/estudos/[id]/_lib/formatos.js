"use client";
import { numeroBr } from "@/lib/lqc";

export const fmtR$ = (v) => `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** ⚠ CARTÃO É ESTREITO E NÚMERO NÃO QUEBRA. "R$ 46.958.004,32" não cabe num KPI; "R$ 46,96 mi" cabe
    e se lê de longe. A precisão continua nas tabelas, que rolam na horizontal. */

export const fmtMi = (v) => {
  const x = Number(v || 0);
  if (Math.abs(x) >= 1e6) return `R$ ${(x / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
  if (Math.abs(x) >= 1e3) return `R$ ${(x / 1e3).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
  return fmtR$(x);
};

export const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;

// ⚠ mesma leitura de número do cálculo — tela e conta não podem discordar do que "0,15" vale.
export const num = numeroBr;
