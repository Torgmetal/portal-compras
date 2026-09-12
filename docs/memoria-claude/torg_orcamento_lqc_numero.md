---
name: torg_orcamento_lqc_numero
description: "Portal Compras Torg — proposta = UM número: orçamento e LQC são a mesma série; planilha do SharePoint entra por cron"
metadata:
  type: project
---

**Uma proposta, um número** (01/09/2026, commit `11604520`). Vitor: *"no workspace tá tendo conflito (…) quando eu insiro uma proposta na planilha do servidor, ele não está atualizando dentro do workspace. E dentro do workspace tem 02 lugares para criar uma nova proposta e os dois não se atualizam"*.

Havia **três fontes** para a mesma coisa: a planilha `RELATÓRIO_PROPOSTAS` do SharePoint, o botão "Novo Orçamento" (`Orcamento`) e o botão "Nova Proposta de Estrutura" (`EstudoFabricacao`, LQC).

⚠️⚠️ **`LQC-nnn-aa` É o número do orçamento `nnn-aa`** — não é série própria. Quando o estudo nascia solto ele pegava "último LQC + 1", ignorando os orçamentos: **LQC-292-26 (Suzuki/Geoprime) e orçamento 292-26 (TESTE) eram propostas diferentes com o mesmo número.** O comentário do código já mandava começar "depois do maior número do ano" — a implementação só olhava os estudos.

⚠️⚠️ **Pular o número só ADIA a colisão.** O estudo solto reserva o 293 e o próximo orçamento também vai querer o 293. Por isso **estudo criado sem orçamento agora CRIA o orçamento junto** — é o que faz as duas telas mostrarem o mesmo registro. Não duplica com a planilha: a importação casa por `numero` e **atualiza** o que existe, nunca cria em cima.

⚠️ **O `PUT` do estudo aceita `orcamentoId` e RENUMERA ao vincular.** Antes só dava para vincular na criação, então estudo órfão ficava órfão para sempre carregando o número errado.

⚠️⚠️ **A importação do SharePoint não tinha cron** — só o botão "Atualizar do SharePoint". Todo o resto do portal que lê fonte externa tem cron; essa não tinha, e quem lança a proposta no Excel não tem por que saber que alguém precisa clicar. Agora `20 6-20 * * 1-5`. É segura em cron porque é idempotente e **célula vazia não sobrescreve** (`semVazios`).

⚠️⚠️ **CRON DA VERCEL DISPARA GET, NÃO POST.** Rota agendada só com `POST` leva **405 e falha em silêncio** — foi o que aconteceu com `/api/engenharia/grd/sincronizar` desde 31/08 ([[torg_grd_engenharia]]): a tela parecia atualizada e o cron nunca rodou. Ao agendar qualquer rota, conferir que ela exporta `GET`. Auditoria de 01/09: os 20 crons do `vercel.json` estão ok. Ver [[torg_crons]].
