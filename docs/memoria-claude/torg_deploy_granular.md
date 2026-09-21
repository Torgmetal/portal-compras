---
name: torg-deploy-granular
description: "Workflow de deploy do Portal Compras — subir cada mudança individualmente (sobe e valida), não agrupar"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

No Portal Compras (Torg Metal), o Vitor quer **cada mudança subindo individualmente** para o portal — não agrupar várias features num deploy só.

**Why:** o time sobe e **valida em produção incrementalmente** (sem staging); ver cada mudança no ar isolada facilita pegar o que quebrou e validar item a item.

**How to apply:** manter o ritmo de um push/deploy por mudança/feature (como já vinha sendo feito). NÃO propor "juntar várias num deploy só" para economizar uso da Vercel. Se a Vercel pausar por Spend Management/limite, é decisão de infra do time religar/ajustar o limite no painel — não mudar a cadência de deploy. Relacionado: [[torg-qualidade]] e o fluxo do CLAUDE.md (validar local → push main).
