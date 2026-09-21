---
name: torg-peso-kg
description: "Padrão de exibição de peso no portal — sempre kg, nunca abreviar em t/ton"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
  modified: 2026-07-23T22:33:26.805Z
---

Vitor (2026-06-13): peso **sempre em kg com número real** (separador pt-BR), NUNCA abreviar para tonelada. Antes os formatadores convertiam ≥1000 kg em "1 t"/"ton" e ele não gostou ("esse t não está ficando bom").

**Why:** legibilidade/precisão — quer ver 1.474 kg, não 1,5 t.

**How to apply:** formatadores de peso (`fmtKg`/`fmtPeso`/`fmtPesoCell`/`fmtPesoCompacto`) devem retornar `${Number(v).toLocaleString("pt-BR", {maximumFractionDigits:1})} kg` (ou Math.round) — sem branch `if (>=1000) ... t`. Já corrigido em produção (painel, mapa, SetorClient, montagem, corte, peças), PCP (fila-corte, PmpClient, PCPDashboardClient — meta do mês passou a ser editada/exibida em kg, não ton), planejamento, expedição/checklist, ControleClient (KPIs/cards), KPIs de peso nos Excel da produção, eixo do gráfico em SetorPageClient. `lib/utils.js` `fmtKg` e `fmtPesoCompacto` já são kg.

**NÃO mexer (unidade própria, não abreviação):** comprimento mm→m (`comprimento/1000 m`); módulo comercial/orçamento (tonelagem de proposta, tiers "≤100 ton", `pesoTon` de frete por caminhão, AbaFretes/AbaResumo/AbaPintura/AbaCronograma/AbaProdutividade, e-mails de cotação de frete); admin/metas (`MetasClient` entrada em toneladas). Se for pedir, confirmar antes — frete/proposta em ton é convenção.

**Peso mostrado = SEMPRE o da lista de expedição, nunca um peso derivado (Vitor, 2026-07-23):** no rateio de custo por produção (aba Financeiro/margem) o motor usa "kg·setor" (soma das passagens por setor — a MESMA peça conta em corte, solda, jato, pintura…), que fica bem MAIOR que a tonelagem real da obra e confunde ("fica muito confuso, o peso sempre deve ser o que está na lista"). Regra: na UI só aparece o peso da **lista de expedição** (Σ marcas `pesoTotal`, dedup por marca); qualquer peso multi-contado é motor interno, nunca exposto. Onde o rateio precisava mostrar algo, virou **"% da fábrica → R$"** (fatia adimensional). Ver [[torg_financeiro_margem]].
