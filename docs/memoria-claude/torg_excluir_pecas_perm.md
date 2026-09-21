---
name: torg_excluir_pecas_perm
description: "Permissão do \"Excluir peças selecionadas\" (delete-por-ids) = união dos perfis das telas que servem o ProgramacaoCorteClient"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-12T17:36:04.609Z
---

O botão **"Excluir peças selecionadas"** chama `DELETE /api/producao/pecas` com `{ids}` (delete-por-ids); "Excluir OP inteira" usa `{ops}`/`?op=` e **continua só ADMIN**.

**Pegadinha (já causou 403 duas vezes — 1º COMPRAS, 2º Gabriel/ENGENHARIA-PCP):** o **mesmo** `ProgramacaoCorteClient` é servido por páginas com **guards diferentes**:
- `/producao/programacao/corte` → ADMIN/COMERCIAL/COMPRAS/PRODUCAO
- `/pcp/pecas-corte` e `/pcp/fila-corte` → ADMIN/PCP/PLANEJAMENTO/PRODUCAO
- `/engenharia/listas` (ListasClient também deleta) → ADMIN/ENGENHARIA
- expedicao-semanal / relatorio-expedicao → EXPEDICAO

Então a rota de delete-por-ids tem que aceitar a **UNIÃO** desses perfis, senão quem entra por um caminho mais permissivo toma 403. Hoje (commit 4124b75): `["ADMIN","PRODUCAO","PCP","PLANEJAMENTO","ENGENHARIA","COMERCIAL","COMPRAS","EXPEDICAO"]` nas duas rotas (`route.js` bulk + `[id]/route.js`). auditLog registra quem excluiu.

**Outra pegadinha:** `User.modulos` no banco é **array de objetos** `[{modulo:"PCP"},…]`, mas a sessão/JWT normaliza pra **strings** — por isso `requireRole` (`userModulos.includes("PCP")`) funciona. Se um guard novo falhar sem motivo, conferir se está lendo string vs objeto.
