---
name: torg_cronograma_por_lista_de_fase
description: Cronograma × Syneco — quando a fase (lote) tem lista de peças (PecaLote), o avanço de fabricação é medido por ela, não pela letra da frente; marca repartida entre fases preenche na ordem de entrega; qtdNoConjunto é TOTAL, não por unidade (OP-105, 20/09/2026)
metadata:
  type: project
---

**Quando um lote de expedição tem lista de peças (`PecaLote`), a área do cronograma com o nome dele passa a
ser medida por essa lista** (`lib/cronograma-lotes.js`, ligado em `sincronizarCronogramaSyneco` →
`sync.porLote`; `avancoDaTarefa` casa a área pelo nome normalizado). OP sem lista continua pela letra —
nada muda nas outras obras. Nasceu para a **OP-105** (Vitor, 20/09/2026): o cliente pediu a fabricação
separada por fase, e a letra não separa nem as duas entregas B (Quadros Vasadores × Longarinas) nem as
duas treliças A (TC 4706 × TC 4707), que são **as mesmas marcas repartidas por quantidade** — a 105A14
são 34 na LPC, 17 em cada TAG.

**Regras que ficaram:**
- ⚠⚠ **Marca repartida entre fases: o produzido preenche as fases na ORDEM DE ENTREGA** (`ordem` do
  lote). O apontamento é por marca; ninguém registra de qual TAG é a peça cortada. É uma REGRA, não
  medição direta — quem apresenta ao cliente precisa dizer isso. Combinado com o Vitor em 20/09.
- ⚠⚠ **`ConjuntoCroqui.qtdNoConjunto` é o TOTAL do croqui naquele conjunto, não por unidade** (133 de
  135 croquis da T105A: `croqui.qte` = Σ qtdNoConjunto). Por unidade = qtdNoConjunto ÷ qte do
  conjunto. Tratar como "por unidade" fez a fase de menor ordem engolir 23 t de corte e deixar 3,9 t
  para uma treliça igual.
- Croqui segue o conjunto (entra na proporção do conjunto que está na fase); avulsa entra direto; a
  lista não pode pedir mais do que a LPC tem; produção reapontada não passa de 100%.
- Escopo por setor é o do motor (Vitor 06/08): CORTE = croquis + avulsas; demais = conjuntos.
- Duas áreas com a mesma letra e listas diferentes NÃO disputam a frente (chave `L:<lote>|SETOR`).

**A OP-105 em si** (tarefa de manutenção `op105-fases-por-tag`, `lib/op105-fases-por-tag.js` +
`.json`): a LPC da fase C tinha entrado sob a chave numérica "105" (03/09, antes da regra da fase no nome)
→ rechaveada para T105C; a fase "Treliças TC 4706 - 4707 (A)" vira DUAS ("TC 4706 (A)" e "TC 4707 (A)"),
com áreas e tarefas do cronograma levadas junto (as "… - TC4707" para a nova área); as listas vêm da
"LISTA DE EQUIVALÊNCIA TAG TORG_TMSA" (Diego, 11/09) para A e B (TC 4708 separada pela descrição:
QUADRO DO VAZADOR × LONGARINA) e da LPC T105C para C. **A letra continua A nas duas treliças** — o Tekla
já saiu assim ("como já fizemos isso no Tekla vamos ter que deixar as treliças como A"); nas próximas
obras cada fase nasce como frente própria. **A T105B- LPC_R00.xlsx é importada pela tela** (Engenharia ›
Listas, o nome leva a fase) — nunca entrou como LPC; sem ela a fase B fica manual.

Simulado com os dados reais em 20/09: TC 4706 corte 98,4% / montagem 41,8% / solda 2,2%; TC 4707 corte
98,3% / montagem 6,8%; fase C corte 15,9%. B sem escopo até a importação.

**Why:** o avanço que vai ao cliente tem de ser o apontamento, e o apontamento é por marca — só uma lista
diz de que fase é a marca. **How to apply:** ver [[torg_cronograma_syneco]] (o motor por letra),
[[torg_lpc_chave_fase]] (a chave é a fase) e [[torg_marca_nao_unica]].
