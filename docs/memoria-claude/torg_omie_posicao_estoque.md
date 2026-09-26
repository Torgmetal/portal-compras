---
name: torg_omie_posicao_estoque
description: Posição de estoque do Omie por local — sem filtro o ListarPosEstoque devolve SÓ o local padrão (Almoxarifado); "TODOS" dá uma linha por (produto, local); 6 locais (endpoint estoque/local/, não localestoque); CMC é por local; sem cUnidade; saldo zero não vem; 100 linhas/página; a Qtd do portal = Almox + Fábrica + Terceiro (Vitor, 26/09: é material da Torg), patrimônio fora; a tela cortava em 1.000 de 2.500
metadata:
  type: project
---

**Medido em 24–25/09/2026, só leitura (Omie ao vivo + banco).** Pedido do Vitor: conferir as suspeitas
sobre `sincronizarProdutos` levantadas na correção das movimentações ([[torg_omie_movimentos_estoque]]).

**O que estava errado (todas confirmadas):**
- ⚠⚠ `ListarPosEstoque` **SEM** `lista_local_estoque` devolve **só o local PADRÃO** (Almoxarifado): 258
  linhas, byte a byte iguais ao filtro pelo 7315778267. Com `"TODOS"`: 810 linhas de 657 produtos. Na tela,
  399 produtos (chapas, perfis, tubos) não existiam e 31 apareciam NEGATIVOS — ex. chapa 3,00 mm −6.480
  com +8.159 na Fábrica. `qtdAtual` no banco batia 657/657 com a posição sem filtro.
- A lista de locais vinha de `estoque/localestoque/` — **não existe** (doc 404; a chamada estourou os 3 s
  ou voltou `{error}` SEM `faultstring`, que o `omieCall` entrega como sucesso). O certo é
  **`estoque/local/` `ListarLocaisEstoque {nPagina, nRegPorPagina}` → `locaisEncontrados[]`**
  (`codigo_local_estoque`, `codigo`, `descricao`, `padrao`, `inativo`, flags `disp*`).
- O filtro por local usava `nCodLocal`: o Omie **recusa** ("Tag [NCODLOCAL] não faz parte da estrutura do
  tipo complexo"). O certo é `codigo_local_estoque` (um) ou `lista_local_estoque` (vírgulas ou "TODOS").
- Tudo caía em `catch { break; }`: `ConfigEstoque.locaisOmie` = null, **0 de 2.500** itens com `locaisQtd`.
  ⚠⚠ E o pior: página lenta → posição pela metade → o passo seguinte ZERAVA quem não foi lido.
- ⚠ **A resposta não tem `cUnidade`** (nem `nFisico`): o update gravava "UN" por cima da unidade que o
  catálogo acabara de gravar — os 258 da posição estavam "UN", 120 deles KG/LATA/PC no cadastro.
- O rodapé da tela dizia "diariamente às 06:00/06:30"; a agenda é de hora em hora, 06–20 UTC (3h–17h BRT).
- ⚠⚠ **A tela cortava em 1.000** (`take: 1000`, ordem alfabética, busca no NAVEGADOR): de 2.500 ativos
  chegava até "INDUSDUR…"; 419 dos 657 com posição — todos os 196 PERFIL e 52 TUBO — nunca apareciam,
  nem buscando. Ver [[torg_filtro_antes_do_corte]].

**Fatos do contrato (medidos):**
- `"TODOS"` = uma linha por (produto, local), com `codigo_local_estoque`. **Saldo zero não vem** (produto que
  zera num local some dali); negativo vem.
- **Máximo 100 linhas por página**, peça-se 200 ou 500 (`nTotPaginas` acompanha). Latência 0,45–0,9 s, com
  picos de 25–29 s — 3 s sem retentativa não serve para leitura que precisa vir inteira.
- **CMC é por local** (134 de 136 produtos em mais de um local têm CMC diferente). O do Almoxarifado, para
  aço, é 0 ou 1 R$/kg — e `lib/custo-material.js`/`lib/match-omie.js` usam `EstoqueItem.cmc` como preço.
- **Seis locais**: 001 ALMOXARIFADO 7315778267 (padrão), 002 FABRICA 7320665233, 003 TERCEIRO 7572486140
  (criado 02/06/2025), 004 MAQUINAS, 005 FERRAMENTAS, 006 EDIFICACOES (patrimônio, criados 25/03/2026).
- ⚠ **TERCEIRO**: 273 itens, 1,43 milhão de unidades, códigos de cliente (TMSA/Vale, tinta Jotun, chapa UHMW);
  **86 movimentos, todos "24 – Retorno de Remessa" de jan–fev/2025, nenhum depois**. Mas 8 produtos têm a
  entrada no Terceiro e o consumo baixado na Fábrica (W610×174: Fábrica −5.112,6, Terceiro +126.606,4).
- Pedidos do portal por local desde 28/08/2026: Almoxarifado 47, Fábrica 34, Terceiro 1.

**Como ficou (25/09/2026, `lib/omie-estoque-posicao.js`):**
- Uma leitura `"TODOS"`, inteira ou exceção (erro, página sem `produtos`/`nTotPaginas`, total ≠
  `nTotRegistros`); nada grava saldo antes disso; o cron registra `ok:false` com o motivo.
- ⚠⚠ **Qtd (`qtdAtual`) = Almoxarifado + Fábrica + Terceiro** (`LOCAIS_NA_QTD`). **Vitor (26/09/2026):**
  *"o material de terceiro sim é da Torg e pode ser usado"* — o nome engana, não é material de cliente. Os de
  PATRIMÔNIO (máquinas, ferramentas, edificações) ficam fora: não são material de uso. Comparado nos dados
  reais: só Almox (antes) 227 positivos/31 negativos; Almox+Fábrica 478/26; com o Terceiro 638/19 — ele fecha
  a conta de 8 produtos que entraram no Terceiro e foram baixados na Fábrica. Local novo não entra sozinho.
  ⚠ Os códigos são FIXOS: se um local da Qtd sumir do cadastro do Omie (apagado/recriado = código novo), a
  sincronização LANÇA dizendo qual — senão a Qtd de tudo que estava nele cairia a zero, calada.
- `locaisQtd` guarda CADA local, negativo inclusive; a tela mostra todos (negativo em vermelho, fora da Qtd
  tracejado) — antes o filtro `> 0` escondia o que explicava a conta.
- CMC = média dos locais da Qtd ponderada pelo saldo positivo → senão a de onde houver positivo → senão o
  CMC que o Omie informar (igual ao de antes para produto de um local só) → senão 0.
- Zera quem saiu da posição: inclusive negativo e quem só tinha detalhe fora da Qtd (antes, só `> 0`).
- Data da posição no dia de Brasília ([[torg_fuso_servidor]]); prazo de 40 s contado do início da rota.

**Achados de passagem, NÃO corrigidos (mesma causa):** `app/api/omie/buscar-produto` (fallback ao vivo da
RM: só local padrão, lê `cUnidade`), `app/api/omie/preco-medio` (manda `cCodigo`, que não está na doc do
`ListarPosEstoque` — provável recusa, não conferido), cache de `lib/omie-pedido-compra.js` (saldo só do
padrão). ⚠ O Almoxarifado com aço NEGATIVO é consumo baixado no local errado no Omie — dado, não código.
