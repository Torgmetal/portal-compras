---
name: torg-meta-preparacao
description: "Meta de produção da preparação (corte) = 6.000 kg/dia do setor inteiro; base dos \"dias de carga\""
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

A **meta de produção da preparação (corte) é 6.000 kg/dia do setor inteiro** (Vitor, 17/06/2026) — todas as máquinas de corte juntas (Laser Chapa/Perfil/Tubo/Cantoneira + Policorte).

**Why:** a "Carga do Corte" (`/pcp/carga-corte`) calculava os dias dividindo o backlog pela **média kg/dia medida no Syneco (30d)**, que subestima a capacidade porque inclui dias de baixa alimentação da máquina (ex.: Laser Perfil dava 1.966 kg/dia → 7,9 dias, quando o real é ~2,5). A meta do setor é a base correta de planejamento.

**How to apply:** o endpoint `app/api/pcp/carga-corte/route.js` usa a constante `META_PREPARACAO_KG_DIA = 6000` como divisor; `diasCarga = backlogKg / 6000` (peso RESTANTE, não cheio). O ritmo real do Syneco (30d) continua exposto só como referência (`ritmoRealKgDia`). Hoje é constante no código — se pedirem ajustar por máquina ou editável, virar config/admin. Ver [[torg_fila_corte]].
