// ─── O ROTEIRO DA GRD ─────────────────────────────────────────────────────────────────────────
// Vitor (31/08/2026): "Engenharia manda para o Gabriel e o Gabriel manda para a Larissa, pode
// deixar esse roteiro definido".
//
// O documento desce em duas pernas, e cada uma tem a sua guia:
//
//   Engenharia ──FORM 09 da pasta 13. GRD──▶  Gabriel (Engenharia)
//        Gabriel ──guia do PCP (GRD-PCP)───▶  Larissa (PCP)
//
// ⚠ POR QUE FIXO E NÃO DIGITADO A CADA VEZ. Digitar o destinatário toda vez é onde entra o erro de
// digitação num documento que a ISO vai ler — e, pior, é onde alguém manda para a pessoa errada num
// dia corrido. O nome continua editável na hora de emitir; o que muda é que o certo já vem
// preenchido.
//
// ⚠⚠ E-MAIL DE ÁREA, NÃO PESSOAL. `engenharia3@` e `pcp@` são caixas da função: quando a pessoa
// muda, o roteiro continua valendo e ninguém precisa lembrar de mexer aqui. Trocar por endereço
// pessoal transformaria uma regra de processo numa dependência de quem está na cadeira.

/** Quem recebe o aviso das GRDs que a ENGENHARIA emite (pasta 13. GRD). */
export const DESTINO_ENGENHARIA = { nome: "Gabriel", email: "engenharia3@torg.com.br", setor: "Engenharia" };

/** Quem recebe a guia de remessa que o PCP emite (GRD-PCP). */
export const DESTINO_PCP = { nome: "Larissa", email: "pcp@torg.com.br", setor: "PCP" };
