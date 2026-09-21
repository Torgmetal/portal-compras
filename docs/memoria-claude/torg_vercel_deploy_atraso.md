---
name: torg_vercel_deploy_atraso
description: Deploy Vercel — webhook do git às vezes demora 20+ min; NÃO forçar por CLI (vercel --prod falha nesse projeto)
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
---

**O deploy pelo git (push na main) às vezes demora MUITO** — em 16/07/2026 o push do `3a39ebc` levou ~20+ min pra criar o build. Nesse intervalo o painel/CLI mostram **zero deployment criado** (não é "falhou", é "não existe ainda"), o que parece bloqueio de conta/limite. **Não é.** Ele sobe sozinho. Esperar.

⚠️ **NÃO tentar forçar com `vercel --prod` pelo CLI** neste projeto: as 4 tentativas **criaram** deployments que **erraram em 19–34s** (provavelmente env vars que o build via CLI não recebe). O `ETIMEDOUT` do CLI engana — é só o cliente desistindo de esperar a resposta; o deployment É criado do outro lado. Resultado: 4 deploys de erro poluindo o histórico, sem resolver nada.

**Como diagnosticar direito** (o CLI está logado como `vitor-6515`, scope `torg`, projeto `workspace-torg`; MCP da Vercel retorna times vazios — inútil):
- `vercel ls workspace-torg --scope torg` → lista com idade/status. Ícone `-o-` = git, `>_` = CLI.
- `vercel project ls` → mostra "Latest Production URL" + quando atualizou.
- Correlacionar a **hora do deploy** com `git log --date=format:"%H:%M:%S"` pra saber qual commit está no ar.
- Middleware devolve **307 pra tudo** (inclusive rota inexistente), então sondar rota por HTTP **não** distingue deployado de não-deployado.
- `curl https://www.vercel-status.com/api/v2/status.json` pra descartar incidente global.

Lição: com "não achei o botão", antes de concluir bloqueio de infra, **conferir a hora do último deploy vs a hora do commit** e dar tempo ao webhook. Ver [[torg_vercel_neon_deploy]] (esse sim é bloqueio real: branch limit do Neon em preview).
