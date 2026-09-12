---
name: torg-vercel-neon-deploy
description: "Deploy Vercel falha em \"Provisioning integrations failed\" quando a integração Neon estoura o limite de branches (1 branch por preview deploy); Vercel Pro NÃO resolve (o limite é do plano Neon)"
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Deploy do portal-compras (projeto Vercel `workspace-torg`) pode falhar em ~2s na etapa **Provisioning Integrations** com a mensagem genérica "Provisioning integrations failed". Expandindo a etapa, o erro real vem da integração **Neon** (store `neon-cyclamen-candle`): *"Create database branch for deployment — Branch limit reached. Upgrade your plan or delete unused branches."*

**Causa:** a integração Neon↔Vercel cria 1 branch de banco por **preview deploy**; elas acumulam e estouram o limite de branches do **plano do Neon** (NÃO do Vercel). Por isso migrar o **Vercel** para Pro não resolve — o limite é do Neon, plano separado. Incidente em 2026-06-15 (logo após upgrade do Vercel pra Pro, que resolveu uma pausa anterior por Spend Management).

**Why:** falha antes de compilar, então derruba o deploy inteiro. Atinge preview deploys (cada push de branch). Produção (`main`) usa a branch primária e normalmente não cria branch nova → tende a continuar subindo; confirmar com redeploy da main.

**How to apply:**
- **Fix recomendado (1 clique, sem risco):** desativar *"Create a branch for each preview deployment"* na integração Neon (Vercel → Storage → store `neon-cyclamen-candle` → Settings; ou Neon Console → Integrations → Vercel). A etapa que falha é "Create database branch for deployment" — desligada, o preview nem tenta criar branch → deploy passa. Preview passa a usar o banco de produção (coerente com o setup sem staging, dev roda contra prod — ver [[torg_mes_syneco]]).
- **Alternativa:** Neon Console → projeto → Branches → apagar 2–3 branches de **preview** antigas. NUNCA a branch primária/produção (o banco de prod É uma branch Neon; apagá-la perde dados).
- Depois: Redeploy e confirmar `main` verde.
- Env tem `NEON_PROJECT_ID` mas **não** há `NEON_API_KEY` → não dá pra listar/gerenciar branches por API; só pelo painel.
