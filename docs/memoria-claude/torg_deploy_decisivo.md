---
name: torg-deploy-decisivo-sem-pedir
description: Vitor quer que eu suba/deploye decisivamente quando a direção já está acordada — sem ficar pedindo permissão a cada passo
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Quando o objetivo/direção já está claro e acordado, EXECUTAR (merge na `main`, push, deploy, redeploy, ajustes) e reportar o resultado — não ficar pedindo permissão a cada etapa.

**Why:** em 2026-06-15 o Vitor se irritou com eu pedir confirmação repetidas vezes pra subir a mesma feature: "sim nao precisa ficar me pedindo permissão sobe essa porra, me faça ganhar tempo voce anda". Ele valoriza velocidade e ação.

**How to apply:** dada uma aprovação/direção clara, seguir até o fim (inclusive deploy em produção) e mostrar o resultado. Reservar perguntas só para decisões realmente ambíguas ou destrutivas/irreversíveis (ex.: apagar dados de produção). Combina com [[torg_deploy_granular]] (subir cada mudança individualmente) e [[torg_vercel_neon_deploy]].
