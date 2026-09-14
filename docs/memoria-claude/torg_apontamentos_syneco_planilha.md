---
name: torg_apontamentos_syneco_planilha
description: Planilha "Apontamentos para o Syneco" — o que o portal deu baixa (baixaSetores) e o Syneco ainda não tem, por marca e setor; em Produção › Meu trabalho (todas as obras) e em Peças › OP › setor (só aquele setor)
metadata:
  type: project
---

**Onde:** `Produção › Meu trabalho` tem um card com o total ("N peças em M marcas baixadas no portal ainda
não estão no Syneco") e o botão *Planilha para o Syneco* (todas as OPs vivas, todos os setores). Em
`Produção › Peças › OP › setor`, o botão *Apontamentos p/ Syneco* ao lado de *Exportar seleção* gera a
mesma planilha só daquela OP e setor. Lib `lib/apontamentos-syneco.js`, rota
`/api/producao/apontamentos-syneco?opId&setor`, planilha no padrão Torg (`criarExcelTabular`).

**Why:** Vitor (14/09/2026): "precisamos ter uma forma de exportar a planilha de Apontamentos para ser
corrigido no Syneco, onde poderíamos colocar isso?". A baixa do portal só adianta; o Syneco é o
registro oficial (cronograma do cliente, PDF e portal do cliente leem de lá). Já existia a "Baixa
Syneco" no Gantt do PCP, mas por marcas selecionadas — o encarregado não vive no Gantt.

**How to apply:**
- Linha = baixa do portal (limitada à qte da marca; sem `qtd` = marca inteira) − produzido no Syneco no
  setor (`mesOrdem` por `whereSetorSyneco`); só saldo > 0. Obra vai no código SKA (`opNumero` da LPC).
- Medido em 14/09: 3.496 marcas / 14.855 peças em 4 obras (067: 8.694 croquis de corte baixados em
  agosto como "fora do escopo — já fabricada"). Quando o Syneco recebe o lançamento, a linha some no sync.
- Relacionado: [[torg_syneco_apontamento_fonte]], [[torg_pecaconjunto_opnumero]], [[torg_baixa_etapa_anterior]].
