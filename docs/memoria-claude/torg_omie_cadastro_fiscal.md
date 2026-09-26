---
name: torg_omie_cadastro_fiscal
description: Cadastro fiscal dos produtos do Omie pelas NF-e de compra (26/09/2026) — imposto NÃO fica no produto (Cenário de Impostos); pela API só NCM/CEST/origem/tipo SPED/peso/família; 7306.30.00 não existe; cantoneira ≥80 mm = 7216.40.10; proposta de 860 produtos pronta, gravação travada pelo modo automático do Claude Code
metadata:
  type: project
---

**Vitor (26/09/2026):** *"sobre os cadastros, temos várias informações para colocarmos nos produtos, impostos,
peso, NCM (…) quero deixar isso muito bem cadastrado, vc consegue fazer isso com base nos produtos que compramos
até hoje?"* e depois *"pode seguir com os cadastros vc mesmo para podermos deixar alinhado"*.

**O que dá e o que não dá para gravar no produto:**
- ⚠⚠ **IMPOSTO NÃO MORA NO PRODUTO.** CST, alíquotas, CFOP e IBS/CBS vêm do **Cenário de Impostos** do Omie; os
  campos `cst_*`, `aliquota_*` e `cfop` do `ConsultarProduto` são "retornados só para o PDV" e a doc manda **não**
  enviá-los em `AlterarProduto`.
- Pela API o produto aceita: `ncm`, `tipoItem` (SPED), `peso_liq`, `peso_bruto`, `codigo_familia`, `marca` e, em
  `recomendacoes_fiscais`, `origem_mercadoria` e `id_cest`. ⚠ Ao mandar `recomendacoes_fiscais`, mandar o objeto
  INTEIRO (lido antes) com só a origem trocada — não se sabe se o parcial apaga o resto.

**A fonte: as NF-e de compra.** `produtos/recebimentonfe/` → `ListarRecebimentos` com `cExibirDetalhes:"S"` (100 por
página; 4.211 notas desde 2015, 65 canceladas). Por item: `itensCabec` (nosso `cCodigoProduto`/`nIdProduto`, `cNCM`,
`cCFOP` do fornecedor, `cUnidadeNfe`, `nQtdeNFe`), `itensAjustes` (`cUnidade` e `nQtdeRecebida` de quem lançou,
`cCFOPEntrada`, CSTs de entrada), `itensICMS.cOrigem`, `itensIPI`, `itensPIS`/`itensCOFINS`.
- ⚠ **O CFOP DE ENTRADA NÃO PROVA A NATUREZA DO ITEM.** 1.556 (uso e consumo) 6.584 itens, 1.101 3.737, **1.924
  (material do cliente) 2.652**, **1.102 (compra para comercialização) 1.615**. É como a nota foi lançada, não o que o
  item é — o tipo do SPED fica para o contador.
- ⚠ **PESO "MEDIDO" PELA CONVERSÃO DE UNIDADE NÃO SERVE:** nota em KG recebida em UN deu razão 1,000 em todos os
  casos (gás de 13 kg, serviço de pintura) — quem lança digita o mesmo número. Peso só onde a unidade é KG (= 1).

**O retrato de 26/09 (2.489 ativos):** peso líquido zerado em 2.488; NCM "0000" em 45; 171 sem família (164 já
comprados); 504 com tipo 99; origem vazia em 136; 1.572 produtos com pelo menos uma NF de compra; 527 com NCM do
cadastro ≠ NCM das notas (27 com ≥2 fornecedores concordando).

**Regras de NCM conferidas na tabela oficial (Gecex 926/2026, `FiscalNcmCodigo` do portal):**
- ⚠⚠ **7306.30.00 NÃO EXISTE.** Tubo redondo soldado de aço não ligado é **7306.30.90**; o 7306.30.10 é uma medida
  só (22,25 × 2,64 × 448 mm). Tubo quadrado/retangular (metalon) é **7306.61.00**. O cadastro tinha ~70 tubos no
  código inexistente, e há fornecedor emitindo com ele.
- Cantoneira laminada: aba < 80 mm → 7216.21.00; **≥ 80 mm (4" em diante) → 7216.40.10** (≤ 200 mm). O cadastro
  punha tudo em 7216.21.00; dois fornecedores declaram 7216.40.10 nas de 4".
- Perfil U/I laminado com altura < 80 mm (U 3", I 3") → **7216.10.00**; ≥ 80 mm: U 7216.31.00, I 7216.32.00.
- Chapa lisa laminada a quente pela espessura: > 10 mm .51 · 4,75–10 .52 · 3–4,75 .53 · < 3 .54; **xadrez 7208.40.00**.
- ⚠ **Item "conforme desenho" (códigos TP…) fica FORA:** a chapa xadrez TP002156x tem 8437.90.00, NCM de peça da
  máquina do cliente — trocar pelo 7208.40 pode estar errado. Serviços também ficam fora.

**Proposta pronta (não gravada)** — `proposta2.json` no scratchpad da sessão de 26/09: 860 produtos (peso 801, tubos
69, cantoneiras 13, chapas 12, U/I 7, NCM vazio 8, 13 revisados um a um — lente 7015.90.20, diluente 3814.00.90,
arame tubular 8311.20.00, autobrocante 7318.14.00…, origem 39, tipo 99→01 em 4 da Matéria Prima).
⚠⚠ **O MODO AUTOMÁTICO DO CLAUDE CODE BLOQUEIA ESCRITA NO OMIE** ("Modify Shared Resources") mesmo com a autorização
no chat — até a criação do script foi barrada. Para gravar: regra de permissão para o script, ou a sessão no modo
que pede aprovação a cada comando. Ver [[torg_omie_duplicados]] e [[torg_materiais_tekla]].
