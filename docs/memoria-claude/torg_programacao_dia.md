---
name: torg_programacao_dia
description: "Portal Compras Torg — programação de corte dia a dia: cada peça tem o SEU dia, atraso em vermelho e adiamento que não apaga o atraso"
metadata:
  type: project
---

**Programação de corte por DIA** (`lib/programacao-dia.js`, 01/09/2026, commit `e38361fe`). Vitor: *"quando eu fizer uma programação para mais de um dia precisamos ter a visão separada no pcp para ficar registrado para quais dias foram programados tais peças, e na situação aquilo que não foi executado na data programada ficar em vermelho e deixar de alguma forma levar para a data próxima"*.

Antes a programação gravava só a **janela** (`corteDataMetaInicio/Fim`), igual para todas as peças; quem repartia por dia era o PMP, e só em kg agregado por OP. A peça não sabia de que dia ela era — logo não havia como dizer "esta não foi feita no dia dela".

Campos novos na `PecaConjunto`:
- `corteDiaProgramado` (@db.Date) — o dia da peça. **É ele que se move ao adiar.**
- `corteDiaOriginal` (@db.Date) — o primeiro dia. **Nunca se move.**
- `corteAdiado` (Int) — quantos empurrões.

⚠️⚠️ **Adiar não pode apagar o atraso.** Movendo os dois campos, a peça arrastada a semana inteira apareceria sempre "em dia" — o oposto do que a tela existe para mostrar. O vermelho conta do original. Pela mesma razão **a janela e a meta do PMP não se mexem no adiamento**: são o compromisso, e é dele que o atraso deriva. Peça adiada para além do fim da janela é exatamente isso — fora do prazo.

⚠️⚠️ **A cota do dia é buscada, não é peso÷dias.** Encher o dia até passar da média e só então virar dava **106% de desvio** entre o dia mais leve e o mais pesado num lote real (e um dia inteiro com UMA peça de 3,2 t). `capacidadeMinima` faz busca binária pela menor carga máxima que ainda cabe nos dias (o "split array largest sum") → 58% no mesmo lote. O resto é irredutível: peça que sozinha vale 64% da cota não se divide.

⚠️ **Blocos SEGUIDOS da fila, nunca rodízio** — a fábrica corta na ordem de `corteOrdem`; espalhar peça sim, peça não obrigaria a máquina a trocar de perfil a cada peça.

⚠️ **Lote sem peso cadastrado reparte por quantidade** — com tudo zerado a cota daria 0 e todas as peças caíam no primeiro dia.

⚠️ **O PMP LÊ o dia da peça** (`lib/pmp-corte.js`) em vez de espalhar por conta; senão a grade do PMP e o kanban do PCP mostrariam dias diferentes para a mesma peça e não haveria qual dos dois seguir. O rateio antigo sobrou só para programação sem dia.

**Retrofit:** 2.667 peças de janela de um dia ganharam o dia sem ambiguidade; **5.129 em janela de vários dias ficaram "sem dia definido"** (grupo próprio, no fim da coluna) e voltam a ter dia quando forem reprogramadas — não foram mexidas por trás. Ver [[torg_fila_corte]].
