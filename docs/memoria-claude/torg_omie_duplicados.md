---
name: torg_omie_duplicados
description: Duplicados no cadastro do Omie (perfis/chapas/parafusos) medidos em 24/09/2026 — a API NÃO inativa (só a tela); "em uso" tem de olhar a ENTRADA DE NOTA (CMR), não só RM/pedido; 4 seguros, 9 em uso no recebimento, 2 ambíguos, 3 já apagados
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

**Tentativa de inativar (24/09/2026, noite).** Vitor: *"eu quero que vc faça isso, porém só precisa tomar
cuidado para não inativar o que estamos usando hoje"*.
- ⚠⚠ **A API DO OMIE NÃO INATIVA.** `AlterarProduto({codigo_produto, inativo:"S"})` responde "Produto alterado
  com sucesso!" e o `inativo` continua "N" — a doc diz que o campo "não deve ser informado na
  inclusão/alteração", e não há método próprio (lista: Alterar/Associar/Consultar/Excluir/Incluir/
  IncluirPorLote/Listar/ListarResumido/Upsert/UpsertPorLote). Piloto no PRD00005 (sobra de "Cópia de"):
  nada mudou no cadastro, conferido campo a campo — nem a data de "última alteração" (segue 13/10/2025,
  reconferido 1 h depois). **Inativar é pela TELA
  do Omie.** Não tentar de novo pela API; excluir (`ExcluirProduto`) está fora — apaga dado.
- ⚠⚠ **"EM USO" TEM DE OLHAR A ENTRADA DE NOTA, NÃO SÓ O PORTAL.** O portal (RM, `PedidoOmie`) dizia "sem
  uso" para códigos que o RECEBIMENTO usa: a linha do CMR traz a descrição do produto do Omie lançado na
  nota. Compras compra num código, o recebimento lança noutro — é assim que o duplicado nasce e continua
  vivo. Medido: 101000050 (chapa 12,70) 5 entradas desde maio/26, última 20/08; 101000038 (6,35) última
  19/06; 501000064 (PERFIL H W150) última 16/03; 101000037 (4.75) 15/01; 501000070 (H W200x71) 12/2025;
  201000008 (tubo 42,40 CC) 10/2025. Também olhar: pedido de compra EM ABERTO NO OMIE (`PesquisarPedCompra`
  pendentes/parciais — o portal só conhece os pedidos que ele criou; eram 96), saldo ≠ 0
  (`ListarPosEstoque`), data de cadastro (`info.dInc`).
- ⚠ **O cache `ProdutoOmie` é semanal e estava velho:** PRD00016, 2010000049 e 201000196 já tinham sido
  APAGADOS no Omie. Antes de agir, ler o cadastro ao vivo.
- ⚠ 01.03.20668 (U 8") e 01.03.16796 (L 4"x5/16") foram CRIADOS em 18/09/2026 (usuário P000414907, o
  mesmo que criou o 101000050): código com cara de fornecedor, provavelmente criado na entrada de nota.
- **Resultado:** seguros para inativar (nenhum uso em lugar nenhum, sem ambiguidade) = PRD00005, PRD00015,
  101000036, 501000082 → passados ao Vitor para a tela. Em uso = 501000071 (pedido 1721 aberto) + os 6 do
  recebimento + os 2 de 18/09. Ambíguos (tubo sem "com costura"/com DIN 2440) = 201000050, 201000098.
  Para o tradutor, os duplicados em uso se resolvem por REGRA de equivalência (ex.: 1/2" → 101000007, o
  código em que Compras compra), não por inativação.
- **Portal:** a busca da RM (`/api/omie/buscar-produto`) devolvia o produto INATIVO quando se digitava o
  código exato (último recurso, `ConsultarProduto`) — agora filtra `inativo === "S"`.
- ⚠ **Achado de passagem:** a sincronização de movimentos de estoque (`sincronizarMovimentacoes`) chama
  `ListarMovEstoque`, que NÃO EXISTE no Omie ("Method not exists"); o erro é engolido e
  `EstoqueMovimentacao` tem 0 linhas desde sempre. Aberta tarefa separada.
- Scripts desta verificação (scratchpad, não versionados): `_uso-omie.mjs`, `_inativar.mjs` (lista
  aprovada fixa + re-checagem ao vivo + diff campo a campo) — reaproveitáveis se um dia houver API.
