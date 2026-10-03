---
name: torg_croqui_cortado_regra_unica
description: "Croqui cortado" é UMA regra só (croquiCortado) — Syneco OU corteConcluidoEm OU baixa de corte; a liberação da montagem contava só o Syneco e recusava conjunto que a lista dizia 2/2 pronto (OP-113)
metadata:
  type: project
---

**"Cortado" tem uma definição só no portal: `croquiCortado` em `lib/prioridades-setor.js`** —
apontamento do Syneco (`qteProduzida ≥ qte`) **ou** `corteConcluidoEm` **ou** baixa de corte
(`baixaSetores.CORTE`). Toda conta de prontidão para a montagem (`calcularProntidao` em
`lib/prontidao-conjunto.js`, `prontidaoDoGantt` em `lib/gantt-prontidao.js`) tem que passar por ela,
e o Prisma tem que trazer os campos que ela lê (`CROQUI_PRONTIDAO_SELECT`).

**Why:** OP-113 (14/09/2026), Vitor: "o erro persiste, não consigo descer os desenhos" e "mostra
como liberado porém está dessa maneira". A lista do PCP dizia **2/2 pronto** para T113A38–A45
(via `croquiCortado`), e o botão de liberar/imprimir recusava os mesmos conjuntos com **"não desceu —
1/2 croquis cortados"**: a rota `/api/producao/pecas/liberar-montagem` usava `calcularProntidao`, que
só olhava `qteProduzida`. Os croquis de U75X40 (T113A-P53 etc.) tinham 0/28 no Syneco e
`corteConcluidoEm` gravado pela baixa — cortados de verdade. Duas regras para a mesma pergunta,
cada uma numa tela, e o PCP travado sem saber em qual acreditar.

**How to apply:**
- Nunca escrever `qteProduzida >= qte` de novo: chamar `croquiCortado(c)`.
- Todo `findMany` que alimenta prontidão usa `select: CROQUI_PRONTIDAO_SELECT` (marca, qte,
  qteProduzida, corteConcluidoEm, baixaSetores). Select só com `qteProduzida` **não dá erro** — só
  volta a contar pelo Syneco e reabre o bug em silêncio.
- Se lista e ação discordarem sobre "pronto", a causa é quase sempre duas contas diferentes — procurar
  o select antes de procurar o dado.
- Relacionado: [[torg_etapa_conjunto_croqui]], [[torg_liberar_montagem_pendente]], [[torg_baixa_etapa_anterior]].

## "Cortado" não é "preparado" — a op. 20 fica de fora (03/10/2026)

Vitor pediu "os croquis que falta preparar da OP-124". **`croquiCortado` só enxerga a op. 10 (Corte)**: o
`qteProduzida` vem de `lib/reconciliar-syneco-corte.js`, que soma só `setor contains "Corte"`. A op. 20
**Preparação** do Syneco (furação, rosca, plasma manual) não entra — croqui "cortado" no portal pode estar com
a preparação aberta. Na OP-124 eram 5 (perfis W460 de 11 m, ~7,4 t) de 51 pendentes.
- Para "o que falta preparar": não cortado (regra acima + conjunto-pai que já subiu) **OU** ordem de
  Preparação com `produzidoUn < planejadoUn` (casando `MesOrdem.item` com a marca, por `opId`).
- ⚠ `PecaConjunto.statusPrep` ("PENDENTE"/"PREPARADO") é **campo morto**: a importação grava "PENDENTE" e nada
  o marca como preparado (só a tela da OP no Comercial o lê). Não usar como fonte.
- ⚠ `normalizeSetorSyneco` devolve "PREPARACAO" para a op. 20 (não a junta ao CORTE), de propósito — ver
  [[torg_programacao_syneco]].

