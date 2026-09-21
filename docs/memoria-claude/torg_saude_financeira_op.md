---
name: torg_saude_financeira_op
description: "Painel Saúde Financeira na aba Financeiro da OP — previsto × realizado por família, auditável, com export Excel"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-19T23:23:10.118Z
---

Painel no topo da aba **Financeiro** da OP (`lib/saude-financeira-op.js` + `app/comercial/[id]/SaudeFinanceiraOP.jsx`,
API `/api/comercial/op/[id]/saude-financeira`). Criado 19/08/2026 a pedido do Vitor: *"trazer todos os
cenários, verbas estimadas × realizadas, custos informados na planilha… para podermos **auditar** esses
números posteriormente"*.

Traz: **verba estimada × realizada por família** (cada uma abre e mostra os itens do contrato e os
pedidos que formaram os dois lados), **custos da planilha do estudo**, **receita**, **três cenários de
margem** (estudo/BDI · OP na abertura · corrente) e os **pontos pra conferir**.
Botão **Exportar Excel** → 6 abas (Resumo, Verba por família, Itens do contrato, Pedidos, Orçado × real,
Conferir); valores como número com formato de moeda, não texto.

**Regras que custaram caro para descobrir:**
- Pedido → família vem de `RM.categoriasOP` (`RMItem.opItemId` **nunca** é preenchido). FD avulso por
  `PedidoOmie.categoriaItem`. Rateia o **total do pedido**, não a soma das linhas (frete/desconto).
- Pedido que não se amarra fica visível em "sem família", **nunca** diluído entre as outras.
- 🚫 Não calcular preço unitário realizado (gasto ÷ quantidade): obra em andamento tem compra parcial e
  quantidade total — dá R$ 0,61/kg de aço contra R$ 7,34 orçado.
- Preço orçado sai **das linhas que têm a grandeza**, não da família inteira (OP-092 tinha "terças já
  pintadas" em kg junto com a tinta em m²).

Ver [[torg_receita_x_verba]] e [[torg_orcado_x_real_quantidade]]. O fechamento em PDF ficou para depois:
[[torg_relatorio_final_op]].
