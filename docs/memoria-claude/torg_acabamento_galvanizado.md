---
name: torg_acabamento_galvanizado
description: "Acabamento da peça define a rota final: galvanizado pula jato e pintura, mas há obra que pinta DEPOIS de galvanizar — regra dita, ainda não implementada"
metadata:
  type: project
---

Vitor (19/08/2026, sobre a **OP-085**): *"apenas os guarda-corpos irão ser pintados, as demais
peças foram galvanizadas"* e *"o galvanizado pula jato e pintura, porém pode ter obras que vamos
precisar pintar posteriormente à galvanização"*.

Ou seja o acabamento **não é da OP, é da peça** — na 085 convivem guarda-corpo pintado e estrutura
galvanizada na mesma obra. E são **três** rotas, não duas:

| acabamento | JATO | PINTURA |
|---|---|---|
| pintura (padrão) | sim | sim |
| galvanizado | **não** | **não** |
| galvanizado + pintura | **não** | sim |

Enquanto não existe o campo, essas peças ficam eternamente pendentes em Jato/Pintura e foram
baixadas na mão. **Ainda não implementado** — Vitor enunciou a regra, não pediu a construção;
confirmar o desenho (campo por peça, herdando um padrão da OP) antes de mexer.

Impacto onde a rota final é lida: [[torg_prioridades_setor]], [[torg_peca_setor_real]],
[[torg_cronograma_syneco]] e a baixa por setor.
