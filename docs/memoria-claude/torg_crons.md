---
name: torg_crons
description: Crons do Vercel mortos → CAUSA RAIZ era o redirect .vercel.app→workspace (308 comia o cron na edge); + middleware + monitor heartbeat; CRON_SECRET não setado
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

## CAUSA RAIZ (02/07/2026, commit b0ff346) — o redirect canônico comia os crons na edge

**O Vercel dispara os crons no host `.vercel.app` do deploy** (ex.: `workspace-torg-xxx.vercel.app`), NÃO no domínio custom. O `vercel.json` tinha um redirect **308** de `(?!workspace…).*\.vercel\.app$` → `https://workspace.torg.com.br/:path*` (`permanent:true`). Então o cron batia no `.vercel.app`, tomava **308**, e **o Vercel NÃO segue redirect** → a função **nunca executava**. Isso acontece na **edge, ANTES do middleware** — por isso o fix do middleware (28/06) não resolveu: a requisição nem chegava lá. Resultado: os **9 crons mortos** (heartbeats congelados) — estoque, sync-entregas, faturamento, financeiro, reconciliar, monitor, tudo.

Confirmado por: `vercel crons ls --format json` mostra `"host":"…vercel.app"`; `curl -I` no `.vercel.app/api/cron/monitor` devolvia `HTTP 308` + `location: workspace.torg.com.br`.

**FIX:** excluir `/api/` do redirect — `source:"/:path((?!api/).*)"`, `destination:".../:path"` (redirect de domínio canônico nunca deve pegar API; protege crons + webhooks server-to-server). Páginas seguem redirecionando pro domínio bonito. **Validado em prod:** página `/comercial` → 308; `/api/cron/reconciliar-syneco-corte` → **200** e heartbeat atualizou. ⚠️ Só vale no deploy NOVO (o cron religa no host do deploy atual). Se algum dia os crons morrerem de novo, checar PRIMEIRO se o host de cron (`vercel crons ls --format json`) está tomando redirect.

⚠️ **Vercel MCP dá 403 nesse time; a CLI `npx vercel` (logada como vitor-6515) funciona** — usar a CLI pra cron/logs/deploy status.

---

**O middleware TAMBÉM bloqueava (necessário, mas não suficiente).** `middleware.js` (NextAuth `withAuth`) roda em tudo (matcher amplo) e a allowlist pública **não tinha `/api/cron/`**. Mesmo que o redirect não existisse, o cron chega **sem sessão NextAuth** → seria redirecionado pro `/entrar`. **Corrigido 28/06/2026 (commit ca4d22b):** liberados `/api/cron/` e `/api/producao/sync-sharepoint` na allowlist. Os dois fixes juntos (redirect + middleware) é que fazem o cron rodar.

**Auth dos crons:** padrão = `ua.includes("vercel-cron") || authorization === "Bearer "+CRON_SECRET`. `sync-entregas` e `sync-sharepoint` antes só checavam o Bearer (ficavam abertos sem CRON_SECRET) — padronizados.

⚠️ **`CRON_SECRET` NÃO está setado na Vercel** (confirmado: chamar a rota sem auth roda o sync = 504, não 401). **Ação do Matheus:** setar `CRON_SECRET` no env da Vercel — aí o Vercel injeta o Bearer nos crons e bloqueia chamadas públicas. Enquanto não setar, os crons rodam (via user-agent vercel-cron) mas as rotas ficam publicamente chamáveis.

**Monitor de crons (guarda-corpo, commit ed732ed):** modelo `CronHeartbeat` (job @id, lastRunAt/lastOkAt/ok/mensagem/duracaoMs). Cada cron chama `registrarExecucao(job, {...})` de `lib/cron-monitor.js`. Cron `/api/cron/monitor` (10h diário) roda `checarSaudeCrons()` → se algum cron passou de `maxHoras` sem sucesso (ou nunca rodou/falhou), manda **e-mail pros ADMINs** (+ env `CRON_ALERTA_EMAILS`). Lista de crons esperados + cadência em `CRONS_ESPERADOS`. Pendente/ideia: tela pra **ver** a saúde dos crons (hoje só alerta por e-mail).

**`sync-entregas`** estourava 60s (504) na varredura de NF do Omie → `maxDuration` 60→300. Crons no `vercel.json` (9 agora, +monitor). Plano Vercel suporta os schedules horários (logo, Pro). Ver [[torg_omie_recebimento]] e [[torg_seguranca_pendencias]].

**11/09/2026 — custo Vercel/Neon e agenda dos crons.** Aviso "US$ 15 de US$ 20 do crédito Pro" (ciclo zera dia 15); Neon é
fatura à parte (jul/ago: US$ 24,54 = 231 CU-h, compute nunca dormia). Medido: 1.389 deploys de produção em 30 dias (~46/dia,
build 6–8 min, 2.050 funções de 13 MB) e 21 crons ≈ 330 disparos/dia. Vitor mandou o cron do data book sair de `*/5` para
**`15 10-21 * * 1-5`** (commit fcad0bf6, build 3102). ⚠ **As agendas do vercel.json são UTC**: os crons "6-20" rodam das
3h às 17h de Brasília (heartbeat confirma: estoque-produtos 13:01Z, emails 19:45Z). Pendências sugeridas, não feitas: puxar os
crons de hora em hora (estoque-produtos 58 s, estoque-movimentacoes, reconciliar-syneco, emails-engenharia, pasta-engenharia)
para 10-21 UTC e menos vezes; `ignoreCommand` para não buildar commit só de docs/testes; spend cap. A CLI/API da Vercel não
mostram uso por recurso (token do MCP = 403) e o Chrome do Vitor não está logado na Vercel — só ele vê vercel.com/torg/~/usage.
