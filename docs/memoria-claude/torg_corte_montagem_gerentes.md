---
name: torg_corte_montagem_gerentes
description: Produção › Corte e montagem — consulta no celular dos gerentes; mesma rota e mesma regra de situação do PCP (lib/status-setor)
metadata:
  type: project
---

Matheus (03/10/2026): tela de consulta para os gerentes de Corte e Montagem, no celular de pé
(`app/producao/corte-montagem`). Obra → setor → cartões com situação, feito/qtd e croquis
("0/6 · faltam 6", toque abre quais faltam com "faltam X de Y").

- Dados: `/api/pcp/despacho?opId&setor` (o mesmo do PCP) — nunca uma segunda conta.
- `lib/status-setor.js` (feitoDaPeca, situacaoDaPeca, SIT, resumoDoSetor) é a regra ÚNICA; o
  ProducaoClient do PCP importa dali. Mudou o critério, muda nas duas telas.
- Só consulta: liberar/baixar/programar continuam no PCP.
- Todos os módulos já viram gaveta no celular (`app/globals.css`, max-width 1023px) — não precisa
  layout próprio.
- PCP › Produção: abaixo do `md` a tabela tem min-w 900 e rola só ela; acima, segue a regra do Vitor
  (sem rolagem lateral).
