// ─── QUEM ADMINISTRA O PORTAL ─────────────────────────────────────────────────────────────────
//
// Vitor (05/09/2026): "sobre o aviso dos cron deixe limitado a mim e ao Matheus Martha, os demais
// não deveriam receber... precisamos deixar o Caio, Guilherme e Fabrine apenas com acesso full mas
// sem essas informações e sem acesso ao painel de adm".
//
// ⚠⚠ POR QUE UMA ALLOWLIST E NÃO REBAIXAR O TIPO. O caminho óbvio seria tirar o `tipo: ADMIN` dos
// três e dar todos os módulos. Só que ADMIN, neste portal, não é só o painel: 43 rotas de trabalho
// do dia a dia exigem `requireRole(["ADMIN"])` — aprovações do Comercial, importação do Controle de
// OP, reclassificação de máquinas, cancelamento de RM. Rebaixar tiraria o painel E o trabalho
// junto, que é o oposto de "acesso full".
//
// Então o tipo continua ADMIN (acesso total ao portal) e o que fica restrito é o que ele pediu:
// o PAINEL de administração e o alerta dos crons. Mesmo padrão do módulo Diretoria — allowlist por
// e-mail, e aqui nem ADMIN burla.
//
// Para incluir alguém: acrescente o e-mail nesta lista (é o único lugar).
export const ADMINS_DO_PORTAL = ["vitor@torg.com.br", "matheus@torg.com.br"];

const norm = (e) => (e || "").toLowerCase().trim();

/** true se o e-mail administra o portal. Serve no servidor e no cliente (lista fixa, sem banco). */
export function ehAdminDoPortal(email) {
  const e = norm(email);
  return !!e && ADMINS_DO_PORTAL.includes(e);
}

// ⚠ O GATE (`requireAdminDoPortal`) mora em lib/session: este arquivo é importado também pelo
// menu, que roda no navegador, e puxar a sessão aqui arrastaria o servidor inteiro pro bundle.
