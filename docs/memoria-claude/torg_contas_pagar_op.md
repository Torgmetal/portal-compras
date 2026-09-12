---
name: torg_contas_pagar_op
description: "A OP de uma conta a pagar sai do projeto do Omie (getProjetosInfo), NÃO do pedido; tela da Diretoria tem filtro por OP/fornecedor + detalhe"
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Para descobrir a **OP de uma conta a pagar** (`ContaPagar`, sincronizada do Omie):
resolver **`projetoCodigo` → `getProjetosInfo()`** de `lib/omie-pedidos-abertos.js`
(devolve `Map<codigoString, { nome, numeroOp }>`). Os **"projetos" do Omie SÃO as
OPs** — nome tipo `"OP-078 - Danpower - ENC 328"`. Não dá pra ligar por pedido:
`contaPagar.numeroPedidoCompra` NÃO casa com `PedidoOmie` (só 70 registros no
portal; a maioria dos pedidos nasce direto no Omie).

Cobertura (24/06/2026, ~2.067 contas em aberto): **1.094 resolvem OP**; ~951 não
têm projeto no Omie (impostos/despesas gerais sem obra → OP fica "—"). Se uma
conta deveria ter OP e não tem, o **projeto precisa ser preenchido no lançamento
do Omie**.

Campos da conta (todos no modelo `ContaPagar`): fornecedorNome, numeroPedidoCompra,
numeroDocFiscal (NF), numeroParcela, observacao, projetoCodigo, + detalhe
(observação/pedido/projeto) que vem do `ConsultarContaPagar` e fica em
`detalheCarregado` (~⅓ ainda sem detalhe).

Feito na aba **Diretoria → A pagar** (`/api/diretoria/contas?tipo=pagar`,
`DiretoriaClient` `ContasView`): coluna OP + filtro por OP e por fornecedor +
linha expansível com pedido/NF/projeto/parcela/obs (commit 2df5477). **Pendente:
replicar no Financeiro** (`app/financeiro/contas-pagar`) depois do aval do Vitor.
Ver [[torg_modulo_diretoria]] e [[torg_omie_recebimento]].
