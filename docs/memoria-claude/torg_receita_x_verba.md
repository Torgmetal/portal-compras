---
name: torg_receita_x_verba
description: Receita do contrato = o que se FATURA; itens do contrato = verba que o Compras pode GASTAR — nunca o mesmo número
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-19T18:51:47.915Z
---

Na OP do portal são **duas coisas diferentes** e confundi-las libera verba a mais pro Compras:

- **Receitas do contrato** (`OPReceita`) = o valor de **VENDA**, o que vai ser faturado ao cliente.
  Sai da coluna `valor` da PLANILHA COMERCIAL do estudo.
- **Itens base do contrato** (`OPItem.valorVerba`) = o que o **Compras pode gastar**.
  Sai de `custoMaterial + mdoTerceirizada` — nunca de `valor`.

A diferença entre os dois é industrialização + BDI: é o que a Torg **transforma**, não se compra.

Na OP-116 o erro dava R$ 447.210,50 de verba para um teto real de R$ 327.632,98 (venda R$ 564.100,32).

**Impostos** saem da aba **BDI** do estudo (`lerBdi` em `lib/estudo-comercial.js`): tabela de % por
CFOP (5101 dentro do estado, 6101 fora, 5125 industrialização, 701/702/1405 serviço), valores de
faturamento com imposto por linha, crédito recuperável e o split Torg × faturamento direto.
São três números distintos: **destacado na nota** − **crédito das compras** = **líquido**
(OP-116: 167.340,36 − 65.429,17 = 101.911,19, 18,07%).

**Why:** Vitor (19/08/2026): "a receita do contrato seria o valor a ser faturado e itens de contrato
seria o valor que o compras deveria comprar, isso que deve ser a confusão que está fazendo". Verba
inflada é dinheiro autorizado que a obra não tem.

**How to apply:** usar `receitasDaPlanilhaComercial()` e `itensDaPlanilhaComercial()` de
`lib/op-categorias.js` — nunca montar à mão. Para OPs antigas, `scripts/recalcular-estudo-op.mjs`
(simula por padrão, grava com `--aplicar`). Ver também [[torg_orcamento_servico]] e
[[torg_financeiro_margem]].
