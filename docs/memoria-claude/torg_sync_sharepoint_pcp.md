---
name: torg_sync_sharepoint_pcp
description: Cron sync-sharepoint (PCP) — o nome do arquivo mensal ganha o mês no fim, e a aba EAP de OUTRO mês é recusada em vez de gravar calada; CMR no Graph agora retenta 504
metadata:
  type: project
---

**O cron `sync-sharepoint` ficou 17 dias fora do ar e ninguém soube** (achado em 17/09/2026, ao
verificar o diagnóstico do Matheus sobre o Neon). Último sucesso em 31/08. Duas causas empilhadas:

1. **O nome do arquivo ganhou o mês no fim.** O PCP passou a chamar a planilha de
   `1. Planilha de Gestão Setembro.xlsx` (agosto foi renomeado junto) e o código procurava o nome
   exato `1. Planilha de Gestão.xlsx`. Agora, se os caminhos exatos falham, `downloadPlanilhaProducao`
   lista a pasta do mês e usa `escolherPlanilhaDaPasta` (pura, testada): casa por **prefixo**
   normalizado, então mês no fim, `REV00` ou espaço a mais deixam de quebrar. Empate fica com o
   `lastModifiedDateTime` mais novo.
2. **⚠⚠ A ABA EAP ESTÁ CONGELADA EM JUNHO, E O PARSER ACEITAVA CALADO.** A planilha de setembro tem
   uma única aba EAP: **"EAP JUNHO"**, com realizado zerado. `findEapSheetName` caía na primeira aba
   `EAP*` quando não achava a do mês — então consertar só o item 1 faria o cron gravar junho todo
   dia, para sempre. Agora aba que anuncia OUTRO mês é **recusada**, com o erro nomeando as que
   existem. Aba genérica (só "EAP", sem mês) continua servindo para qualquer mês.
   **Pendência do PCP: criar/renomear a aba EAP do mês vigente** — enquanto não fizerem, o cron
   falha de propósito, e a mensagem no heartbeat diz exatamente isso.
   O resumo do cron passou a dizer **qual aba foi lida**, com "⚠ NÃO é a do mês" quando for o caso.

**`cmr-reconciliar`: um 504 do Graph derrubava tudo.** O job ficou 60 h sem sucesso com
`usedRange HTTP 504` — a sessão de workbook na planilha CMR do ano (~16 MB) estoura o gateway de vez
em quando. Era `fetch` cru, sem retry. `graphGet` (`lib/cmr-sharepoint.js`) retenta 408/429/500/502/
503/504 com backoff e respeita `Retry-After`. ⚠ **Só LEITURA é retentada**: um 504 num POST/PATCH
pode ter gravado do outro lado, e repetir duplicaria a linha no Excel.

⚠ **A lição das duas é a mesma**: falha que não se anuncia custa semanas. Ver
[[torg_crons]] (heartbeat/monitor) e [[torg_nao_declarar_furo]].
