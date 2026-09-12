---
name: torg_r_carimbo_desenho
description: Um R por peça, o MESMO no croqui e no conjunto; conjunto leva o R de cada posição na tabela + o R do consumível de solda
metadata:
  type: project
---

Regra do Vitor (26/08/2026), sobre o carimbo de rastreabilidade:

- **UM R por peça, nunca dois.** A peça é cortada de UMA chapa/barra. Quando o
  FIFO tinha várias candidatas o carimbo saía `R a / R b` — isso não é ambiguidade
  do estoque, é o portal não escolhendo. Quem escolhe é a **data do corte**, e o
  motor de rastreio já ordena por ela: a primeira `usada` é o R.
- **O MESMO número no croqui e no conjunto.** `rCanonico()` em
  `lib/carimbo-desenho.js` serve os dois — "praticamente é só copiar". Nunca criar
  uma segunda conta para isso.
- **O conjunto leva o R de cada posição** na coluna DESCRIÇÃO da tabela de
  posições (`acharTabelaPosicoes`), alinhado à direita no espaço livre —
  e **o R do consumível de solda** no campo CONSUMÍVEL do próprio desenho.
- **No Data Book os dois PDFs convivem**, emitidos em dias diferentes: se o R
  mudar entre um e outro (amarração nova, material novo, FIFO), eles discordam.
  `lib/conferir-r.js` compara na emissão do conjunto e avisa — não bloqueia.

**Why:** dois R para o mesmo material em dois papéis do mesmo lote é o pior defeito
possível num documento de rastreabilidade — pior que campo em branco, porque
parece certo.

**How to apply:** qualquer coisa que escreva R em desenho passa por `rCanonico`.
Isso revê a decisão de 19/08 ("não colocar rastreabilidade dos croquis no
conjunto") — aquela objeção era à TARJA, não à tabela. Ver [[torg_databook_revisao]],
[[torg_desenho_rastreado]] e [[torg_rastreio_corrida]].
