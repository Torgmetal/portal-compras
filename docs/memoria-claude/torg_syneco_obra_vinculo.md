---
name: torg_syneco_obra_vinculo
description: "O campo `obra` do Syneco é o ÚNICO vínculo com a OP; se não começar com T o registro fica órfão e a OP aparece errada na TV"
metadata:
  type: project
---

`obraParaNumeroOP` (agora em **`lib/syneco-obra.js`**, antes duplicada em 4 arquivos) converte a
obra do SKA no número da OP: `T64` → `064`. **É o único vínculo** entre apontamento/ordem e OP —
sem ele o registro grava com `opId: null`, existe no banco e **não aparece em lugar nenhum**.

🚨 **Caso OP-092 (19/08/2026)**: a obra foi cadastrada no Syneco como **"OP-92"** em vez de "T92".
Como a regra só entendia `^T`, ficaram **1.063 ordens e 618 apontamentos órfãos — 126.290 kg
produzidos**. O portal achava que a OP não tinha produção e calculava o progresso pelo `status`
velho das peças, então ela aparecia em **todas** as raias da TV com 48–77%. Vitor: *"a 92, mesmo
ela tendo passado por todos os setores, ela aparece lá ainda?"* — a suspeita era o contrário do
problema: não era o lançamento do Syneco segurando, era o lançamento **não chegando**.

Regra hoje: `^T(\d+)` **ou** `^OP[-\s_]?(\d+)`. **Estreita de propósito** — varri as 39 obras
órfãs: só a "OP-92" casava com OP do portal. As outras (T36, T50, T68…) são obras antigas nunca
cadastradas, órfãs legítimas; `ALM-T29` e `TORG METAL` não viram OP porque o prefixo tem de estar
no começo.

Depois de religar: 092 fecha Montagem e Solda em 100% e sai dessas raias; segue em
Corte/Acabamento/Jato/Pintura/Expedição por motivo real — 98 avulsas (12.840 kg) com ordem no
Syneco e `produzidoUn = 0`.

🚨 **O número da OP pode ter SUFIXO (24/08/2026)**: `obraParaNumeroOP("T36")` → `"036"`, mas a OP
se chama **`"036-01"`**. Os 4 lugares que montavam o mapa obra→OP buscavam com igualdade exata
(`numero: { in: [...] }`), então a OP existia, ABERTA, vencida, e o portal achava que ela não tinha
produção nenhuma. A resolução agora é por **prefixo** e mora num lugar só: **`mapaObraParaOP`** /
`mapaObraParaOPDeLista` / `opIdDaLinha` em `lib/syneco-obra.js` — não montar mapa obra→OP à mão.

⚠️ **E o corte por data, que é o que impede o estrago**: a obra T36 do Syneco tem **915.767 kg**
(CONTRAVENTAMENTO, VIGA EL. +3000, FRECHAL — um galpão, jul–nov/2025). A OP-036-01 é **outra coisa**:
"Linha de Vida" da Danpower, aberta 19/06/2026, zero peças, ~7 t apontadas de junho pra cá. **O
número base 36 é de dois contratos e o portal só registrou o segundo.** Por isso a data só arbitra
quando o casamento é INEXATO: número igual é a mesma obra (produção antes da abertura é normal,
a OP costuma ser cadastrada depois); sufixo é o caso ambíguo e aí a abertura da OP corta.
`scripts/backfill-op-sufixo.mjs` aplicou a mesma regra no histórico (**rodado 24/08/2026**): 80 ordens e 88 apontamentos (6,9 t) entraram na OP-036-01, 13.941 do galpão ficaram de fora.

⚠️ A afirmação acima de que "T36 é obra antiga nunca cadastrada" **era verdade quando foi escrita** —
deixou de ser em 19/06/2026. As outras (T08, T50, T68…, 37 obras / 5,1 mil t) seguem sem OP.

**Sintoma a reconhecer**: OP que "já passou por tudo" e não sai das raias → conferir
`mesOrdem.opId` antes de mexer no cálculo. Ver [[torg_syneco_apontamento_fonte]],
[[torg_peca_setor_real]] e [[torg_prioridades_setor]].
