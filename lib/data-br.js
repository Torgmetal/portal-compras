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
