---
name: torg-faturamento-direto
description: "Portal Compras Torg — faturamento direto (FD): onde nasce, o elo RMItem→OPItem que nunca existe, e o fallback por categoria (lib/faturamento-direto.js)"
metadata: 
  node_type: memory
  type: project
  originSessionId: f0eb7362-df04-4e12-8b97-4a78c7f30111
  modified: 2026-07-24T20:55:33.150Z
---

**Faturamento Direto (FD)** = fornecedor fatura o material direto pro CLIENTE da obra (não pra Torg). Corrigido em 2026-06 (commit 17189b4) após 151 cotações saírem todas "Torg".

**Onde nasce:** Comercial marca por **item** da OP (`OPItem.faturamentoDireto`, toggle "Torg/Direto (cliente)" no ItemFormRow; também `AditivoItem`). Não existe flag na OP — "OP tem FD" é derivado dos itens. Dados fiscais do cliente ficam na OP (`clienteRazaoSocial/clienteCnpj/...`, card "Faturamento e Dados Fiscais").

**Fato estrutural — o elo RMItem→OPItem NUNCA existe:** `NovaRMClient.jsx` hardcoda `opItemId: null` (a engenharia seleciona só a OP + categorias). 0 de 331 RMItems vinculados. Qualquer lógica que dependa de `rmItem.opItem` precisa do **fallback por categoria**: categoria da OP é FD se TODOS os seus itens são FD (misto→FD, conservador); RM é FD se TODAS as suas `categoriasOP` são FD; `RM.faturamentoDireto` (toggle aluguel) também conta. 49/52 RMs têm categoriasOP.

**Lib compartilhada:** `lib/faturamento-direto.js` — `mapearFDPorRM(rmIds)` (consulta o banco), `fdPorCategoriaDaOP(op)` + `rmEhFD(rm, map)` (puras), `itemEhFD(rmItem, fdPorRM)` (vínculo direto > fallback). Usada em: `cotacao/enviar` (deriva `Cotacao.faturamento`), portal do fornecedor (`isFD` dinâmico — corrige cotações antigas sem migração), `op/[id]/gerar-pedidos` (pedido `-FD`, `nQtdeParc=0`, sem contas a pagar no Omie), `adicionar-rm` (promove Torg→Cliente). O painel de OPs e o sugerir-vencedores já tinham a mesma lógica inline (`_fdDerivado`).

**Cuidados:** `rm/[id]/gerar-pedidos` (RM sem OP) mantém FD=false de propósito; cotação multi-RM usa dados do cliente da RM principal (misturar OPs de clientes diferentes numa cotação FD mostraria o cliente errado); "desvincular OP" da RM zera categoriasOP e mata o fallback retroativamente.

**Resumo FD pro cliente (Excel)** — commit 7e8997f (24/07): botão "Resumo FD (cliente)" no painel-ops (`app/compras/painel-ops/[opId]`, no header "RMs vinculadas"). `GET /api/compras/op/[opId]/resumo-fd` agrupa os vencedores de FD por fornecedor/proposta (itemEhFD), traz razão social, CNPJ, endereço (Omie `ConsultarCliente` best-effort com timeout 8s + dedup por nCodOmie, fallback cidade/UF), forma de pagamento (`prazoPagamento`), nº proposta, prazo entrega; qtd/preço iguais ao gerar-pedidos. Excel montado em `lib/resumo-fd-excel.js` (testável fora do browser; padrão Torg, doc REL-CMP-002, faixa navy #0D1F3C). Mesmo fornecedor com várias propostas = blocos separados (cada proposta tem nº/condição própria).
