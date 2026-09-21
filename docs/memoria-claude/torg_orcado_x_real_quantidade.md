---
name: torg_orcado_x_real_quantidade
description: "Erro de orçamento em quantidade (m² de pintura, kg) é problema recorrente — confrontar estudo × lista de expedição"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-19T19:31:00.518Z
---

Verba estourada quase sempre é **erro de quantidade no orçamento**, não preço de compra. A medida
real da obra está na **lista de expedição**: `ListaExpedicao.marcasJson` traz `areaTotal` (m² de
pintura) e `pesoTotal` (kg) **por marca** — preenchido em 47 das 51 listas.

Confronto na aba Financeiro da OP (`lib/saude-financeira-op.js` → `confronto()`):
orçado (item do contrato, ou `estudoDados.aco.areaPinturaM2`) × real (soma da LE, dedup por marca).
Custo projetado = **quantidade real × preço que o próprio orçamento usou** — isola o erro de
orçamento sem misturar com preço de compra.

Levantamento 19/08/2026: OP-085 pintura +116% (318→687 m²), OP-092 +105%, OP-084 +18%;
peso da OP-085 +54%. Estimar área por peso não funciona: a razão m²/t vai de 22 a 70 entre obras.

🚫 **Não calcular "preço unitário realizado" como gasto ÷ quantidade real.** Em obra em andamento a
compra é parcial e a quantidade é total — dá R$ 0,61/kg de aço contra R$ 7,34 orçado. Preço se
apura na cotação.

⚠ **Cobertura sempre junto do número**: nem toda marca tem área medida (OP-085: 139 de 224).
Faltando marca o realizado fica curto — desvio pra cima fica *pior* que o mostrado, desvio pra
baixo fica *menor*.

Vínculo pedido→família é `RM.categoriasOP` (`RMItem.opItemId` nunca é preenchido — zero de 19
linhas nas OPs 112/113). Ver [[torg_faturamento_direto]], [[torg_receita_x_verba]] e
[[torg_status_obra]].
