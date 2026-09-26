---
name: torg_omie_movimentos_estoque
description: Movimentações de estoque do Omie — o método é ListarMovimentoEstoque em estoque/consulta (ListarMovEstoque NÃO existe, e EstoqueMovimentacao ficou com 0 linhas até 24/09/2026); idProd é numérico (ponte ProdutoOmie.codigoOmie); dois locais em uso; a falha agora LANÇA; as saídas NÃO abatem reserva de OP (decisão do Vitor, 26/09)
metadata:
  type: project
---

**Até 24/09/2026 a sincronização de movimentações NUNCA gravou uma linha.** `sincronizarMovimentacoes`
chamava `ListarMovEstoque` em `estoque/movestoque/` — o Omie responde `Method "ListarMovEstoque" not
exists` — e o laço fazia `catch { break; }` lendo `resp.movimentos || []`. O erro virava "0 movimentos,
sucesso": `EstoqueMovimentacao` com 0 linhas e o cron `estoque-movimentacoes` verde no monitor, de hora
em hora. Corrigido em `lib/omie-estoque-movimentos.js` (a função saiu de `lib/omie-estoque.js`).

**O contrato certo** (doc + UMA chamada de leitura ao vivo, 24/09/2026, janela 17–24/09):
- `ListarMovimentoEstoque` no serviço **`estoque/consulta/`** (o mesmo do `ListarPosEstoque`).
  Em `estoque/movestoque/` só existem `ConsultarPrevisao` e `ListarMovimentos` — este é AGREGADO POR DIA
  (entradas/saídas do dia por produto), sem id de movimento nem CMC: não serve para o histórico.
- Parâmetros: `nPagina`, `nRegPorPagina` (50 é o do exemplo — o conferido), `dDtInicial`/`dDtFinal`
  "dd/mm/aaaa", `lista_local_estoque: "TODOS"`.
- Resposta: `movProdutoListar[]` + `nPagina`/`nTotPaginas`/`nRegistros`/`nTotRegistros`. Medido: 54
  movimentos em 8 dias (≈7/dia), 2 páginas.
- ⚠⚠ **O produto vem como `idProd` NUMÉRICO** (o `nCodProd`), e o portal guarda o código em TEXTO
  (`EstoqueItem.codigoOmie`, ex. "101000007"). A ponte é `ProdutoOmie.codigoOmie` — cache SEMANAL
  (segunda 05h UTC). ⚠ Produto novo nasce na ENTRADA DA NOTA (ver [[torg_omie_duplicados]]), então o
  movimento chega antes do cache: o que faltar vai ao `ConsultarProduto{codigo_produto}`.
- `idMov` é único por LINHA — uma por item da nota (a mesma NF tem vários `idMov`). Chave:
  `EstoqueMovimentacao.syncCodigoOmie = "omie-<idMov>"`.
- `tipo` "entrada"/"saida" dá o sentido; `qtde` veio positiva (usa-se o módulo); `cmc` é o custo médio
  DEPOIS do movimento (varia linha a linha; `saldo` acumula); `valor` é unitário.
- `operacao`: 00 ajuste, 11/12 venda, 13 devolução de venda, 14 remessa, 16/26 complementar, 21/22
  compra, 23 devolução ao fornecedor, 24 retorno de remessa, 28 ordem de produção.
  `cancelamento`/`devolucao` "S" marcam a linha que DESFAZ uma nota.
- ⚠ **Dois locais em uso**: `7315778267` (consumíveis — EPI, discos, gases, tintas) e `7320665233`
  (aço — chapas, perfis). Sem `lista_local_estoque` a doc não diz o que volta; por isso "TODOS".
- Na semana medida, **só houve compra** (`21 COM Compra de Produto`, todas `entrada`): nenhuma saída.

**Regras do portal (decididas em 24/09/2026):**
- ⚠⚠ **Nada vira zero em silêncio.** Erro do Omie, resposta sem `movProdutoListar`/`nTotPaginas`
  (`{}` não é vazio — mesma lição de `lib/omie-encerramento.js`), movimento que não pôde ser gravado
  (produto sem código, sem `EstoqueItem`, tipo desconhecido) e alocação FIFO que falhou LANÇAM, com
  `e.resumo` do que entrou; o cron registra `ok:false`. Vazio só quando o Omie DIZ ("Não existem
  registros" ou `nTotRegistros: 0`). ⚠ A frase do vazio é o padrão do Omie, **não conferida neste
  método** — se vier outra, o cron falha alto, não em silêncio.
- Janela em dias de **Brasília** (o servidor roda em UTC — ver [[torg_fuso_servidor]]); data do
  movimento ao **meio-dia UTC** (convenção de `lib/cmr.js`).
- Estorno (cancelamento/devolução) é gravado, com origem `OMIE_NF`, e **não abate reserva**. Ajuste
  (00) sai como `MANUAL`.
- Cron com prazo de 45 s dentro do `maxDuration` 60 — morto por timeout, o `catch` não roda e o monitor
  fica sem registro (ver [[torg_crons]]).

**⚠⚠ AS SAÍDAS NÃO ABATEM AS RESERVAS DAS OPs — decisão do Vitor (26/09/2026).** O desenho original
mandava toda SAÍDA (menos estorno) para `aplicarAlocacaoMovimentacao` (lib/estoque-alocacao.js), que
consome as `EstoqueReserva` ATIVAS das OPs (criadas por item de RM com destino estoque) — isso nunca
rodou em produção. Perguntado antes do deploy, Vitor escolheu subir **gravando as movimentações sem
abater reserva** até definir quais saídas são consumo de verdade (venda 11? remessa 14? ajuste 00? só
OP 28?). O caminho continua no código, testado, atrás de `abaterReservas` (desligado por padrão; o cron
não passa). ⚠ Ligar depois NÃO aloca as saídas já gravadas — a rodada as vê como existentes; seria
preciso um reprocessamento à parte. Outros pontos em aberto: transferência entre locais não apareceu na
amostra (com "TODOS" viria como saída + entrada); `alocarSaidaFIFO` não é transacional (atualiza a
reserva antes de criar a alocação).

**Achados de passagem, NÃO conferidos:** (1) `sincronizarProdutos` usa `nCodLocal` no
`ListarPosEstoque`, parâmetro que não está na doc (lá é `codigo_local_estoque`) — com `catch { break; }`,
`locaisQtd` provavelmente é sempre vazio; (2) `qtdAtual` vem do `ListarPosEstoque` SEM local — se isso
for só o local padrão, o saldo do outro local (aço?) fica de fora; (3) `lib/omie-estoque.js` lista locais
em `estoque/localestoque/` e a rota `/api/omie/locais-estoque` em `estoque/local/` — um dos dois está errado.
