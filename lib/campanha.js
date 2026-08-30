import { hojeBRT } from "./data-br";

// ─── SETEMBRO AMARELO ─────────────────────────────────────────────────────────
// Vitor (30/08/2026): campanha de valorização da vida, setembro. O vídeo obrigatório é do dia 01 e
// tem data própria no banco (`MuralAviso.exibirLoginAte`); o que este arquivo controla é a presença
// visual que fica o mês inteiro — laço no login, Torguinho de laço no chat e a faixa nas telas do
// cliente.
//
// ⚠ A CONTA É EM HORÁRIO DE BRASÍLIA, não em UTC. O servidor roda em UTC: às 21h do dia 30/09 em
// Conchal já é 01/10 lá, e a campanha sumiria da tela com o pessoal do segundo turno ainda
// trabalhando. `hojeBRT()` resolve isso.
//
// ⚠ Vale para QUALQUER setembro, não só 2026: no ano que vem a campanha volta sozinha, e ninguém
// precisa lembrar de mexer no código. Se um ano a Torg não quiser participar, é aí que se mexe.

/** Estamos em setembro (horário de Brasília)? */
export function emSetembroAmarelo(hoje) {
  const d = hoje || hojeBRT(); // "YYYY-MM-DD"
  return String(d).slice(5, 7) === "09";
}

export const LACO = "/laco-setembro.png";
export const TORGUINHO_LACO = "/torguinho-laco.png";

// O slogan, do jeito que o Vitor aprovou: sem telefone e sem explicação na frente do cliente.
export const SLOGAN = "A Torg Metal apoia a valorização da vida.";

// ⚠ AS TELAS QUE O CLIENTE E O FORNECEDOR ABREM. Todas usam o layout raiz, então a faixa entra uma
// vez só — mas ela NÃO pode aparecer no portal interno, que já tem o modal e o Torguinho de laço.
// Prefixo, não igualdade: quase todas carregam um token no fim do caminho.
const PUBLICAS = [
  "/portal/", "/portal-cliente/", "/apresentacao/", "/ata/", "/ata-op/",
  "/cobranca-marcos/", "/assinar/", "/fornecedores", "/cliente", "/data-book",
];

/** Esta rota é uma tela de cliente/fornecedor? */
export const rotaDeCliente = (path) => PUBLICAS.some((p) => String(path || "").startsWith(p));
