---
name: torg_cronograma_avanco_manual
description: Cronograma — percentual digitado à mão prevalece sobre os sincronismos (Syneco na Fabricação, CMR em Suprimentos) via CronogramaTarefa.avancoManual; OP-094 Recebimento mantido em 100 % como o Guilherme lançou
metadata:
  type: feedback
---

**Quando alguém digita o percentual de uma tarefa, esse número vale; o automático não passa por cima.**
`CronogramaTarefa.avancoManual` (coluna criada por `scripts/ensure-cronograma-avanco-manual.mjs`) é
ligada pelo PATCH da tarefa sempre que `percentualRealizado` vem no body; `avancoManual: false` no body
devolve a linha ao automático. `avancosDasTarefas` (Syneco) e `aplicarAvancoSuprimentos` (CMR) pulam
tarefas com a flag.

**Why:** Vitor (14/09/2026), OP-094: o Guilherme tinha posto "Recebimento da matéria-prima" em 100 %
em 04/09; o sync do CMR devolveu 84 % (10.873 de 13.024 kg — faltam chapas da RM T94-002, chapa 3 mm
do rodapé, tubo inox e chapa xadrez). Eu ia deixar o automático mandar; ele cortou: "não precisa
atualizar não, deixa como o Guilherme fez". Quem opera decide o que o cronograma diz ao cliente.

**How to apply:**
- Não "corrigir" percentual lançado à mão sem perguntar; o sync é atalho, não autoridade.
- O % geral da lista do Planejamento é ponderado por DURAÇÃO (tarefa sem duração pesa 1): OP-094 em
  14/09 = 34 % (Engenharia 100, Suprimentos 100, Fabricação 6, Expedição 0); a média simples daria 52 %.
- Item da RM atendido pelo ESTOQUE conta como recebido (não passa pelo CMR) — `lib/cronograma-suprimentos.js`.
- Relacionado: [[torg_cronograma_syneco]], [[torg_status_compra_cmr]], [[torg_cronograma]].
