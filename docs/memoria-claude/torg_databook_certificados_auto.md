---
name: torg_databook_certificados_auto
description: Certificado que chega DEPOIS da montagem entra sozinho no data book em montagem (cron data-book, §04/§05/§15) — 4 travas; o "Puxar certificados" era retrato do clique
metadata:
  type: project
---

**Por quê (25/09/2026).** Geraldo, OP-102: *"importamos os certificados faltantes, mas ainda falta
puxar"*. O "Puxar certificados" da §04 rodou 5× com "0 novos" (o CMR estava parado de 23 a 25/09);
quando os 11 R chegaram, ninguém clicou de novo. A §02 é montada AO VIVO pelo rastreio e passou a
citar R cujos certificados não estavam no livro. Vitor: *"sim pode vincular"*.

**Como.** `lib/databook-certificados-novos.js` (`vincularCertificadosNovos`), chamado no começo do
cron `/api/cron/data-book` (de hora em hora, 10–21 UTC, seg–sex), antes de terminar as gerações de
volume. Não é cron novo: o Vitor corta disparos por custo da Vercel ([[torg_crons]]). A seleção é a
MESMA do botão (`certificadosDaOp` + `doGrupo`, que a rota `popular-material` passou a usar): os
certificados da OP e os R de outra obra declarados na Conferência de Rastreabilidade.

**As 4 travas (o botão não precisa delas porque é decisão de gente):**
1. Só seção já montada: ANEXADO e com documento. A primeira montagem é de quem monta.
2. Só o que chegou DEPOIS da última montagem da seção (a data é o `createdAt` mais recente dos
   vínculos). Para o R declarado vale a data da DECLARAÇÃO (`TrocaRastreabilidade.updatedAt`).
   ⚠ A remoção só deixa rastro desde 15/09/2026 (357b84c0). O que já existia quando a seção foi
   montada pode ter sido tirado de propósito, e não dá para saber: na OP-085 são 12.
3. Nunca devolve o que alguém tirou (`REMOVER_DOC_SECAO_DATABOOK`), nem pelo documento nem pelo R.
4. Nunca duplica um R do livro, em qualquer seção. O anexo manual "R 2605xx" e a linha do CMR são o
   mesmo certificado: a §05 da OP-089 tem 59 assim.

⚠ Grava com a linha do `DataBookQualidade` travada (`SELECT … FOR UPDATE`) e reconfere
`estaFechado` lá dentro: emitir e iniciar assinaturas esperam a trava. Auditoria
`VINCULAR_CERTIFICADOS_AUTO_DATABOOK` por seção (`userId` nulo; `rs` e `documentoIds` no diff).
⚠ §06 (arame) e a granalha da §15 ficam no botão. São o lote VIGENTE nos dias de solda/jato, e
antes disso o botão traz o de hoje como previsto; automático, entraria lote que a obra talvez nunca use.
⚠ Sem aviso no sino: `NotificacaoTipo` é enum do banco, e valor novo exige ALTER TYPE no build.

**Primeira rodada (simulada e depois REAL, cron das 16:15 UTC de 25/09 — bateu com a simulação):** 76 vínculos em 7 livros:
- OP-112: +22 na §04 (12 deles R declarados em 01 e 08/09);
- OP-084: +15;
- OP-067: +12 (11 tintas na §15 e o tubo TB 1.1/4" declarado em 23/08);
- OP-085: +11 (R declarados em 20/09);
- OP-089 e OP-060: +6 e +5;
- OP-083: +5.

Conferido depois da rodada: nova simulação = 0; em 10 dos 12 livros com §02, todo R citado está no livro.
Sobraram, de propósito:
- OP-105 e OP-107: §04 nunca montada (17 e 16 R citados). O primeiro "Puxar" é da Qualidade.
- ⚠ OP-112: 3 R citados fora do livro (261316, 261319, 261320). São da própria OP e têm PDF, mas foram
  criados em 26/08, antes da montagem de 28/08, e alterados em 22/09: provavelmente só viraram
  candidatos depois. É o limite da regra do `createdAt` — ela não distingue isso de "tirado antes de
  15/09". Fica para o botão, que traz também os outros 16 antigos daquela §04.

De quebra, o `aquecerBanco` do cron foi para dentro do `try` (mesmo achado do Codex de 17/09 em
[[torg_crons]]): fora dele, Neon dormindo derrubava o cron sem registrar falha no monitor.

Relacionados: [[torg_rastreio_corrida]], [[torg_databook_revisao]], [[torg_databook_certificado_movido]]
