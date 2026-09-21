---
name: torg-consulta-estoque-barras
description: Portal Compras Torg — consulta de estoque respondida em BARRAS + abatimento automático na cotação (2026-06)
metadata: 
  node_type: memory
  type: project
  originSessionId: f0eb7362-df04-4e12-8b97-4a78c7f30111
---

Fluxo de **abatimento de estoque na cotação** (commits caf4b83 + fa8def1, 2026-06).

**Semântica:** a resposta da Consulta de Estoque é SEMPRE em **barras/peças** (= `RMItem.qtd` na unidade do item, ex. `barra(s)`), nunca em KG. O servidor normaliza: DISPONIVEL grava `qtdDisponivel = qtd` cheia; PARCIAL exige valor > 0 e limita ao solicitado; INDISPONIVEL grava null. KG (`RMItem.peso`) é só referência de exibição.

**Abatimento (`lib/cotacao-estoque.js` — `calcularAbatimentoEstoque`):** ao enviar cotação (`/api/cotacao/enviar` e `adicionar-rm`), a resposta MAIS RECENTE por item (dedupe inclui INDISPONIVEL!) abate: item 100% disponível fica FORA da cotação (e a RM dele fora de Envio/EM_COTACAO/principal); parcial cota só o saldo — barras líquidas em `CotacaoItem.qtdPecasCotada`, KG proporcional em `qtdCotada`, abatido em `estoqueAbatidoQtd`. Guardas: PARCIAL com valor > qtd = legado ambíguo em KG → ignorado; item com qtd=0 (só peso) → sem abatimento, cota a cheia.

**Pedido Omie (`gerar-pedidos` RM e OP):** só confia na `qtdCotada` quando `qtdPecasCotada != null` (item abatido); senão comportamento legado (peso cheio). Fornecedor zerou a qtd → reconstrói o líquido pela proporção de barras. `lancar-manual` limpa o snapshot do abatimento ao sobrescrever a qtd.

**Pendência conhecida (design, decisão de produto):** item PARCIAL não tem como registrar a parte do estoque — `atender-estoque` é all-or-nothing (flipa o item inteiro p/ ATENDIDO_ESTOQUE, que é PULADO no gerar-pedidos) e é bloqueado após PEDIDO_GERADO. Ou seja: a parcela de estoque de um item parcialmente abatido não vira `atendidoEstoqueQtd`/custo da OP por nenhum caminho. Precisa de atendimento parcial (split do item ou campos de saldo). Também: cotações criadas ANTES da resposta da consulta seguem com qtd cheia (mapa compara totais incomparáveis entre cotação pré e pós-resposta).

Ver [[torg-acesso-notificacoes]] (quem responde: PRODUCAO/ENGENHARIA, gatilho é e-mail) e [[torg-omie-recebimento]].
