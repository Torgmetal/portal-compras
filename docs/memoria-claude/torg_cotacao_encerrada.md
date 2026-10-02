---
name: torg_cotacao_encerrada
description: RM em Pedido gerado encerra as cotações sem resposta (status ENCERRADA) e avisa o fornecedor por e-mail neutro
metadata:
  type: project
---

Matheus (02/10/2026): RM que vira PEDIDO_GERADO → cotações PENDENTE/VENCIDA dela viram **ENCERRADA**
(`lib/cotacao-encerramento.js`), o link público mostra "Esta cotação foi encerrada" e as rotas
públicas/internas recusam com 409. E-mail **neutro** (não diz que outro ganhou), cc/replyTo compras@.

- Status próprio, não CANCELADA: a página de cancelada diz "o comprador cancelou".
- Cotação consolidada só encerra quando TODAS as RMs dos itens estão PEDIDO_GERADO/CANCELADA.
- Grava ENCERRADA (condicionado ao status lido) ANTES do e-mail; quem perde a corrida não manda.
- Nunca lança: roda depois do pedido existir no Omie.
- Ganchos: `reavaliarStatusRM` (gerar-pedidos RM/OP), gerar-pedido-direto, fechar-como-pedido,
  atender-estoque, pedido-fd-avulso, vincular-rm. Escritor novo de PEDIDO_GERADO precisa chamar.
- Enum: `ALTER TYPE "CotacaoStatus" ADD VALUE 'ENCERRADA'` em scripts/ensure-mes-tables.mjs.
- Carga de 02/10/2026: 236 antigas (maio–set, 103 RMs) encerradas **sem e-mail**, por decisão dele.
