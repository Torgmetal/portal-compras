---
name: torg-marca-nao-unica
description: A marca da peça NÃO é única dentro da OP — sub-obras diferentes repetem a marca com perfis diferentes; indexar só por marca dá R errado no carimbo
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-21T02:42:52.045Z
---

**`PecaConjunto.marca` não identifica a peça dentro de uma OP.** A mesma OP tem sub-obras (`opNumero` = T67, T67B, T67CT…) e a marca pode se repetir entre elas com **perfil diferente**:

```
T67CT-P42 · CH16.00X120   (obra T67)
T67CT-P42 · U200X50X3.75  (obra T67CT)
```

Descoberto em 20/08/2026 investigando a §02 do data book: 3 marcas em 4.122 na OP-067. Pouco, mas o estrago é grave — um `Map` por marca faz a última sobrescrever a primeira, e a chapa de 16mm herdava o R do perfil dobrado. O mesmo mapa alimenta o **carimbo do desenho**, ou seja, sai R errado no papel que o soldador tem na mão.

**Como fazer:** `rastreioDaOp()` devolve `porMarca`, `porMarcaPerfil` e `marcasAmbiguas`. Use `rastreioDaPeca(res, marca, perfil)` sempre que tiver o perfil — ele desempata; sem perfil, cai no mapa por marca e marca o resultado com `ambigua: true`. Quem consome: §02 do data book ([[torg_databook_revisao]]), `rastreioDoConjunto` (carimbo), separação do PCP, tela de rastreio.

⚠ Vale para qualquer código novo que indexe peça por marca — LPC, produção, expedição. Se a chave for só a marca, está errada em algum lugar.

Relacionados: [[torg_rastreio_corrida]], [[torg_pecaconjunto_opnumero]], [[torg_listas_le_lpc]]

🚨 **O produzido do Syneco também contava dobrado (24/08/2026).** `/api/pcp/despacho` montava `synecoQtd` por **marca** e dava o total a CADA linha daquela marca. Em `/pcp/producao`, com a coluna "Feito / Qtd", isso virou visível: a OP-089 tinha **132 peças dizendo "2/1", "3/1"** e a soma da coluna dava 3.217 contra 1.843 realmente produzidos.

Agora o produzido é **repartido entre as linhas da mesma marca, por ordem de chegada** (a fábrica produz peça inteira, não fração): enche a 1ª até a `qte` dela, depois a 2ª; a sobra vai para a última, para relançamento aparecer em vez de sumir.
- Medido: OP-089 3.217→**1.843** (= Syneco), OP-103 2.140→**1.114** (= Syneco), OP-067 16.643→15.663 (Syneco 15.671; a diferença é marca do Syneco fora do escopo).
- ⚠️ Corrige junto o **`precisaSyneco`**, que dependia do mesmo número.
- ⚠️ O que sobra com feito > qte é **divergência real** (Syneco produziu mais que a lista) — sai em âmbar, não em verde.
