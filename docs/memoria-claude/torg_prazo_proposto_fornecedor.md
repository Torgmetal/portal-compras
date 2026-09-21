# A data do fornecedor é proposta, não prazo (18/09/2026)

Matheus: *"sim, o Compras precisa aprovar a alteração depois"*.

**O que mudou.** `/fornecedores/entrega/<token>` (público, sem login) remarcava o prazo na hora:
digitava uma data e `prazoEntregaPrevisto` mudava, o pedido saía do vermelho, saía da cobrança e a
RM podia virar "No prazo". Agora a rota pública grava SÓ `prazoProposto`, `prazoPropostoEm`,
`prazoPropostoMotivo`, `prazoPropostoId` (`scripts/ensure-prazo-proposto.mjs`). Quem efetiva é
`POST /api/compras/prazos-rm/prazo-proposto`, com sessão COMPRAS/ADMIN.

**As armadilhas medidas e o porquê de cada trava:**

- **A proposta pendente NÃO suspende a cobrança.** Se suspendesse, responder qualquer data seria o
  jeito mais barato de sumir da cobrança, e o silêncio de Compras viraria aprovação tácita.
- **`prazoPropostoId` é a VERSÃO da proposta.** Comparar só a data deixa passar mesma-data-outro-
  motivo e o vaivém A→B→A. A tela devolve o id que leu; divergiu, 409. A troca é condicionada no
  próprio UPDATE, não só na leitura.
- **`prazoOriginal` vem de `previsaoAtual`, não de `prazoEntregaPrevisto`.** Há pedido cuja previsão
  vem dos itens da cotação ou do prazo em palavras, com a coluna nula.
- **São DOIS efetivadores.** `app/api/compras/entregas/prazo/route.js` é o outro: passou a ler
  dentro da transação e a MATAR a proposta pendente (senão o botão "aprovar" continuaria na tela e
  desfaria a decisão interna com a data antiga do fornecedor).
- **Recusar avisa o fornecedor por e-mail.** Recusa silenciosa o deixa achando que a data está
  combinada. O aviso não derruba a recusa, mas a tela alerta em vermelho quando ele não foi avisado.
- **O `PrazoHistorico` leva `[Fornecedor] <texto dele>`**, nunca o comentário de quem aprovou — é
  por esse prefixo que o GET público filtra, e o texto interno vazaria pelo link.

## ⚠⚠ Prazo se formata em UTC, não em São Paulo

Defeito real achado escrevendo o teste: a data vem de `<input type="date">`, então "2026-11-20" é
meia-noite UTC — e meia-noite UTC em São Paulo ainda é **dia 19**. O e-mail de aviso e a página do
fornecedor mostravam um dia ANTES do que ele digitou; a tela de Compras, que já usava UTC, mostrava
o certo. Duas telas discordando sobre a mesma data, pelo fuso.

⚠ Vale para PRAZO. Carimbo de *quando* algo aconteceu continua em `America/Sao_Paulo`.

Ver [[torg_resposta_fornecedor_aviso]], [[torg_cobranca_atraso]].
