---
name: torg-trava-entre-execucoes
description: Portal Compras Torg — pg_advisory_lock NÃO serve para serializar cron com o pooler; o padrão é arrendamento em linha
metadata:
  node_type: memory
  type: reference
---

⚠⚠ **`pg_try_advisory_lock` NÃO TRANCA NADA NESTE PROJETO, E EU PROVEI ISSO DEPOIS DE ESCREVER**
(17/09/2026). Trava consultiva do Postgres é de **SESSÃO**. Tanto o pooler do Neon quanto o pool do
próprio Prisma podem atender dois `$queryRaw` em **conexões diferentes**: a trava sai numa conexão e
a conferência acontece em outra, então as duas execuções passam.

**Medido**: duas chamadas simultâneas ao cron `/api/cron/omie-encerrados` com a trava consultiva
rodaram **as duas, inteiras**. Uma trava que não tranca é pior que nenhuma, porque parece segura.

### O padrão que funciona: arrendamento (lease) numa linha
`lib/cron-trava.js` → `comTravaDeCron(prisma, job, fn, { ttlMs })`, gravando em
`CronHeartbeat.travadoAte` (coluna criada por `scripts/ensure-cron-trava.mjs`):

```sql
INSERT INTO "CronHeartbeat" ("job","lastRunAt","ok","travadoAte","updatedAt")
VALUES ($job, now(), true, $ate, now())
ON CONFLICT ("job") DO UPDATE SET "travadoAte" = EXCLUDED."travadoAte", "updatedAt" = now()
  WHERE "CronHeartbeat"."travadoAte" IS NULL OR "CronHeartbeat"."travadoAte" < now()
RETURNING "job"
```
Uma instrução, atômica no Postgres, **indiferente a qual conexão a executou**. Sem linha retornada,
a vez já é de outra execução.

- ⚠ **Desiste em vez de esperar na fila**: quem chegou depois já colheu o retrato dele (do Omie, do
  SharePoint) e esperar só o faria gravar um retrato velho mais tarde.
- ⚠⚠ **O prazo (TTL) existe porque processo serverless morre sem aviso.** Cortada no `maxDuration`,
  a função não roda o `finally` — sem prazo, a vez ficaria reservada para sempre e o cron nunca mais
  rodaria.
- ⚠ **Pular aparece no heartbeat.** Uma execução que nunca roda por estar sempre pulando seria
  silêncio com cara de sucesso.

### Quando a trava de TRANSAÇÃO serve (e aqui não servia)
`comTravaDaObra` (`lib/conferencia-peca.js`) usa `pg_advisory_xact_lock` dentro de
`prisma.$transaction` e **funciona** — escopo de transação prende UMA conexão até o fim. Serve
porque o trabalho no meio é BANCO. Não serve para o cron de encerramento, cujo miolo são ~8 chamadas
de rede ao Omie: prenderia uma conexão do pool por minutos.

**Regra**: trabalho no meio é banco ⇒ `pg_advisory_xact_lock` em transação. Trabalho no meio é rede
⇒ arrendamento em linha. Trava consultiva de sessão ⇒ nunca, com pooler.
