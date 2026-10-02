---
name: torg-pintura-micragem-minima
description: "Portal Compras Torg — a micragem seca mínima é do RELATÓRIO (editável nas duas telas); o PLP dá o total da obra, que não serve para toda peça nem para a demão de fundo"
metadata:
  type: project
---

**22/09/2026.** Vitor: *"preciso que deixe o campo de micragem seca aberto para ajustar, pois temos
espessuras diferentes para cada relatórios às vezes e hoje um deles está dando como reprovado."*

`resultados.espessuraMinima` nasce do PLP — e o que o PLP dá é **`espessuraDoSistema(plp)`, a SOMA
das demãos, um número por obra** (`lib/plp.js`). No portal de campo ele era **só leitura** (vinha no
`__espec`, que o envio descarta), então a peça de outro esquema media certo e a tela acendia
vermelho contra um mínimo que não era dela.

Agora é **editável nas duas telas** ([[torg_pintura_duas_telas]]) e entrou na **lista fechada** de
`PATCH /api/campo/relatorios/[id]` — campo novo que o celular grava precisa estar lá, senão salva
vazio. Ajustar aqui **não mexe no PLP**: o plano da obra é outro documento.

⚠⚠ **O QUE CONTINUA ERRADO, E VITOR PRECISA DECIDIR: a leitura de CADA demão é julgada contra o
mínimo do SISTEMA.** Medido no RIP-102-002 — 1ª demão (fundo): 81,2 / 110 / 76,5 / 79,8 / 86,3 µm;
2ª demão: 231 / 224 / 232 / 255 / 269 µm; mínimo do PLP: 220. O medidor lê a **película total sobre
o aço**, então a 2ª demão passa e **o fundo acende vermelho sempre**. Baixar o campo para 80 µm
apaga o vermelho mas faz o PDF declarar ao cliente um sistema de 80 µm. O conserto de verdade é um
**mínimo por demão** (o PLP tem `demaos[].espessuraMin`) — não implementado porque exige confirmar
se o valor do PLP é por demão ou acumulado.

**02/10/2026 (`524205ee`): o vermelho falso do fundo acabou no celular.** Como a leitura por demão é
acumulada, o mínimo do sistema só é comparado na demão que FECHA a película (a última prevista no
relatório ou a última medida); as anteriores mostram onde o mínimo é conferido, sem vermelho.
⚠ Continua pendente o **mínimo por demão** do PLP (`demaos[].espessuraMin`): relatório só de fundo que
nasce com as demãos 2 e 3 pré-preenchidas pela memória da OP não acende o fundo. Decisão do Vitor.
