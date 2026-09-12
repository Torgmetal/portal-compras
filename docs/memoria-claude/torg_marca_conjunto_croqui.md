---
name: torg_marca_conjunto_croqui
description: "Marca" = peça avulsa; o que se entrega é conjunto + marca — croqui é componente e não entra em documento do cliente
metadata:
  type: project
---

Vocabulário que o Vitor fixou (26/08/2026): a **peça avulsa chama-se MARCA**.
São três naturezas em `PecaConjunto`:

- **Croqui** (`tipoPeca = "CROQUI"`) — peça-componente; vira parte de um conjunto,
  não existe sozinha na obra. Só Preparação.
- **Marca** (avulsa; `tipoPeca` null ou não-conjunto sem croquis) — peça inteira
  por si; Corte e depois direto ao Jato.
- **Conjunto** (`tipoPeca = "CONJUNTO"` com croquis) — Montagem em diante.

**Regra:** onde a pergunta é "o que a obra entrega", o universo é
**conjunto + marca**, nunca croqui. Vale para o Data Book (§02 leva conjunto e
marca; croqui fica só na GRD), para denominadores de cobertura e para qualquer
contagem de "marcas da OP". Escala: a OP-097 tem 756 croquis para 29 conjuntos —
misturar afoga o documento do cliente.

**Why:** croqui é controle interno de fabricação; documento do cliente é outra
coisa. Contar os dois junto infla denominador e enche a §02 de desenho que o
cliente não procura.

**How to apply:** filtrar `tipoPeca: { not: "CROQUI" }` em contagem de marcas e no
que alimenta o Data Book. A GRD continua registrando croqui — imprimir croqui é
liberação e tem de ser controlada. Ver [[torg_databook_revisao]],
[[torg_grd_desenhos]] e [[torg_portao_desenho]].
