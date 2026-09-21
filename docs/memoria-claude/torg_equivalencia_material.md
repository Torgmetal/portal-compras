---
name: torg_equivalencia_material
description: "Modelo/Tekla nomeia chapa pela espessura NOMINAL e a lista pela REAL (CH12 = CH12,5) — sempre considerar ao cruzar perfis"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-09-03T00:59:28.160Z
---

Vitor (03/09/2026): "sobre a equivalência de material vc sempre terá que ver isso pois acontece com bastante frequência".

Ao cruzar perfil do **modelo/Tekla** com perfil da **lista (LPC/LE)** ou do **Omie**, os dois lados falam dialetos diferentes do mesmo aço. Medido na OP-089 (679 peças):

- **chapa: nominal × real** — o Tekla escreve `CH12`, `CH5`, `CH30`; a LPC escreve `CH12,5`, `CH4,8`, `CH30`. Só essa equivalência recuperou **191 peças** (12→12,5 em 138, 5→4,8 em 44, 30→30 em 9) e levou o casamento de 32,3% para 50,4%.
- **escape do IFC** — `TB\S\X42.40X2.65` significa **TB Ø42,40x2,65** (`\S\c` = caractere + 128, ISO 10303-21). Sem decodificar, o perfil vira um nome que não existe em lugar nenhum. Ver `destep` no visualizador.

**Why:** sem isso o cruzamento parece "lista faltando" quando é só nome diferente — cheguei a reportar 87% sem par por causa do escape não decodificado, número que caiu para 62% depois de corrigir.

**How to apply:** nunca comparar perfil por string crua. Normalizar (maiúsculas, vírgula→ponto, tirar tudo que não é letra/número/ponto), decodificar escape do IFC e tratar espessura de chapa com tolerância (~12%) em vez de igualdade. E lembrar do limite: mesmo casando, **perfil+comprimento não identifica marca** — 1 em 6 cai em mais de uma (`W200X15 869 mm` → 4 marcas). Casar por semelhança só serve para conferência, nunca para carimbar marca que puxa R/croqui. Ver [[torg_listas_le_lpc]], [[torg_portal_estrutura_3d]].
