---
name: torg-liberar-montagem-pendente
description: "Portal Compras Torg — conjunto de montagem fica PENDENTE (nunca passa por CORTE); filtrar status ao liberar esconde o lote de todos os painéis"
metadata:
  type: project
---

**O status do CONJUNTO não conta a história do corte.** Quem passa pelo corte são os *croquis* dele;
o conjunto só sai de `PENDENTE` se por acaso existir apontamento de corte no Syneco para a marca do
conjunto. Então há conjuntos 100% prontos para montar ainda em `PENDENTE`.

Incidente 04/09/2026: `/api/producao/pecas/liberar-montagem` virava o status só de quem estava em
`CORTE`. O `updateMany` casava **zero linhas sem erro**, enquanto `montagemDiaProgramado` e
`montagemBancada` — gravados logo depois, sem filtro de status — iam para o banco. O lote ficava
**com dia e sem setor**: GRD impressa, e invisível em todo painel de montagem (que filtra
`status = 'MONTAGEM'`, ex.: `/api/pcp/setor`). Foram **197 conjuntos** (185 da OP-097, 12 da 105).

**A regra de verdade para descer é a PRONTIDÃO** (`calcularProntidao`, todos os croquis cortados),
não o status. Ter `montagemDiaProgramado` gravado é prova de que a prontidão passou — o dia só é
escrito para os `idsPermitidos`.

⚠ Ao investigar: `montagemDiaProgramado` é `@db.Date` — `String(date)` em JS mostra **um dia a
menos** (ver [[torg_fuso_servidor]]). Use SQL (`to_char`).

Ver [[torg_montagem_capacidade]], [[torg_producao_e_lpc]].
