import { hojeBRT } from "./data-br";

// ⚠ SEM REACT AQUI. Este módulo é importado pelo `email-layout`, que roda no SERVIDOR — um
// `useState` no topo faz o build parar ("needs useEffect… none of its parents are marked with
// 'use client'"). O hook da prévia mora em `campanha-previa.js`, que é de cliente.

// ─── CAMPANHAS DO MÊS ─────────────────────────────────────────────────────────
// Vitor (30/08/2026): Setembro Amarelo, campanha de valorização da vida. Vitor (30/09/2026): "para
// amanhã precisamos mudar nossa campanha de marketing pois começa o Outubro Rosa". Cada campanha é
// uma linha desta tabela e aparece no mês dela: laço no login e no menu, Torguinho de laço no chat
// (interno e do portal do cliente), faixa e selo nas telas do cliente, cabeçalho do vídeo do mural
// e o selo no rodapé dos e-mails. O material fica em Marketing/Workspace/Torguinho no SERVIDOR.
//
// ⚠ A CONTA É EM HORÁRIO DE BRASÍLIA, não em UTC. O servidor roda em UTC: às 21h do dia 30/09 em
// Conchal já é 01/10 lá, e a campanha trocaria com o pessoal do segundo turno ainda trabalhando.
// `hojeBRT()` resolve isso.
//
// ⚠ Vale para QUALQUER ano: a campanha volta sozinha no mês dela, e ninguém precisa lembrar de
// mexer no código. Se um ano a Torg não quiser participar, é aqui que se mexe.
//
// ⚠ AS IMAGENS MORAM EM /campanhas/<id>/, pasta liberada sem sessão no middleware: o laço aparece
// na tela de login, no portal do cliente e nos e-mails. O `/laco-setembro.png` antigo continua em
// /public porque os e-mails de setembro de 2026 apontam para ele.
//
// ⚠ AS CORES VÃO INLINE nas telas (style), não em classe: o Tailwind só gera classe escrita por
// extenso no código, e uma cor vinda desta tabela não existiria no CSS.
export const CAMPANHAS = [
  {
    id: "setembro-amarelo",
    mes: "09",
    nome: "Setembro Amarelo",
    partes: ["Setembro", "Amarelo"],
    laco: "/campanhas/setembro-amarelo/laco.png",
    torguinho: "/campanhas/setembro-amarelo/torguinho.png",
    altLaco: "Laço amarelo",
    // O slogan, do jeito que o Vitor aprovou: sem telefone e sem explicação na frente do cliente.
    slogan: "A Torg Metal apoia a valorização da vida.",
    cor: {
      destaque: "#F4C000", brilho: "244,192,0",
      faixaBorda: "#F4C000", faixaFundo: "#FFF8E1", faixaTexto: "#7a4a06", faixaTitulo: "#412402",
    },
  },
  {
    id: "outubro-rosa",
    mes: "10",
    nome: "Outubro Rosa",
    partes: ["Outubro", "Rosa"],
    laco: "/campanhas/outubro-rosa/laco.png",
    torguinho: "/campanhas/outubro-rosa/torguinho.png",
    altLaco: "Laço rosa",
    // ⚠ mesmo registro do Setembro: a Torg APOIA, sem telefone nem instrução médica na frente do cliente
    slogan: "A Torg Metal apoia a prevenção do câncer de mama.",
    cor: {
      destaque: "#F48FB1", brilho: "231,90,141",
      faixaBorda: "#E75A8D", faixaFundo: "#FDEFF4", faixaTexto: "#8C2A55", faixaTitulo: "#5E1636",
    },
  },
];

/** A campanha do mês de um dia "YYYY-MM-DD", ou null. */
export function campanhaDoMes(dia) {
  const mes = String(dia || "").slice(5, 7);
  return CAMPANHAS.find((c) => c.mes === mes) || null;
}

/** A campanha de hoje, no horário de Brasília. */
export const campanhaHoje = () => campanhaDoMes(hojeBRT());

/**
 * O que a TELA mostra: a campanha do mês, ou a da prévia.
 *
 * ⚠ A PRÉVIA ESCOLHE PELO NOME (`?campanha=outubro-rosa`) para validar antes da data — é o que
 * permite olhar o Outubro Rosa ainda em setembro. `?campanha=1` mostra a do mês e, fora de
 * campanha, a próxima.
 *
 * @param {string|null} previa valor do parâmetro da prévia (ou null)
 * @param {string} [dia] "YYYY-MM-DD" — padrão: hoje em Brasília
 */
export function campanhaExibida(previa, dia = hojeBRT()) {
  const doMes = campanhaDoMes(dia);
  if (!previa) return doMes;
  const pedida = CAMPANHAS.find((c) => c.id === previa);
  if (pedida) return pedida;
  if (doMes) return doMes;
  const m = Number(String(dia).slice(5, 7));
  const distancia = (c) => (Number(c.mes) - m + 12) % 12;
  return [...CAMPANHAS].sort((a, b) => distancia(a) - distancia(b))[0] || null;
}

// ⚠ AS TELAS QUE O CLIENTE E O FORNECEDOR ABREM. Todas usam o layout raiz, então a faixa entra uma
// vez só — mas ela NÃO pode aparecer no portal interno, que já tem o laço no menu e o Torguinho de
// laço. Prefixo, não igualdade: quase todas carregam um token no fim do caminho.
// ⚠ `/portal/` ficou de fora: o portal da obra tem cabeçalho próprio e recebe o SELO no canto
// (ver SeloCampanha). Ter os dois seria dizer a mesma coisa duas vezes na mesma tela.
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
