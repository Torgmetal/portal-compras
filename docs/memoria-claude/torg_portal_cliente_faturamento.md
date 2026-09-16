---
name: torg_portal_cliente_faturamento
description: Aba "Pedidos e faturamento" no login do cliente (/cliente/faturamento) — OC do cliente × pedido de venda do Omie × notas (nº da NF); acesso só por papel FATURAMENTO no contato da OP, nunca por link; "ver como" para a Torg; Excel por OC
metadata:
  type: project
---

**Vitor (16/09/2026):** "uma aba no portal do cliente para acompanhamento dos pedidos de compras dos
clientes × nossos faturamentos (…) sincronizado o pedido do cliente mais o Omie"; "nem todos devem ter
acesso a essa área"; "precisa informar o número da NF"; "as NF separadas por OC — isso é mais importante
para eles do que para nós"; "o Excel, isso sim faz sentido".

**Regra de acesso — dado financeiro nunca sai por link.** A aba vive no **login do cliente**
(`/cliente/faturamento`, usuário tipo CLIENTE), não no portal por token (`/portal`, que segue só com o
operacional). Quem vê é o contato da OP marcado com o papel **FATURAMENTO** (`OP.clienteContatos[].papeis`),
e só nas obras em que é contato. Para liberar alguém: **Admin › Usuários** (login tipo Cliente com o
e-mail da pessoa) + **OP › aba Obra › "Contatos e acessos"** (marcar "Pedidos e faturamento" por obra).
Padrão: ninguém vê. ADMIN/COMERCIAL podem abrir `?como=<e-mail>` para ver exatamente o que a pessoa vê
(a mesma regra de papel vale; fica na auditoria `CLIENTE_FATURAMENTO_VISTO_COMO`). Toda abertura da aba
e todo Excel ficam na auditoria (`CLIENTE_VIU_FATURAMENTO`, `CLIENTE_FATURAMENTO_EXCEL`).
⚠ A rota do cronograma que regrava `clienteContatos` PRESERVA `papeis` (senão apagaria a permissão).

**O cruzamento OC ↔ Omie não se digita.** O pedido de venda no Omie carrega a OC do cliente em
`informacoes_adicionais.numero_pedido_cliente` (é assim que a TMSA está lançada); `chaveOC` iguala
"OC 232301-1" / "OC232301-1" / "232301-1". Parcelas (prevista, faturada, cancelada, atrasada) vêm do
cache diário `FaturamentoCache` (cron das 7h). OC só no Omie vira linha com aviso (não some); pedido sem
OC idem. Texto dos avisos é do NOSSO lado ("A Torg ainda não registrou o número da sua OC…"), sem "Omie".

**Número da NF** não está no cache: vem de `ConsultarNF` pelo `codigoPedido` da parcela faturada
(lib/omie-nfe → lib/notas-omie), consultado uma vez e guardado em `NotaFiscalOmie` (máx. 12 consultas
novas por abertura; parcela sem NF reconsultada após 1 dia). A data mostrada é a de **emissão** da nota.

**Tela:** um dinheiro por coluna (Contratado · Faturado · A faturar · Próxima nota · Situação), notas
em lista abaixo do pedido ("3 notas emitidas — OC 228351-1"), cabeçalho da obra com TODAS as
referências do cliente (chips das cadastradas + texto da OP + OC do Kick Off + o que está nas notas).
**Excel** (`/api/cliente/faturamento/excel`): folha "Pedidos" (uma linha por OC) e "Notas por OC" (bloco
por pedido com subtotal e saldo), padrão `lib/excel-relatorio` com datas como data.

Demonstração de 16/09: `jose.neto@tmsa.ind.br` ficou com o papel nas OP-089, 103 e 106 (auditado);
o Vitor decide se mantém. Ver [[torg_referencias_cliente_aditivo]] (as OCs cadastradas na OP).
