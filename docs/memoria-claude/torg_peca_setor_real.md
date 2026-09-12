---
name: torg_peca_setor_real
description: "Portal Compras — setor REAL da peça vem do MesOrdem ao vivo, NÃO do PecaConjunto.status (que só auto-avança até CORTE); padrão da tela Status da Obra"
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

**`PecaConjunto.status` NÃO é confiável como estágio de produção pós-corte.** O status só é auto-avançado `PENDENTE→CORTE` pela importação do Syneco (`app/api/producao/importar-syneco-corte` + `lib/reconciliar-syneco-corte.js`). Pós-corte (MONTAGEM→SOLDA→ACABAMENTO→JATO→PINTURA) só muda por ação **manual** (kanban `mover-setor`, edição, ou recebimento de terceirizado) — na prática fica muito atrasado. Filtrar por `status==="PINTURA"` **subreporta drasticamente**.

**O setor REAL da peça deriva do `MesOrdem` ao vivo** (apontamento cumulativo do Syneco):
```
groupBy [opId, item, setor] where produzidoUn > 0 e setor in [Corte,Montagem,Solda,Acabamento,Jato,Pintura]
→ por marca, pega o setor MAIS AVANÇADO (ordem da cadeia)
```
- `MesOrdem.item` = **marca** da PecaConjunto; match por **opId + item normalizado** (`trim().toUpperCase()`).
- Setores no Syneco são **title-case** ("Pintura"); no portal são UPPER ("PINTURA"). Mapear `{Corte:"CORTE",...}`.
- **EXPEDIDO** vem do `status` do portal (fato pós-pintura, não do Syneco). Precedência: EXPEDIDO > setor-Syneco > status-armazenado (fallback).
- **Padrão canônico:** `app/api/planejamento/status-obra/[id]/route.js` (`synPorMarca`/`local`). Reusado na **Expedição Semanal** (13/07/2026): "itens a expedir" = só peças apontadas como PINTADAS (setor real PINTURA) ou EXPEDIDO; distribuição por etapa idem.
- Prova real (13/07/2026, 22 OPs ativas): por `status` davam **13** peças "prontas p/ expedir"; pelo Syneco real **2333** (ex.: OP 067 status=0 × syneco=935 de 1614; OP 060 51/51).

**`PecaConjunto.qteProduzida` tem o MESMO defeito, e é o campo mais fácil de usar errado** (20 arquivos o leem). Ele **só é escrito pelo import de corte** (`importar-syneco-corte` + `reconciliar-syneco-corte`): significa "quanto o CORTE cortou", nunca "quanto desse conjunto já saiu". Em montagem/solda devolve **0 para sempre**.
- Prova (05/09/2026, OP-097): T97A28, T97A347, T97A348, T97A47 e T97A94 estavam "Finalizado Total" em Montagem E Solda no Syneco, todas com `qteProduzida=0`. O Gantt do PCP mostrava "0 de 15 feitas".
- **Quantidade produzida por setor** = `MesOrdem.produzidoUn` agrupado por `(opId, item, setor)`, **somando** (a mesma marca pode estar em 2 ordens — 2 casos em 22.628) e limitando por `qte`.
- ⚠️ **O estrago não é só visual.** O `qteProduzida` também alimentava `qtePendente`, que é o que as libs de capacidade cobram como custo — então a **ocupação de montagem/solda vinha superestimada**: conjunto já montado contava como trabalho a fazer. Corrigido em `lib/gantt-pcp.js` (05/09/2026); OP-097 saiu de 0 para 127 de 242 feitas.
- Operação → setor no Syneco: `10 Corte · 20 Preparação · 30 Montagem · 40 Solda · 50 Acabamento · 60 Jato · 70 Pintura`.

⚠️ Contraste com [[torg_syneco_apontamento_fonte]]: pra **soma de produção DIÁRIA** use `mesApontamento` por `dataInicio` (NÃO `mesOrdem`, que é cumulativo). Aqui é o oposto — pra **localizar a peça na fábrica** (cumulativo), `mesOrdem produzidoUn>0` é o certo. Não confundir os dois usos.

Ver [[torg_pecaconjunto_opnumero]] (marca × opNumero) e [[torg_status_obra]] (listas de expedição).
