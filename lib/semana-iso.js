// Número da semana ISO (1..53) e ano ISO de uma data. Base do número da ata
// de reunião (ata semanal → ATA = número da semana).
export function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  // quinta-feira da semana ISO define o ano/semana
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const semana = 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { semana, ano: date.getFullYear() };
}
