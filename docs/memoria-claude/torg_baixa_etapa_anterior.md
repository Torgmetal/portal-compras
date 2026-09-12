---
name: torg-baixa-etapa-anterior
description: "Apontamento numa etapa à frente dá baixa nas anteriores — a peça jateada foi montada e soldada, mesmo sem registro"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 3eab059d-15a2-4872-a325-5e90f443c4e3
  modified: 2026-09-09T21:20:23.428Z
---

Vitor (09/09/2026): *"sempre se lembre que se existir apontamento na frente você deve dar baixa nos setores anteriores"*.

A rota é Corte → Preparação → Montagem → Solda → Acabamento → Jato → Pintura. Se existe
apontamento em qualquer etapa POSTERIOR, todas as anteriores estão feitas — a peça não chega ao
jato sem ter sido montada e soldada.

**Why:** a fábrica aponta de forma desigual e o furo é enorme. Medido nos guarda-corpos da OP-067
em 09/09/2026: 332 das 575 marcas tinham apontamento faltando em alguma etapa. Pelo cru, faltavam
337 montar e 379 soldar; pela rota, faltavam **31 e 71**. A resposta muda de "a obra está pela
metade" para "a fabricação está fechada, falta o acabamento". Sem a regra, todo relatório de
"o que falta" mente para mais.

**How to apply:**
- Em toda pergunta de **"o que falta / onde está a peça"**: use `real = max(apontado nesta etapa,
  maior apontado em qualquer etapa posterior)`, limitado ao planejado.
- **NÃO use** em pergunta de **produtividade por setor e por período** ("quanto a montagem fez em
  agosto"): a dedução prova que a peça passou, não QUANDO nem por quem. Creditar o kg ao mês errado
  estraga indicador e meta.
- O sinal de que há furo é a rota não ser monotônica: jato 66% com solda 44% é impossível.
- Ver também [[torg_peca_setor_real]], [[torg_etapa_conjunto_croqui]] e
  [[torg_dado_historico_incompleto]].
