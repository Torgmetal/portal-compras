---
name: torg_producao_e_lpc
description: "Antes de contar/filtrar peça em QUALQUER tela de produção, escolher a lista explicitamente — Vitor já corrigiu isso várias vezes"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-09-03T18:41:15.931Z
---

Vitor (03/09/2026): **"novamente você e suas duplicações, já disse várias vezes que produção é LPC"**.

É a terceira vez que o mesmo erro volta com outra roupa. Toda consulta de `PecaConjunto` em contexto
de **fabricação** (corte, preparação, montagem, solda, pintura, PMP, fila, carga, prontidão) tem de
escolher a lista explicitamente — `SO_FABRICACAO` de `lib/lista-pecas.js`. Sem isso a mesma marca
entra duas vezes, porque LPC e LE descrevem a MESMA estrutura de aço.

**Why:** o registro da LE não só duplica — ele MENTE. Medido na OP-105 (03/09/2026): a montagem via
36 conjuntos e dava 12 como "100% cortados"; os 12 eram todos da LE, com 1–5 croquis grudados por
engano (o registro real da LPC tinha 17–27). Como esses poucos estavam cortados, apareciam prontos —
e um lote deles desceu para a bancada com as peças ainda na máquina de corte. Da LPC, prontos de
verdade: zero.

**How to apply:**
- filtro de fabricação = `...SO_FABRICACAO`; nunca escrever `fonte`/`naLPC` à mão (vira dialeto novo)
- ao investigar "por que aparece X", **primeiro** separar por `fonte` antes de concluir qualquer
  número — foi o que revelou este caso
- marca sem sub-peça não monta (`CONJUNTO_MONTAVEL` exige croqui); marca **é** avulsa, conjunto é
  que tem croqui — ver [[torg_marca_conjunto_croqui]]
- a trava de "só desce conjunto 100% cortado" existia só na rota do chão de fábrica; o caminho do
  Planejamento não conferia nada (03/09: 20 conjuntos com croqui faltando desceram para 04/09)

Ver [[torg_listas_le_lpc]] (seção "LE = EXPEDIÇÃO · LPC = FABRICAÇÃO") e [[torg_libs_compartilhadas]].
