---
name: torg_sync_sharepoint_pcp
description: O cron sync-sharepoint (planilha de gestão do PCP) foi REMOVIDO em 26/09/2026 — ninguém olhava a tela; fica aqui por que ele existia, o que morreu junto e o que NÃO morreu (a tela PMP e o retry do Graph no CMR)
metadata:
  type: project
---

**Removido em 26/09/2026.** Vitor: *"esse que está abandonado que seria a produção semanal pode
finalizar, não estamos nem olhando para essa parte mais"*.

O cron `0 8 * * *` → `/api/producao/sync-sharepoint` lia a planilha de gestão mensal do PCP no
SharePoint, extraía a aba EAP e gravava `ProducaoSemanal` com `fonte: "SHAREPOINT"`. Saiu inteiro:
a rota (e a `/historico`), `lib/parse-pcp-eap.js`, a entrada no `vercel.json`, o job no
`lib/cron-monitor.js`, o caminho na allowlist do `middleware.js` e os ajudantes que só ele usava em
`lib/sharepoint.js` (`downloadPlanilhaProducao`, `getPlanilhaProducaoCandidates`,
`escolherPlanilhaDaPasta`, `getMesAtualFolder`, `getMesNomePt`).

⚠⚠ **`/producao/planejamento-semanal` NÃO é esta tela, e continua no ar.** O nome engana: ela
renderiza o `PmpClient` (o PMP, que vem do banco do portal). Cheguei a incluí-la na remoção antes
de abrir o arquivo. Nenhuma tela chamava `/api/producao/semanal` — as 308 linhas de
`ProducaoSemanal` com `fonte: "SHAREPOINT"` ficaram no banco, inertes, e a tabela segue de pé.

⚠ **O que morreu junto e vale saber, se um dia isto voltar** — as duas armadilhas medidas em
17/09/2026, que custaram 17 dias de cron parado em silêncio:
1. **O nome do arquivo ganha o mês no fim** (`1. Planilha de Gestão Setembro.xlsx`). A saída era
   casar por PREFIXO normalizado dentro da pasta do mês, não cravar o nome.
2. **A aba EAP estava congelada em "EAP JUNHO"**, com realizado zerado, e o parser caía calado na
   primeira aba `EAP*`. Consertar só o item 1 faria o cron gravar junho todo dia, para sempre. A
   correção foi **recusar** aba que anuncia outro mês. O PCP nunca criou a aba do mês vigente — em
   26/09 o dado estava 87 dias velho, que é o que tornou a remoção óbvia.

⚠ **O retry do Graph NÃO saiu.** `graphGet` em `lib/cmr-sharepoint.js` (retenta 408/429/500/502/
503/504 com backoff, respeitando `Retry-After`) é do CMR e continua valendo. ⚠ **Só LEITURA é
retentada**: um 504 num POST/PATCH pode ter gravado do outro lado, e repetir duplicaria a linha.

⚠ **A lição que fica**: falha que não se anuncia custa semanas — mas cron que ninguém lê custa
manutenção para sempre. Ver [[torg_crons]] (heartbeat/monitor) e [[torg_nao_declarar_furo]].
