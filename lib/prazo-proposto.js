// ─── A DATA QUE O FORNECEDOR PROPÕE, E A APROVAÇÃO QUE A TORNA VÁLIDA ────────
//
// Matheus (18/09/2026): "sim, o Compras precisa aprovar a alteração depois".
//
// ⚠⚠ ATÉ AQUI, O LINK PÚBLICO REMARCAVA O PRAZO SOZINHO. Quem abrisse o token digitava uma data e
// o `prazoEntregaPrevisto` mudava na hora: o pedido saía do vermelho, saía da lista de cobrança e
// a RM inteira podia virar "No prazo" — tudo por ação de um terceiro sem login, sem ninguém da
// Torg ter concordado. É a MESMA lição da entrega declarada (`fornecedorEntregaEm`), e ela vale
// para toda crença do portal que um terceiro consiga mexer: a resposta dele é INSUMO, não fato.
//
// ⚠⚠ A PROPOSTA PENDENTE NÃO SUSPENDE A COBRANÇA (achado do Codex). Se suspendesse, responder
// qualquer data — inclusive uma impossível — seria o jeito mais barato de sumir da cobrança, e o
// silêncio de Compras viraria aprovação tácita. O pedido continua atrasado até alguém aprovar.
import { previsaoAtual } from "@/lib/acompanhamento-pedido";

/** O prefixo que separa o que o fornecedor escreveu do comentário interno de Compras. */
export const MARCA_FORNECEDOR = "[Fornecedor]";

/**
 * O identificador de UMA proposta.
 *
 * ⚠⚠ EXISTE PORQUE COMPARAR A DATA NÃO BASTA (achado do Codex). A tela lê uma proposta, o
 * fornecedor troca o motivo mantendo a data — ou empurra para B e volta para A — e o clique em
 * "aprovar" efetivaria uma proposta que quem clicou nunca leu. A tela devolve o id que leu;
 * divergiu, é 409 e a tela recarrega.
 *
 * ⚠ NÃO é credencial: adivinhá-lo não aprova nada (o POST exige sessão ADMIN/COMPRAS antes de
 * qualquer coisa). Ainda assim é `randomUUID` e não `Math.random` — identidade de versão colide
 * mal, e o custo de acertar é zero (sugestão do Codex, 18/09/2026).
 *
 * ⚠⚠ `globalThis.crypto`, NUNCA `import crypto from "node:crypto"`. Este módulo chega ao BUNDLE DO
 * CLIENTE — `painel-prazos-rm.js` o importa e o `CartaoRM.jsx` (client component) importa aquele.
 * Um import de `node:*` aqui quebra a tela de Prazos inteira.
 */
export const novaPropostaId = () => globalThis.crypto.randomUUID();

/** A proposta pendente de um pedido, ou `null`. */
export function propostaPendente(pedido) {
  if (!pedido?.prazoProposto || !pedido?.prazoPropostoId) return null;
  return {
    id: pedido.prazoPropostoId,
    prazo: pedido.prazoProposto,
    em: pedido.prazoPropostoEm,
    motivo: pedido.prazoPropostoMotivo || null,
  };
}

/** As colunas que apagam a proposta. Usado ao aprovar, ao recusar e ao remarcar por dentro. */
export const LIMPAR_PROPOSTA = {
  prazoProposto: null,
  prazoPropostoEm: null,
  prazoPropostoMotivo: null,
  prazoPropostoId: null,
};

/**
 * O prazo que VALE hoje, para virar `prazoOriginal` na primeira remarcação.
 *
 * ⚠⚠ NÃO É `prazoEntregaPrevisto` SOZINHO (achado do Codex). A previsão efetiva também considera
 * o histórico, o prazo que o fornecedor pôs nos itens da cotação e o prazo escrito em palavras
 * contado da criação do pedido — `previsaoAtual` é quem sabe disso, e é a mesma conta que a tela
 * mostra. Gravando só a coluna crua, um pedido cuja previsão vem dos itens registraria
 * `prazoOriginal` NULO e a cobrança perderia a referência do que foi combinado.
 */
export const prazoEfetivo = (pedido) => pedido?.prazoEntregaPrevisto || previsaoAtual(pedido) || null;

/**
 * A repetição idêntica não é uma proposta nova.
 *
 * ⚠ A rota é pública: recarregar a página e reenviar não pode gerar outro aviso nem embaralhar o
 * id que a tela de Compras está segurando.
 */
export function ehRepeticao(pedido, prazo, motivo) {
  const atual = propostaPendente(pedido);
  if (!atual) return false;
  const mesmoMotivo = (atual.motivo || "") === (motivo || "");
  return +new Date(atual.prazo) === +new Date(prazo) && mesmoMotivo;
}

// ⚠⚠ PRAZO SE FORMATA EM **UTC**, NÃO EM SÃO PAULO. A data vem de um `<input type="date">`:
// "2026-11-20" vira meia-noite UTC, e meia-noite UTC em São Paulo ainda é o DIA 19. O e-mail
// dizia ao fornecedor uma data um dia antes da que ele digitou — e a tela, que já formata em UTC,
// mostrava a certa. Duas telas discordando sobre a mesma data, pelo fuso (18/09/2026).
const fmt = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

/**
 * O que o fornecedor recebe quando Compras RECUSA a data proposta.
 *
 * ⚠⚠ AVISAR O FORNECEDOR É PARTE DA RECUSA (achado do Codex). Sem isso ele responde, vê "recebido"
 * na tela e segue achando que a data nova está combinada — e a Torg programa o pátio para uma data
 * e ele carrega para outra. Recusa silenciosa é pior que não ter o fluxo.
 *
 * ⚠ O texto NÃO acusa e NÃO fecha a porta: pede a data que ele consegue cumprir. A recusa é da
 * data, não do fornecedor.
 */
export function textoDaRecusa(pedido, proposta, motivo) {
  const ref = [
    pedido.numeroPedido ? `pedido de compra ${pedido.numeroPedido}` : null,
    pedido.rmNumero ? `RM ${pedido.rmNumero}` : null,
  ].filter(Boolean).join(" · ") || "seu pedido";
  return {
    assunto: `Torg Metal — sobre a data informada para o ${ref}`,
    linha: `Recebemos a previsão de ${fmt(proposta.prazo)} que vocês informaram para o ${ref}, `
      + `mas ela não atende à programação da obra e não pôde ser aceita.`,
    pedido: "Poderiam nos informar a data mais próxima que conseguem cumprir? "
      + "Se o material já estiver pronto para carregamento, é só nos avisar pelo mesmo link.",
    motivo: String(motivo || "").trim() || null,
  };
}
