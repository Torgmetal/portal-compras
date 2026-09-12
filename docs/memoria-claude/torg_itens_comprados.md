---
name: torg_itens_comprados
description: "Itens comprados (parafuso/porca/arruela/chumbador/telha/calha/…) são ignorados no fluxo de PRODUÇÃO, mas valem p/ Eng/Compras/Planejamento/Expedição; LE tem 100% dos itens"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-17T22:07:12.979Z
---

Regra do Vitor (08/2026): itens **comprados / não fabricados** por nós — **parafuso, porca, arruela, chumbador, cola, telha, calha, rufo, rebite/arrebite, grade de piso, steel deck, cumeeira, abraçadeira, curva, tubo PVC** — **NÃO entram no fluxo de PRODUÇÃO** (Corte/Montagem/Solda/…, TV de prioridades, painel de Liberar/Baixa). Mas continuam valendo para **Engenharia, Compras, Planejamento e Expedição**, e a **LE (Lista de Expedição) tem 100% dos itens** — não apagar nada. **LE ≠ LPC** (croqui é da LPC; a LE é a lista de expedição, manda tudo).

**Identificação** (`lib/item-comprado.js` → `ehItemComprado(peca)`): pelo **PESO** (regra final do Vitor 17/08, substituiu a lista de nomes):
- **TEM peso** (`pesoTotalKg`||`pesoUnitKg` > 0) → **mostra** na produção, EXCETO cobertura/piso comprado `RX_COBERTURA = /\b(telha|rufo|calha|grade de piso)/` (vêm com peso mas não fabricamos) — mas **"suporte" de calha** tem peso e É fabricado → mostra (guard `!d.includes("suporte")`).
- **SEM peso** → esconde (parafuso/porca/arruela/chumbador/cola/… vêm sem peso), **a não ser** que seja corte real (tem `perfil` de aço OU é `CROQUI`) só sem o peso preenchido — falha de dado (ex.: 11 chapas "CH9.50X203" sem peso no banco) → essas FICAM.

Efeito vs regra antiga (nome): **abraçadeira/chumbador/arruela COM peso agora APARECEM** (só cobertura/piso some com peso). ⚠️ A trava do perfil/croqui é essencial: sem ela, 11 chapas reais sem peso sumiriam. Croquis-filhos de conjuntos de cobertura: como têm peso e perfil, seguem no Corte (é corte real). Validado prod OP-085: ignora grade(59)+telha(3)+rufo(1)+sem-peso(19)=82; abraçadeira(17kg)/suporte-de-calha(271kg)/11 chapas aparecem.

**Aplicado (17/08):** `/api/pcp/despacho` (filtra do escopo do painel, junto com o anti-lixo `^(total|soma)`) e `lib/prioridades-setor-data.js` `selecionarUniverso` (filtra do universo — importa p/ OPs 100% LE; carreguei `descricao`+`perfil` no loader). **Falta aplicar** (se aparecer): Relatório de Produção (`/pcp/relatorio-corte`), Fila de corte, `AbaProducao` (status), etc.

Validado prod: nome casa comprado em **250** peças → **233 ignoradas** × **17 fabricadas mantidas** (os calha/chumbador conjuntos + arruela-chapa). OP-085 (a do print do Vitor com PARAFUSO/ARRUELA/PORCA na Montagem): remove **82** comprados. Relacionado: [[torg_listas_le_lpc]], [[torg_prioridades_setor]].

## Grade de piso / degrau — pelo MATERIAL, não pela marca (19/08/2026)

Vitor apontou que os croquis **AG** da OP-089 (T89AG1…) não passam pela fábrica — são degrau /
grade de piso. Diagnóstico certo, **sinal errado**: o confiável é o `material`.

- O **Tekla marca a grade com `material: "GS_A4_304"`** (`GS_A2_304` num caso) e escreve um
  **perfil FALSO de chapa** — `CH30.00X1292` é o painel de grade, não uma chapa de 30 mm.
- Na base: **132 peças com material `GS_*`, e só 36 têm "AG" na marca.** A T64T usa `T64T715`,
  `T64T725`… com a mesma grade. Filtrar por "AG" pegaria ¼ do problema.

`ehGradeDePiso()` em `lib/item-comprado.js`: material `GS_*` (principal) **ou** marca
`T<op>AG<n>` (reforço, para LPC sem material — mesma âncora do `marca-ac.js`, que evita casar
marca que só *contém* "AG"). `RX_COBERTURA` também cobre grelha/degrau/gradil/grating.

Sintoma que isso causava: a peça entrava no corte, ficava **eternamente "sem material no CMR"**
(nunca compramos essa chapa) e inflava o peso do setor. Saíram da produção: OP-089 4.569 kg,
OP-064 8.974 kg. Ver [[torg_rastreio_corrida]] e [[torg_status_compra_cmr]].

## Fixação COM peso (19/08/2026)

Parafuso/porca/arruela vêm sem peso e já caíam no ramo do peso. O **parabolt** da OP-067 veio com
16 kg e entrava na fila do corte — Vitor: *"a parabolt entra na regra dos parafusos também, não
deve aparecer nas listas da produção"*. `RX_FIXACAO_COMPRADA` ignora independente do peso.

⚠️ **Regex estreita de propósito.** Varri a base: 51 peças com nome de fixação **e** peso, e a
maioria nós **fabricamos** — `ARRUELA CHAPA` é arruela cortada de chapa, `TIRANTE` e `PINO
ARTICULADOR` saem com perfil, `CHUMBADOR` aparece como CONJUNTO de 1.746 kg. Esconder peça
fabricada é o erro caro: some do setor e o conjunto não monta ([[torg_prioridades_setor]]). Só
entra nome de item que se compra pronto — hoje só o parabolt (1 peça na base).
