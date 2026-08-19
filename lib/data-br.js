// Utilitários de data no fuso de Brasília (America/Sao_Paulo, UTC-3).
//
// Motivo: o app salva timestamps em UTC, mas a operação raciocina em horário
// de Brasília. Derivar o "dia" via toISOString() pega o dia UTC — o que joga
// apontamentos do fim do dia (turno noturno) para o dia seguinte. Use estes
// helpers em qualquer lugar que precise do dia-calendário BRT.

const TZ = "America/Sao_Paulo";

// Formatter en-CA produz "YYYY-MM-DD" — estável e independente de locale do server.
const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Dia-calendário BRT de uma data (ou string parseável), no formato "YYYY-MM-DD".
 * Ex: 2026-06-09T01:00:00Z (22h BRT do dia 08) → "2026-06-08".
 * @param {Date|string|number} date
 * @returns {string|null}
 */
export function diaBRT(date) {
  if (date == null) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return fmtDia.format(d);
}

// Formatadores de EXIBIÇÃO no fuso de Brasília. ⚠ `toLocaleString("pt-BR")` define o IDIOMA,
// não o FUSO: no servidor (Vercel roda em UTC) sai 3h adiantado — um documento emitido às 21:48
// de 18/08 saía carimbado "19/08 00:48". Use estes helpers em QUALQUER data que o servidor
// escreva em PDF/e-mail/Excel. (Vitor pegou no carimbo do desenho, 19/08/2026.)
const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });

/** "18/08/2026 21:48" no horário de Brasília. Use em timestamp real (createdAt, new Date()). */
export function dataHoraBR(date) {
  if (date == null) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return fmtDataHora.format(d).replace(",", "");
}

/**
 * "18/08/2026" no horário de Brasília. ⚠ Só para TIMESTAMP real — em campo `@db.Date` (que o
 * Prisma devolve como meia-noite UTC) converter pra BRT volta um dia; ali use a data crua.
 */
export function dataBR(date) {
  if (date == null) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return fmtData.format(d);
}

/** Dia de hoje em BRT, "YYYY-MM-DD". */
export function hojeBRT() {
  return fmtDia.format(new Date());
}

/**
 * Instante (UTC) do início do dia-calendário BRT — 00:00:00.000 -03:00.
 * Use em filtros de range (gte) sobre campos de timestamp armazenados em UTC.
 * @param {string} dataStr "YYYY-MM-DD"
 */
export function inicioDiaBRT(dataStr) {
  return new Date(`${dataStr}T00:00:00.000-03:00`);
}

/**
 * Instante (UTC) do fim do dia-calendário BRT — 23:59:59.999 -03:00.
 * @param {string} dataStr "YYYY-MM-DD"
 */
export function fimDiaBRT(dataStr) {
  return new Date(`${dataStr}T23:59:59.999-03:00`);
}
