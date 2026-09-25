# Status da RM depois de gerar pedido / atender pelo estoque

`lib/rm-status.js` (`statusAposFinalizar`, `reavaliarStatusRM`). Finalizados: PEDIDO_GERADO,
CANCELADO, ATENDIDO_ESTOQUE.

- todos finalizados → PEDIDO_GERADO; nenhum → não mexe;
- sobrou algum PENDENTE/EM_COTACAO (ou status desconhecido) → **ABERTA** (Vitor 30/08: o item que o
  fornecedor não tem fica EM_COTACAO — `cotacao/submeter` só marca COTADO com preço);
- sobraram SÓ COTADO → **COTADA** ("pronta pra pedido").

⚠⚠ Caso real (25/09/2026): T105-009 (4 COTADO + 1 atendido pelo estoque) caiu para ABERTA quando o
pedido de OUTRA RM (T105-010) foi gerado pelo painel da OP: a rota da OP recalculava `op.rms`
INTEIRO. Agora só as RMs com item gravado como pedido naquela chamada. O update é condicionado ao
status lido. ⚠ O `reverter` do pedido usa outra prioridade (qualquer COTADO → COTADA) de propósito.
