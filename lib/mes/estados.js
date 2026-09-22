// ─── OS ESTADOS DO MES, EM ARQUIVO PRÓPRIO ───────────────────────────────────
//
// ⚠ Saíram de `lib/mes/sessao.js` para quebrar um CICLO de importação (22/09/2026): a reserva da
// barra (`unidade-reserva.js`) precisa de `STATUS.ABERTA`, e `sessao.js` precisa chamar a
// reconciliação da reserva. Dois módulos importando um ao outro é o tipo de coisa que funciona nos
// testes e falha na ordem de carga do servidor.
//
// ⚠ `sessao.js` continua reexportando os dois — nenhum outro arquivo precisou mudar de import.

export const STATUS = { ABERTA: "ABERTA", ENCERRADA: "ENCERRADA", CANCELADA: "CANCELADA" };

export const ESTADO = {
  PRODUCAO: "PRODUCAO", SETUP: "SETUP", PARADA: "PARADA", RETRABALHO: "RETRABALHO",
  MANUTENCAO: "MANUTENCAO", FORA_TURNO: "FORA_TURNO", ENCERRAMENTO: "ENCERRAMENTO",
};
