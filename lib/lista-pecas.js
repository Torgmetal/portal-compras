// ─── AS DUAS LISTAS DE UMA OBRA ───────────────────────────────────────────────
// Vitor (29/08/2026): "a LPC e a LE são a mesma lista praticamente, a única diferença é que a LE
// mostra todos os itens que precisamos enviar, até acessórios; já a LPC é para a produção. Você
// sempre deve respeitar isso. (…) o que podemos deixar claro é que a LE será para a EXPEDIÇÃO e a
// LPC para a FABRICAÇÃO".
//
// ⚠⚠ AS DUAS DESCREVEM A MESMA ESTRUTURA DE AÇO. Somar `PecaConjunto` sem escolher um lado conta a
// obra duas vezes. Não é hipótese — foi medido em 29/08/2026:
//
//   · painel da Produção:        2.473 t mostradas, sendo 828 t de repetição (33%)
//   · "aguardando liberação" do
//     PCP (dias de carga):       2.378 peças / 570 t = 95 dias, quando o real são
//                                197 peças / 26 t = 4,4 dias — 90 dias de fila que não existem
//   · 218 marcas da LISTA DE EXPEDIÇÃO chegaram a receber MÁQUINA DE CORTE atribuída
//
// ⚠ POR QUE NÃO SE SEPARA NO BANCO. A chave é `@@unique([opNumero, marca])`, sem a fonte: uma
// marca, uma linha. Incluir a fonte na chave criaria DUAS linhas para a mesma peça física, e aí
// todo lugar que soma teria de saber escolher — o risco que este arquivo existe para eliminar.
// A separação é na CONSULTA, e é por isso que ela precisa ser explícita e fácil de acertar.
//
// Como usar:
//   import { SO_FABRICACAO } from "@/lib/lista-pecas";
//   prisma.pecaConjunto.findMany({ where: { status: "PENDENTE", ...SO_FABRICACAO } })
//
// E para o PESO de uma OP (não para filtrar), use `pesoRealPecas` de lib/peso-op.js, que já
// resolve a escolha (LE canônica, LPC na falta dela, croqui nunca somado).

/** Fabricação: corte, preparação, montagem, solda, pintura, PMP, fila e carga de corte. */
export const SO_FABRICACAO = { fonte: "LPC_IMPORT" };

/** Expedição: romaneio, carga, lista de embarque, o que o cliente recebe. */
export const SO_EXPEDICAO = { fonte: "LE_IMPORT" };

/** Rótulo de cada lista, para a tela dizer de onde o número veio. */
export const LISTA_LABEL = {
  LPC_IMPORT: "LPC (fabricação)",
  LE_IMPORT: "LE (expedição)",
};
