// A forma de um apontamento, e as três gravidades.
//
// ⚠ Mora num arquivo próprio para que o motor de auditoria e as conferências que ele chama possam
// compartilhá-la sem import circular.
export const GRAVIDADE = { ALTA: "ALTA", MEDIA: "MEDIA", INFO: "INFO" };

/** ⚠ O padrão é MEDIA: uma gravidade esquecida vira "olhe isto", nunca "pode ignorar". */
export const achado = (o) => ({ gravidade: GRAVIDADE.MEDIA, ...o });
