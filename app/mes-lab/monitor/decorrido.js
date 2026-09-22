// ⚠⚠ O TEMPO DECORRIDO É CONTADO NO NAVEGADOR, e o servidor só manda o instante (`desde`).
// Calculado no servidor, o número CONGELA entre uma atualização e outra: a TV mostraria "12 min"
// parado por 15 segundos e depois pularia para 13. Contrato do dataset 131 ("Tempo Decorrido")
// cumprido do lado certo do fio.
//
// Módulo neutro (sem `"use client"`) para poder ser testado sem montar componente.

export function decorrido(desde, agora = Date.now()) {
  if (!desde) return "—";
  const ms = agora - new Date(desde).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  // ⚠ Acima de um dia, "1.487 min" ou "24 h" não dizem nada a quem olha de passagem: o que
  // interessa é que aquilo está assim DESDE ONTEM.
  if (horas < 24) return `${horas}h ${String(min % 60).padStart(2, "0")}`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}
