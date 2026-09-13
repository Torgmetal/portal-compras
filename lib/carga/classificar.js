// Classificação das peças para o simulador de carga: família (guarda-corpo, grade, degrau, miúda,
// barra, plana), classe de empilhamento e a FASE (letra da marca).
import { CAIXA_MAD, PAC } from "./premissas";

export const ehGC = (u) => /G\.?\s*C\b|GUARDA/i.test(u.desc || "");
// degrau (piso de escada) vai JUNTO com as grades de piso — Vitor (12/09/2026)
export const ehDegrau = (u) => /DEGRAU/i.test(u.desc || "");
export const ehGrade = (u) => !ehGC(u) && (/GRADE/i.test(u.desc || "") || ehDegrau(u)) && u.A <= 120;
export const ehPequena = (u) => !ehGC(u) && !ehGrade(u) && u.C <= CAIXA_MAD.compMax && u.kg <= CAIXA_MAD.kgMax;
export const ehBarra = (u) => !ehGC(u) && !ehGrade(u) && !ehPequena(u) && ((u.L <= PAC.secaoMax && u.A <= PAC.secaoMax) || (u.kg <= 100 && u.L <= 500 && u.A <= 500)) && u.C >= PAC.compMin;
export const ehPlana = (u) => !ehGC(u) && !ehGrade(u) && !ehPequena(u) && !ehBarra(u) && u.A <= 60 && u.kg <= 20 && u.C >= 800;
export const ehPainel = (u) => u.A <= Math.max(120, 0.35 * u.L) && u.L >= 600;
export const ehDelicadoPlano = (u) => u.gc || u.grade || u.plano || u.tipo === "PALLET" || u.tipo === "CAIXA" || /GRADE/i.test(u.rotulo || u.desc || "");
// família de PERFIL viaja com a alma em pé; família CHAPA deita (menor dimensão para baixo)
export const ehFamiliaChapa = (desc) => /CHAPA|GRADE|GUARDA|G\.?\s*C\b|PISO|PLATAFORMA|TALA|DEGRAU|ESCADA|PAINEL|FECHAMENTO|TELHA/i.test(desc || "");

// classe: 0 caixa/engradado (rígido) · 1 pesado/rígido embaixo · 2 médio · 3 delicado só em cima
export const classe = (u) => u.tipo === "CAIXA" || u.tipo === "ENGRADADO" ? 0
  : (u.tipo === "PALLET" || /GRADE|DEGRAU|G\.?\s*C\b|GUARDA/i.test(u.rotulo || u.desc || "") || (u.A <= 15)) ? 3
  : (u.kg >= 80 || /COLUNA|VIGA|TRELI|P[ÓO]RTICO/i.test(u.desc || u.rotulo || "")) ? 1 : 2;

export const m3 = (u) => `${(u.C / 1000).toFixed(2)} × ${(u.L / 1000).toFixed(2)} × ${(u.A / 1000).toFixed(2)} m`;

/** Letra da marca = FASE da SKA (T118G → "G") — é assim que a Expedição chama. Vitor (12/09/2026). */
export function faseDaMarca(marca, prefixo) {
  const m = String(marca || "").toUpperCase();
  const rx = prefixo ? new RegExp(`^${prefixo}([A-Z])`) : /^T\d+([A-Z])/;
  const r = m.match(rx); return r ? r[1] : "?";
}
/** Prefixo das marcas de uma OP: "T118" para a OP-118 (a LPC guarda T118A, T118B…). */
export const prefixoDaOp = (opNumero) => "T" + String(opNumero || "").replace(/^0+/, "");
