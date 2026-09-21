# A previsão de entrega tem QUATRO fontes, e três delas viviam escondidas

**16/09/2026.** Matheus, na tela Prazos das RMs: *"tem algumas em cinza SEM PRAZO, mas tem prazo que
o fornecedor colocou e foi para o pedido do Omie, porque estão sem?"* — estava certo nas duas vezes.

## A ordem que vale (`previsaoAtual`, `lib/acompanhamento-pedido.js`)

Quem sabe mais manda:

1. **A última remarcação** (`PrazoHistorico.prazoNovo`) — alguém mexeu de propósito.
2. **`PedidoOmie.prazoEntregaPrevisto`** — a data do pedido.
3. **`CotacaoItem.prazoEntrega`** dos itens **vencedores**, o **mais tardio** — o pedido só fecha
   quando o último item chega.
4. **O texto do prazo** (`Cotacao.observacao`, "18 dias úteis") contado a partir de
   **`PedidoOmie.createdAt`**, via `lib/prazo-entrega.js`.

## Os dois defeitos que isso corrigiu

⚠⚠ **A fonte 3 existia SÓ na tela de Entregas.** `app/api/compras/entregas/route.js` já tinha esse
fallback; a tela de Prazos não. Resultado: **as duas telas discordavam sobre o mesmo pedido**. O caso
é o 2077 (Pizzinatto): 15/10/2026 gravado nos 19 itens vencedores e `prazoEntregaPrevisto` **nulo** —
Entregas mostrava a data, Prazos dizia "sem prazo". Agora a regra mora em `previsaoAtual` e as duas
bebem da mesma fonte.

⚠⚠ **A fonte 4 já era CALCULADA e ENVIADA AO OMIE, e simplesmente não era guardada.** As duas rotas
`gerar-pedidos` chamam `previsaoEntregaDDMMYYYY(cotacao.observacao)` e mandam o resultado no
`dDtPrevisao` do pedido — mas nunca gravavam `prazoEntregaPrevisto`. **O portal escolhia a data,
contava para o Omie e esquecia**, e depois exibia "Sem prazo" sobre uma previsão que ele mesmo tinha
definido. Nove pedidos do acervo estavam assim. Agora as rotas gravam na criação, e a derivação da
fonte 4 cobre os antigos.

Medido na tela depois: **"Sem prazo" saiu de 4 RMs para 0.**

⚠ **A base da conta é a CRIAÇÃO do pedido, não hoje.** É a mesma base usada para calcular o que foi
ao Omie. Com "hoje", a previsão andaria para a frente todo dia e nenhum pedido ficaria atrasado.

⚠ **Data digitada ganha de data derivada** — por isso a fonte 4 é a última. E texto sem número
("a combinar") não vira data nenhuma: adivinhar prazo é pior que admitir que não há.

## Como o portal decide que o material CHEGOU

Existe um evento `MATERIAL_RECEBIDO` na linha do tempo, de uma destas origens:

1. **Alguém lançou à mão** a etapa na régua da RM.
2. **Senão**, o cron do Omie: `statusEntrega` em ENTREGUE/ATRASADO/RECEBIDO **e** data em
   `recebidoEm` ou `dataEntregaReal`. Precisa dos dois.

⚠ Na prática **quem carimba é o Omie**: 44 ENTREGUE e 19 PARCIAL vindos de lá, **zero** lançamentos
manuais (medido em 16/09/2026). ⚠ **PARCIAL não conta como chegou.** ⚠ **"Chegou" ganha de previsão
vencida** — entregue com 14 dias de atraso é caso encerrado, não pendência, e vai para o fim da lista.

## Pendente: pedido de compra ENCERRADO no Omie

⚠⚠ **`verificarRecebimentoPedido` só olha `cEtapa` (recebido = 50/60/70) e as quantidades.** Do lado
dos pedidos de **venda** o portal já aprendeu que "encerrado" é uma **bandeira própria**
(`cabecalho.encerrado === "S"`, com `enc_motivo`) e que **a etapa continua "10" mesmo encerrada** —
ver `lib/omie-pedidos-abertos.js`. No lado de **compra** isso não foi tratado.

Conferido na API em 16/09/2026 (uma consulta, sem rajada): o `cabecalho_consulta` do
`ConsultarPedCompra` devolve **apenas** `cEtapa`, sem nenhum campo de encerramento. As chaves são:
`cCodCateg, cCodIntFor, cCodIntPed, cCodParc, cContato, cContrato, cEtapa, cIncHora, cNumPedido,
cNumero, cObs, cObsInt, dDtPrevisao, dIncData, nCodCC, nCodCompr, nCodFor, nCodIntCC, nCodPed,
nCodProj, nQtdeParc`.

**Não resolvido, e de propósito:** falta saber qual `cEtapa` o Omie usa para pedido de compra
encerrado. Chutar é perigoso — essa é a regra que decide "chegou", e um código errado marcaria como
recebido material que ninguém recebeu. O caminho barato é Matheus encerrar (ou apontar) UM pedido de
compra e consultar só ele.
