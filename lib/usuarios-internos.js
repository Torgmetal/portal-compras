// ─── QUEM É "A EMPRESA" NUMA LISTA DE E-MAIL ───────────────────────────────────
//
// Vitor (04/09/2026): "a Laís Stival não deve estar nas comunicações da empresa; ela está como
// qualidade externo, o usuário dela é apenas para a assinatura e elaboração de relatórios".
//
// ⚠⚠ EXTERNO NÃO É INATIVO NEM CLIENTE. Ela precisa ENTRAR e trabalhar (elabora relatório, assina
// documento da Qualidade), então desativar ou virar CLIENTE tirava dela o que ela veio fazer. O que
// muda é só o outro lado: ela não é destinatária das listas internas — aviso geral, kickoff,
// liberação de lista da Engenharia, e-mails de relatório.
//
// ⚠⚠ ONDE ELA CONTINUA: as telas de ASSINATURA e os destinatários da Qualidade. Tirar de lá seria
// tirar o motivo do usuário existir.
//
// ⚠ A LISTA MORA EM CÓDIGO PORQUE NÃO HÁ CAMPO NO BANCO. O lugar certo é um `externo` no `User`, e
// isso pede migração no Postgres (o `tipo` é enum). Enquanto não houver, esta lista é explícita e
// auditável — e é uma pessoa. Ao adicionar a segunda, vale parar e criar o campo.
export const EMAILS_EXTERNOS = ["stival2112@gmail.com"];

const norm = (e) => String(e || "").trim().toLowerCase();
const SET_EXTERNOS = new Set(EMAILS_EXTERNOS.map(norm));

/** true quando o e-mail é de alguém de fora que só usa o portal para assinar/elaborar */
export function ehExterno(email) {
  return SET_EXTERNOS.has(norm(email));
}

/** filtra uma lista já carregada (o objeto precisa ter `email`) */
export function semExternos(lista) {
  return (lista || []).filter((u) => !ehExterno(u?.email));
}

/**
 * Fragmento de `where` do Prisma: exclui os externos direto na consulta.
 * Use junto do resto do filtro — `{ ativo: true, ...SEM_EXTERNOS }`.
 */
export const SEM_EXTERNOS = EMAILS_EXTERNOS.length
  ? { email: { notIn: EMAILS_EXTERNOS } }
  : {};
