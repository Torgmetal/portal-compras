// Acesso do módulo Reuniões.
//
// VER a ata e RESPONDER as atividades: qualquer usuário DO PORTAL (ADMIN ou
// USUARIO), sem exigir módulo — os envolvidos precisam voltar na ata depois do
// link do e-mail pra completar as tarefas. FUNCIONARIO (portal /meu-rh) fica de
// fora: ata de reunião não é conteúdo do autoatendimento.
//
// GERENCIAR (criar, editar, enviar, revisar, excluir): ADMIN ou PLANEJAMENTO.
export const TIPOS_REUNIOES = ["ADMIN", "USUARIO"];

export const podeGerenciarAtas = (user) =>
  user?.tipo === "ADMIN" || (user?.modulos || []).includes("PLANEJAMENTO");
