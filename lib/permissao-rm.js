// ─── QUEM PODE CANCELAR / EXCLUIR UMA RM ──────────────────────────────────────
//
// ⚠⚠ UMA FONTE SÓ, PORQUE SÃO DUAS PONTAS QUE PRECISAM CONCORDAR (16/09/2026). A rota é quem
// RECUSA; a tela é quem MOSTRA o botão. Escritas separadamente, elas divergem no primeiro ajuste —
// e as duas divergências são silenciosas em direções opostas: a tela esconder o botão de quem tem
// a permissão faz a funcionalidade parecer não existir, e a tela mostrar para quem não tem produz
// um 403 na cara de quem clicou.
//
// Matheus (16/09/2026) pediu que compras@torg.com.br pudesse cancelar RMs. A permissão é POR
// PESSOA (`User.podeCancelarRM`), no padrão do `podeAlterarVerba`, e não pelo módulo COMPRAS:
// pelo módulo alcançaria também fabrine@, engenharia4@ e guilherme@, que não foram pedidos.

/**
 * Cancelar é o caminho BRANDO: muda o status para CANCELADA, exige motivo por escrito e grava no
 * AuditLog — a RM e suas cotações continuam lá para consulta.
 */
export const podeCancelarRM = (user) => user?.tipo === "ADMIN" || user?.podeCancelarRM === true;

/**
 * Excluir é definitivo e cascateia itens, cotações, itens de cotação, envios, anexos e pedidos.
 *
 * ⚠ Continua exclusivo do ADMIN, e de propósito: não tem desfazer, e o número da RM some do
 * histórico. Quem precisa "tirar da frente" uma RM criada errada quer cancelar, não apagar.
 */
export const podeExcluirRM = (user) => user?.tipo === "ADMIN";

/**
 * Forçar o cancelamento de uma RM que JÁ gerou pedido no Omie.
 *
 * ⚠⚠ Só ADMIN. O estrago deste caso não mora no portal: o pedido segue vivo no ERP e alguém tem
 * de ir lá cancelar à mão. Deixar a permissão fina atravessar esse aviso trocaria "cancelar uma
 * RM" por "descolar o portal do Omie".
 */
export const podeForcarCancelamentoRM = (user) => user?.tipo === "ADMIN";
