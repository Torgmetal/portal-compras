import { useEffect, useState } from "react";
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

// ─── PRÉVIA ───────────────────────────────────────────────────────────────────
// Vitor (30/08/2026): "deixa para eu conseguir ver para validar". A campanha é travada por data,
// então antes de setembro não há o que olhar — e validar depois que está no ar para 30 pessoas é
// tarde. `?campanha=1` em qualquer tela liga a parte visual sem mexer na data.
//
// ⚠ Lido de `window.location` num efeito, e não por `useSearchParams`: este hook exige fronteira de
// Suspense nas páginas estáticas, e a faixa vive no layout raiz, que envolve todas elas.
export const PARAM_PREVIA = "campanha";

const CHAVE_PREVIA = "torg:campanha-previa";

export function usarPrevia() {
  const [previa, setPrevia] = useState(false);
  useEffect(() => {
    // ⚠⚠ A PRÉVIA PRECISA DURAR A SESSÃO. Só lendo a URL ela morre no primeiro clique — o parâmetro
    // fica na página que você abriu e navegar para outro portal já o perde. Vitor (30/08/2026): "o
    // laço só apareceu na tela do portal de compra". Não era o código faltando nos outros portais:
    // era a prévia sumindo na navegação. `?campanha=0` desliga.
    let ligado = false;
    let param = null;
    try { param = new URLSearchParams(window.location.search).get(PARAM_PREVIA); } catch { /* ok */ }
    if (param !== null) ligado = param !== "0";
    try {
      if (param !== null) {
        if (ligado) sessionStorage.setItem(CHAVE_PREVIA, "1");
        else sessionStorage.removeItem(CHAVE_PREVIA);
      } else {
        ligado = sessionStorage.getItem(CHAVE_PREVIA) === "1";
      }
    } catch { /* navegador sem storage: vale só o parâmetro da URL */ }
    setPrevia(ligado);
  }, []);
  return previa;
}

export const LACO = "/laco-setembro.png";
export const TORGUINHO_LACO = "/torguinho-laco.png";

// O slogan, do jeito que o Vitor aprovou: sem telefone e sem explicação na frente do cliente.
export const SLOGAN = "A Torg Metal apoia a valorização da vida.";

// ⚠ AS TELAS QUE O CLIENTE E O FORNECEDOR ABREM. Todas usam o layout raiz, então a faixa entra uma
// vez só — mas ela NÃO pode aparecer no portal interno, que já tem o modal e o Torguinho de laço.
// Prefixo, não igualdade: quase todas carregam um token no fim do caminho.
// ⚠ `/portal/` ficou de fora: o portal da obra tem cabeçalho próprio e recebe o SELO no canto
// (ver SeloSetembroAmarelo). Ter os dois seria dizer a mesma coisa duas vezes na mesma tela.
//
// ⚠ ATAS E ASSINATURA FICARAM DE FORA (Vitor, 30/08/2026). São documentos de TRABALHO: quem abre
// uma ata ou uma tela de assinatura foi ali resolver uma coisa específica, e a faixa vira ruído em
// cima da tarefa. A campanha fica onde a pessoa está sendo RECEBIDA — o portal da obra, a
// apresentação, o portal do fornecedor.
const PUBLICAS = [
  "/portal-cliente/", "/apresentacao/", "/cobranca-marcos/",
  "/fornecedores", "/cliente", "/data-book",
];

/** Esta rota é uma tela de cliente/fornecedor? */
export const rotaDeCliente = (path) => PUBLICAS.some((p) => String(path || "").startsWith(p));
