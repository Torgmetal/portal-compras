---
name: torg_inspetor_produto_final_fase
description: Tela do inspetor (relatórios de inspeção, PC e celular) lista PRODUTO FINAL por FASE — sem croqui nem acessório; croqui só no dimensional de peças avulsas; fase vem da frente da LPC (T89A) ou da letra da marca; API /api/campo/pecas devolve `fase`/`fases`
metadata:
  type: project
---

**Na escolha de peça do relatório de inspeção, o inspetor vê conjunto e peça avulsa, separados por
fase — nunca croqui nem acessório.** Vitor (14/09/2026): "está aparecendo peças de croqui no
relatório de pintura e também acessórios, isso não pode aparecer na tela do inspetor, assim como
precisamos que separe por fases; no caso da 89 temos A e C por hora, logo teremos a B, porém a
engenharia não liberou; isso deve ter em todos os tipos de relatórios".

**Why:** o celular pedia `todas=1` e a API devolvia TUDO de `PecaConjunto` — 287 croquis
(T89A-P24…), 34 parafusos da LE ("T89-AC1", que `marcaEhAC` não pegava por causa do hífen) e 18
grades compradas, misturados aos 231 produtos finais da OP-089, sem dizer de qual frente cada um
era. Pintura, solda, US e LP são inspeções do produto montado; croqui só se mede no dimensional
de peças avulsas (é o que saiu do corte).

**How to apply:**
- `GET /api/campo/pecas`: sem parâmetro = só `tipoPeca CONJUNTO` (dimensional de conjunto, um por
  relatório); `todas=1` = conjunto + avulsa (`tipoPeca` CONJUNTO ou NULL — `not: "CROQUI"` deixaria
  o NULL de fora no SQL); `croquis=1` (só com todas) = também croqui, usado pelo dimensional de
  avulsas nas duas telas. Acessório (`marcaEhAC` ou `ehItemComprado`) sai sempre — mas só se for
  acessório em TODA linha da marca (a LE traz conjunto sem perfil; a linha da LPC desempata).
- Cada peça sai com `fase` e a resposta traz `fases` da OP inteira; `fase=A` filtra ANTES do
  corte de 60. Ordem: fase, depois conjunto/avulsa antes de croqui, depois marca numérica.
- `lib/fase-peca.js` (`faseDaPeca`): a frente da LPC manda (`opNumero` "T89C" → C); sem letra
  ("097", "T92", "089" da LE) vale a letra da marca (`faseDaMarca` de lib/carga/classificar).
  "?" = "Sem fase" (numeração do cliente, OP-107/OP-085) — grupo próprio no fim, não some.
- Quantidade por marca: LE manda; só sem LE soma a LPC (somar as duas dava "2 peças" para todo
  conjunto que está nas duas listas). Marca repetida entre frentes da LPC (OP-067) continua somando.
- Chips `components/qualidade/FiltroFase.jsx` nas duas telas (InspecoesClient e app/campo/
  NovoRelatorio): com ≥2 fases a lista abre na PRIMEIRA (relatório nasce de uma fase só) e
  "Todas as fases" mostra cabeçalhos por fase; com uma fase o filtro não aparece. A fase B da
  OP-089 aparece sozinha quando a engenharia subir a LPC dela.
- Relacionado: [[torg_pintura_duas_telas]], [[torg_marca_conjunto_croqui]], [[torg_itens_comprados]],
  [[torg_pecaconjunto_opnumero]], [[torg_listas_le_lpc]].
