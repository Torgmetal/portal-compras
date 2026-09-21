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
ON CONFLICT ("job") DO UPDATE SET "travadoAte" = now() + $seg * interval '1 second', "updatedAt" = now()
  WHERE "CronHeartbeat"."travadoAte" IS NULL OR "CronHeartbeat"."travadoAte" < now()
RETURNING "travadoAte"
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

### ⚠⚠ O PRAZO SE CALCULA NO SQL, NUNCA EM JS — SÃO DOIS RELÓGIOS (17/09/2026)
A primeira versão mandava `new Date(Date.now() + ttl)` como parâmetro, e o Postgres o comparava com
o `now()` **dele**. **Medido na máquina de dev (WSL): 241 segundos à frente do Neon.**

Dois efeitos, e o segundo é o que aparece:
- a vez reservada por **2 minutos** virava uma vez de **6 minutos** para o banco (o app está à
  frente, então o prazo que ele escreve fica mais longe do `now()` do banco, não mais perto);
- o app calculava "faltam N segundos" subtraindo do **próprio** relógio e dizia **1 segundo** onde
  o banco ainda guardava **137** — mandando a pessoa clicar de novo numa vez que não estava livre.

⚠ Cheguei a escrever que a vez "nascia vencida". É o contrário, e o Codex pegou: app adiantado
produz prazo mais distante. Nenhuma das duas versões funciona — o ponto é que **são dois
relógios**. Agora o prazo é `now() + $segundos * interval '1 second'` e quanto falta também sai do
banco (`EXTRACT(EPOCH FROM ("travadoAte" - now()))`), nunca de uma subtração feita no app.

Na Vercel os relógios andam juntos — mas trava que depende disso é trava que falha no dia em que
não andarem, e falha em silêncio.

⚠ `Number(null)` é **0**, e zero em "faltam N segundos" significa "pode clicar de novo agora" —
o contrário do que uma leitura que falhou autoriza a dizer. Sem número é `null`.

### A MESMA LINHA SERVE PARA DUAS COISAS: trava e intervalo mínimo
`reservarVez` + `soltarVez` no `finally` = **trava** (ninguém roda junto). `reservarVez` **sem
soltar** = **intervalo mínimo** — é assim que o botão "Sincronizar" da tela Prazos das RMs impede
que dez cliques virem dez varreduras no Omie (`INTERVALO_MANUAL_MS`, 2 min).

⚠⚠ **A trava impede simultaneidade, NÃO repetição** (achado do Codex): terminada uma varredura, o
clique seguinte passaria na hora.

⚠⚠ **O intervalo conta do FIM da rodada, não do início** (`renovarVez`). Medido: a rodada do botão
levou **111 s**; reservado no início, sobravam 10 s de espera — o intervalo sumia justamente nas
rodadas longas, que são as caras.

⚠ **Nada rodou porque as duas etapas estavam ocupadas? Devolve a vez.** Nenhuma chamada ao Omie foi
gasta; cobrar 2 minutos por um clique que não fez nada é punir quem clicou.

### ⚠⚠ A RESERVA NÃO TEM DONO — por isso ela precisa durar MAIS que a rodada
A linha não guarda quem a reservou: quem a encontra vencida assume, e `renovarVez`/`soltarVez`
mexem nela sem perguntar de quem é. Com reserva de 2 min e orçamento de 2min30 existia este
roteiro (achado do Codex): **A reserva em t=0, vence em t=120, B assume, A termina em t=140 e
renova a reserva de B.**

A invariante que segura tudo: **TTL da reserva > `maxDuration` da rota**. A Vercel mata a função
antes de a vez vencer, então dois donos nunca coexistem. No botão manual são `RESERVA_DURANTE_MS`
(200 s) para a janela de execução e `INTERVALO_MANUAL_MS` (120 s) aplicados no fim. Se algum dia um
executor puder passar do TTL, a saída é uma coluna de token, não um TTL maior no chute.

### Quando a trava de TRANSAÇÃO serve (e aqui não servia)
`comTravaDaObra` (`lib/conferencia-peca.js`) usa `pg_advisory_xact_lock` dentro de
`prisma.$transaction` e **funciona** — escopo de transação prende UMA conexão até o fim. Serve
porque o trabalho no meio é BANCO. Não serve para o cron de encerramento, cujo miolo são ~8 chamadas
de rede ao Omie: prenderia uma conexão do pool por minutos.

**Regra**: trabalho no meio é banco ⇒ `pg_advisory_xact_lock` em transação. Trabalho no meio é rede
⇒ arrendamento em linha. Trava consultiva de sessão ⇒ nunca, com pooler.
