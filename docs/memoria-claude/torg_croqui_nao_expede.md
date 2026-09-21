---
name: torg_croqui_nao_expede
description: Croqui NUNCA é expedido — quem embarca é o conjunto; a Expedição só lê CONJUNTO
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-19T23:52:14.053Z
---

**Croqui não se expede. Nunca.** Vitor (19/08/2026): *"nesse caso da OP-67 não vai expedir nenhum
croqui, aliás nunca vamos expedir um croqui"*.

O croqui é peça de fabricação: vira parte de um **conjunto**, e é o conjunto que embarca.

⚠ **CROQUI ≠ AVULSA** — o que separa é o `tipoPeca` nulo:

| `tipoPeca` | é | embarca? |
|---|---|---|
| `"CONJUNTO"` | conjunto | **sim** |
| `null` | **peça avulsa** (solo da LPC) | **sim** — 2.728 já expedidas na base |
| `"CROQUI"` | compõe conjunto | **não** |

Então a condição é `!tipoPeca || tipoPeca === "CONJUNTO"` — o **nulo tem de passar**. Trocar por
`tipoPeca === "CONJUNTO"` só, achando que nulo é lixo de dado, tira as avulsas do embarque.
Mesma leitura de `/api/producao/mapa` (`conjOuAvulsa`) e `/api/producao/prioridades`.

**Why:** a raia de Expedição das telas de prioridade lista os dois juntos (a OP-067 tem 2.594 croquis
ao lado de 1.330 conjuntos e 860 avulsas). Sem o corte, um croqui selecionado por engano ganharia `ConjuntoEntrega`
gravado e **invisível** pra quem embarca — pior que não fazer nada, porque parece feito.

**How to apply:** qualquer ação que direcione peça pra Expedição filtra `tipoPeca !== "CROQUI"` e
**avisa** o que ficou de fora, com marca. Implementado em `app/api/pcp/liberar-expedicao/route.js`.
Ver [[torg_status_obra]] e [[torg_listas_le_lpc]] (croqui vs conjunto vem da LPC).
