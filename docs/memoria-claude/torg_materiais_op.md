---
name: torg_materiais_op
description: Fluxo de compras por OP (MateriaisOPSection) e semântica peso/barras do RMItem
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-07-29T13:52:42.299Z
---

**Semântica do RMItem (aço, `peso > 0`):** `peso` = KG total solicitado; `qtd` = **nº de barras**; `unidade` = unidade original. Item "lançado só pelo peso" tem `peso > 0` e `qtd = 0` (sem barras). Item não-aço (`peso = 0`) usa `qtd` na própria unidade. Confirmado em `lib/cotacao-estoque.js` (cotação de aço vai em KG proporcional às barras). O **recebido real** vive em `Recebimento` (qtdRecebida, nfNumero, ligado por `rmItemId` e `pedidoOmieId`) — pra aço a qtdRecebida é em KG (comparável ao `peso`).

**Cadeia solicitado→recebido:** OP → `RM` → `RMItem` (solicitado) → `RMItem.pedidoOmieId` → `PedidoOmie` (pedido gerado: numeroPedido, fornecedor, nfNumero) → `Recebimento` (qtd real + NF).

**`MateriaisOPSection`** (`components/MateriaisOPSection.jsx`, API `GET /api/op/[id]/materiais`): lista os itens de todas as RMs da OP com Solicitado (peso kg + barras) → Pedido → NF → Recebido (qtdRecebida; verde=completo ≥98%, âmbar=parcial) → Status → Fornecedor, + export xlsx padrão Torg. Aparece nas abas **Resumo** E **Compras** do detalhe da OP ([[torg_op_vistas]]). A API já buscava os recebimentos (só usava pra derivar status RECEBIDO/COMPRADO); passou a expor peso/barras/qtdSolicitada/qtdRecebida (commit a15c9cd, 28/07). Validado na OP 092.

Atenção: pra item "lançado só pelo peso" o `qtd` pode ser um placeholder (ex.: 1) e sair como "1 br" — se incomodar, filtrar barras só quando `unidade` for de barra.
