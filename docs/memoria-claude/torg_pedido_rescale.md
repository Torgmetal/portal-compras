---
name: torg_pedido_rescale
description: "gerar-pedidos rescala preço pro totalProposta — só vale se cobre a proposta INTEIRA, senão infla (split)"
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-07-24T20:32:43.084Z
---

`gerar-pedidos` (RM e OP, `app/api/{rm,op}/[id]/gerar-pedidos/route.js`) escala os preços unitários pra o total do pedido bater com `Cotacao.totalProposta` (total do PDF do fornecedor). O `totalProposta` é o total da **proposta inteira** do fornecedor.

**Bug (corrigido 24/07, commit ffa4b13):** o rescale comparava `totalProposta` com a soma só dos **vencedores**. Em split — comprador levou só parte dos itens daquele fornecedor no Mapa, ou o grupo é só a fatia FD/NORMAL da cotação — o fator disparava e INFLAVA os preços. Casos reais no Neon: item sozinho da GERDAU (OP-102) ia a **29x**, Companhia da Segurança (RI-0006) a **21x**; all-won com totalProposta divergente (RI-0007/OP-089/OP-097) desinflava/inflava tudo. 14 de 33 cotações com totalProposta+vencedor afetadas. Era o "inventando números / não cria de acordo com a seleção dos vencedores" que o Vitor reportou.

**Regra agora (ffa4b13 + ac156f7):** rescale só roda se `cobrePropostaInteira` (TODOS os itens cotados com preço>0 da cotação venceram e entram no pedido) **E** `fator ∈ [0,85, 3,0]`. Cobrindo a proposta inteira, o totalProposta é o total da NF: em fornecedor tipo **GERDAU o total já vem com frete/ICMS-ST/demais cobranças embutidos** (Vitor, 24/07), então o pedido DEVE bater com ele mesmo bem acima da soma dos itens — daí o teto 3x e não ±15%. Total ABAIXO dos itens (fator<0,85) não é frete → dado suspeito (typo/extra-zero) → preço cotado direto. Split → nunca rescala. Pra detectar split, o include passou a trazer `itens: true` (não só `where: vencedor`) e conta `itensComPrecoCot`.

**Pedidos antigos distorcidos** — a verdade está no `payload` gravado (não nos vencedores atuais, que podem ter sido editados depois): **RESETADOS 24/07** (status REVERTIDO, itens→COTADO, vencedores mantidos p/ regerar em 1 clique): 1713 (RI-0006 Cia.Segurança, LUVA 21x→R$178,50), 1711 (RI-0006 Ferro, +9%→R$2.598,34), 1570 (OP-078 TECIAM, telas a R$0,02 por typo do total 14,86→~R$13,3k, mas confirmar unidade m²/peso). **NÃO mexidos:** 1710 (RI-0007 Ferro) está CERTO (payload = cotado exato); 1656/1702 GERDAU CERTOS (frete); 1378 (OP-083 Simioni, só 6% e vencedores já editados p/ 1 item — regerar sairia errado, deixar); 1612 (OP-060 Simioni FD, 25% abaixo — Vitor decide se é desconto real ou dado velho). 1463 (OP-084 SOUFER) = anomalia de qtd (264M), à parte. Fluxo de reset = espelha `app/api/pedido-omie/[id]/reverter` MENOS o desmarcar-vencedor.

**Landmine:** qualquer código novo que toque gerar-pedidos NÃO pode voltar a comparar totalProposta com subconjunto de itens. Ver também [[torg_omie_recebimento]] (etapa/NF do pedido) e [[torg_op_vistas]].
