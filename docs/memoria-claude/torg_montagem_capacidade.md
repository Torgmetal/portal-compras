---
name: torg_montagem_capacidade
description: "Portal Compras Torg — montagem se mede em PEÇAS por faixa de peso, nunca em kg; repartição por bancada em dias-bancada"
metadata:
  type: project
---

**Montagem NÃO se mede em kg** (01/09/2026, `lib/montagem-capacidade.js`). Vitor: *"vamos ter que prever em peças, pois isso não vai fechar"*.

⚠️⚠️ **A PROVA.** Entre março e agosto/2026 as MESMAS duas bancadas (Jurandir e Adenilson) mantiveram **35,2 → 36,6 peças/dia** enquanto o kg/dia caiu de **4.312 para 1.425** — porque o peso médio da peça caiu de **123 kg para 39 kg**. Quem planeja em tonelada conclui que a fábrica parou quando ela fez exatamente o mesmo trabalho. Foi esse o susto do Vitor ("não consigo fazer nem 100 ton mês").

⚠️ **Mas não é só contar peça:** o ritmo cai com o peso. A régua é **peças por faixa de peso da UNIDADE** (não o total da marca), e o custo de um lote sai em **dias-bancada**:

| faixa | ritmo NORMAL (mediana) | META (p75) | melhor dia |
|---|---|---|---|
| até 25 kg | 36 | 78 | 234 |
| 25–60 kg | 11 | 18 | 115 |
| 60–120 kg | 11 | 17 | 249 |
| 120–300 kg | 8 | 13 | 87 |
| acima de 300 kg | 4 | 7 | 23 |

⚠️ **META = percentil 75, não recorde.** É o ritmo que a bancada atinge 1 dia em cada 4 — já batido dezenas de vezes. O melhor dia é fora da curva e serviria só para desmoralizar a meta.

⚠️⚠️ **O TRABALHO ESTÁ NAS PEÇAS PEQUENAS.** Na OP-112: os conjuntos de até 25 kg são **12% do peso e 52% do trabalho**; os acima de 300 kg são **36% do peso e 18%**. Repartir por tonelada entrega a obra na mão errada. `repartirPorBancada` equilibra **dias-bancada** — na OP-112 dá 1% de desequilíbrio, com peso e contagem propositalmente desiguais por bancada.

**As bancadas:** MONTAGEM 1–5 (nomes do Syneco). Fixos: 1=Edivando, 2=Jurandir, 3=Adenilson, 4=Julio Cesar. Rodrigo circula (6 bancadas em 45 dias) e vale ~0,5 bancada; Edivando vale 1,65 e Jurandir 1,32 medidos contra a própria curva. **Contar cabeça engana.**

⚠️ **O gargalo da montagem costuma ser o CORTE, não a bancada.** OP-112: 47 conjuntos = 13,0 dias-bancada (3,3 dias com 4 bancadas), mas só **4 conjuntos com todos os croquis cortados** = 3,2 horas de trabalho. Sempre medir a prontidão antes de prometer prazo ([[torg_montagem_solda]]).

**Fluxo na tela** (PainelBancadas em `/pcp/montagem`): selecionar → escolher 1–5 bancadas (decisão da Larissa com o encarregado, o portal não sugere) → libera para produção → imprime carimbado com o R dos croquis → ZIP com **uma pasta por bancada** (bancada por fora, impressora por dentro). A bancada entra na CHAVE do agrupamento do lote, senão um PDF fundido teria marcas de duas bancadas. Prioridade (`PecaConjunto.prioridade`, rota `/api/planejamento/liberacao/pecas`) é distribuída primeiro e cai em bancadas diferentes.
