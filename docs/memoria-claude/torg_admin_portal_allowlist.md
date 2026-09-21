---
name: torg-admin-portal-allowlist
description: Painel /admin e alerta dos crons são allowlist por e-mail (Vitor + Matheus), não o tipo ADMIN
metadata:
  type: project
---

Painel `/admin` e o e-mail diário do monitor de crons são restritos por allowlist em
`lib/admin-portal.js` (`ADMINS_DO_PORTAL` = vitor@ e matheus@), com `requireAdminDoPortal()`
em `lib/session.js`. Nem ADMIN burla — mesmo padrão de [[torg_modulo_diretoria]].

**Why:** Vitor (05/09/2026) quis tirar Caio, Guilherme e Fabrine do painel e dos alertas
**sem** tirar o acesso full. Rebaixar o `tipo` de ADMIN para USUARIO não serve: 43 rotas de
trabalho do dia a dia exigem `requireRole(["ADMIN"])` (aprovações do Comercial, Controle de OP,
reclassificação de máquinas, cancelar RM) — eles perderiam o trabalho junto com o painel.

**How to apply:** para incluir/excluir alguém do painel ou dos alertas, mexa só na lista de
`lib/admin-portal.js`. Os 5 ADMINs do banco continuam ADMIN de propósito.
