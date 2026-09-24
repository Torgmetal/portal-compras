---
name: torg_omie_duplicados
description: Duplicados no cadastro do Omie (perfis/chapas/parafusos) medidos em 24/09/2026 — 13 produtos em dobro, 14 códigos a inativar, 4 casos para decidir, 52 antigos sem família sem uso; como limpar sem quebrar o portal (inativar, nunca excluir; 0 inativos até hoje)
metadata:
  type: project
---

**Vitor (24/09/2026):** *"como podemos ver o que temos duplicado antes de trazer as descrições do tekla, e
esses duplicados é possível alterarmos para depois não ocorrer conflitos?"* — antes do tradutor
Tekla→Omie na importação da RM ([[torg_materiais_tekla]]).

**Medido (2.498 produtos ativos; entregue a planilha "Duplicados cadastro Omie 2026-09-24.xlsx"):**
- **13 produtos com mais de um código → 14 a inativar.** Padrões: lote "PERFIL H … DN. W…" repetindo o
  "PERFIL W" (501000064/070/071/082); chapas com PONTO decimal (101000036 2.65, 101000037 4.75 — o lote
  101000036–038 e 042 foi cadastrado com ponto); 3 "Cópia de …" (PRD00005/15/16); tubos com a descrição
  longa (201000008/040/098, "COM COSTURA … SAE/DIN/NBR") × curta ("TUBO REDONDO Ø…"); um código de 10
  dígitos (2010000049). Só o 501000071 tem pedido em aberto; nenhum tem saldo.
- **4 para decidir:** chapa 1/4" 6,30 (101000004, muito usada) × 6,35 (101000038, nunca usada); 1/2"
  12,50 (101000007) × 12,70 (101000050, nunca usada); dois códigos antigos com família e descrição cortada
  sem norma (01.03.20668 U 8", 01.03.16796 L 4"x5/16").
- **Parafusos: nenhum duplicado** — as variações (GF/ZB/bicromatizado, classe, norma) são produtos distintos.
- **52 itens SEM família**, nenhum usado pelo portal (RM, pedido, estoque); 11 parecem repetir o catálogo.
  Ficam fora da planilha do Tekla e do tradutor; há códigos com cara de cliente (T0…, TP00…, 12xxxxx —
  ver [[torg_tekla_tmsa_vale]]): conferir nota de venda/remessa no Omie antes de inativar.
- **"Multinormas comercial" NÃO é duplicado:** 48 itens repetem a bitola do A36 com outro material; o
  Tekla nunca diz "Multinormas", então não confunde o tradutor. 7 usados em RM. Decisão de Compras.

**Como limpar (o que o portal aguenta):**
- ⚠⚠ **INATIVAR, nunca excluir.** Receber pedido em aberto e transferir saldo ANTES.
- ⚠⚠ **Até 24/09 NUNCA houve produto inativo (0 de 2.498)** — o portal nunca viu uma inativação. Pedir
  para inativarem UM e conferir antes do resto.
- A doc da API do Omie: `ListarProdutos` não tem filtro de inativo e devolve o campo `inativo` (S/N) →
  o cache `ProdutoOmie` e o catálogo do `EstoqueItem` devem ver a inativação.
- ⚠ `sincronizarProdutos` (lib/omie-estoque.js) marca `ativo: true` em todo produto da
  `ListarPosEstoque` — **e ela só lista saldo ≠ 0** (medido: 258 = 227 positivos + 31 NEGATIVOS). Produto
  inativado com saldo (inclusive negativo) volta a aparecer na busca da RM. Por isso: zerar saldo antes.
  O `ativo:true` forçado é de propósito (comentário antigo: produtos "inativos no cadastro geral mas
  ativos no estoque") — não mexer sem entender.
- ⚠ `EstoqueItem.unidade` cai em "UN" quando o Omie não manda a unidade — chapa em KG aparece "UN". Para
  unidade, usar o cadastro (`ProdutoOmie.unidade`).
- Scripts da análise (scratchpad, não versionados): classificação por tipo+designação+material (norma
  genérica "aço carbono"/sem norma = mesma chave), chapa por espessura + classe de polegada (±2%).
