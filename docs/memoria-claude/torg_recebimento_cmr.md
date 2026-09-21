---
name: torg_recebimento_cmr
description: "Recebimento do material no Portal de Compras vem do CMR (não mais do Omie): conciliação FIFO por peso, origem CMR"
metadata:
  type: project
---

`lib/recebimento-cmr.js` + `/api/compras/recebimento-cmr` (modo `simular`). Roda junto do cron do
CMR (`/api/qualidade/cmr/sincronizar`, 12h) — com o CMR recém-atualizado.

**Por que existe** (19/08/2026): o material chega, o Almoxarifado lança no CMR com corrida/NF/peso,
e o Portal de Compras seguia mostrando "aguardando entrega" — **555 itens** com pedido gerado e
nenhum recebimento. O CMR já era a fonte do status por OP no painel do PCP
([[torg_status_compra_cmr]]); agora desce até o **item da RM**.

Regras (acertadas com Vitor):
1. peso em **KG**, item fechado com **≥95%** do solicitado (sobra e perda de corte são normais);
2. **FIFO** quando duas RMs pedem o mesmo perfil — abate da RM mais antiga;
3. origem própria **`CMR`** no enum `RecebimentoOrigem` (dá pra desfazer em bloco).

Aplicado: **52 itens, 77.443 kg, 46 fechados, 12 OPs**.

## A obra do CMR é digitada à mão — o PEDIDO é quem sabe

Vitor (07/09/2026): *"tem tinta da Induscolor na rastreabilidade da OP 105 e não temos tinta
Induscolor para essa obra"*. Estava certo: os R 261309/310/311 (INDUSLUX 170 + diluente, NF 25621,
pedido 1871) entraram como obra **105**, e o pedido 1871 no portal é da **OP-064 PIPE RACK
(BRASBIO)**, RM T64-014-R00 — os mesmos dois produtos que a 064 compra desde maio.

⚠⚠ **DIVERGIR NÃO É ERRAR.** Vitor, na mesma conversa: *"pode ter sido usado de estoque, isso você
já sabe que não é regra"*. Material comprado para uma obra é consumido em outra o tempo todo — para
tinta ele já tinha dito que pode, *"desde que bata a mesma especificação e cor"*. E o portal não
desempata: `EstoqueAlocacao` está VAZIA (07/09/2026), não há registro de consumo de estoque para
confrontar. Logo a trava **pergunta** ("consumo de estoque ou obra trocada no lançamento?"), nunca
afirma erro nem corrige. Neste caso a resposta veio dele, não do dado: *"a tinta eu tenho certeza
que não foi usada — não pode ser essa tinta, e nem chegou a tinta dessa OP ainda"*.

⏳ **Registrar a baixa de estoque é trabalho ACORDADO, não feito** — Vitor (07/09/2026): *"nada
ainda não registra, logo vamos registrar, tenha calma"*. Enquanto não existir, a trava fica como
pergunta. NÃO começar por conta própria; ele traz.

**Como conferir**: a coluna de obra do CMR é preenchida à mão pelo Almoxarifado; o portal já tem a
verdade em `PedidoOmie.numeroPedido → opId`. Cruzando `DocumentoQualidade.pedidoCompra` com ele:
**484 linhas comparáveis, 8 divergentes**, em dois incidentes — NF 25621 (105 × 064, tinta) e NF
43997 / pedido 1677 (092 × 097 Unipar, 5 perfis). Raro, então **avisar, nunca corrigir sozinho**: a
planilha é o registro ISO.

⚠ **Corrigir no portal FICA** — eu disse o contrário ao Vitor e estava errado. `reconciliarCmr`
preenche só campo VAZIO ("nunca sobrescreve o que já tem valor, o portal manda") e o sync do
SharePoint só CRIA linha nova (dedupe por `importRef`). O risco não é ser desfeito: é a planilha
seguir dizendo a obra errada, e ninguém ver a discordância — `appendLinhasCmr` só anexa linha que
falta, nunca atualiza a existente. Corrigir **nos dois**; a planilha é o registro ISO.

**A guarda (07/09/2026, commit e0fe3b8d)**: `lib/cmr-obra-divergente.js` cruza `pedidoCompra` com
`PedidoOmie.numeroPedido → opId`. Ligada na importação (cron, pega as linhas novas) e na
rastreabilidade de pintura (`cadernoDePintura` devolve `obraDivergente`; o aviso sai no topo das
folhas 1 e 2 do Excel). Só compara quando o pedido é numérico e o portal o conhece — a planilha
escreve "N/A", "N / A", "OR 15950".

⚠ Sem PLP a rastreabilidade de tinta não tem como recusar nada: `cadernoDePintura` lista TODA
entrada de tinta com o `opNumero` da obra, sem comparar com especificação nenhuma — e a OP-105 não
tem PLP. Ver [[torg_pintura_tinta]].

## 🚨 Regra de DATA — a mais importante

**Material recebido ANTES do pedido não pode ser a entrega dele.** Vitor (19/08): *"pode ser a
mesma especificação, mas para fabricar essas peças em questão tivemos que comprar novos
materiais… se tivéssemos um controle de estoque real, aí tudo bem trazer essa informação de datas
antigas, mas nesse caso precisamos comprar tudo novo"*.

Na 1ª rodada **20 dos 54 lançamentos** casaram entrada anterior ao pedido — um com **299 dias**
(material de out/2025 creditado a pedido de jul/2026). Na **OP-084** a RM **T84-010**, feita em
18/08, ganhou crédito de uma entrada de **17/06**: era a compra NOVA, e o portal dizia que já tinha
chegado. As T84-001/003 (pedido 03/06, material 10–22/06) continuam fechando — essas são entrega de
verdade.

**Sem controle de estoque real, mesma especificação NÃO é o mesmo material.** A data do pedido
(`pedidoOmie.createdAt`, senão `rm.createdAt`) é a única barreira objetiva; folga de 3 dias.

Resultado: **52 itens, 77.443 kg**.

⚠️ **Dois bugs de idempotência que só aparecem COM a barreira de data:**
1. descontar o já-recebido do grupo pelas **entradas mais antigas** não fecha — o item não podia
   ter usado as antigas, e a 2ª passada liberava as novas de novo. Cada item **reconsome das mesmas
   entradas elegíveis** antes de pegar o que falta;
2. sobra de fração criava recebimento de **0 kg** que, por nunca fechar o item, era recriado em toda
   passada. **Piso de meio quilo.**

🚨 **TETO = peso do CMR do grupo MENOS tudo que os itens do grupo já receberam** (qualquer origem).
Descontar só por item **não** é idempotente: na 2ª passada o saldo reinicia cheio e os parciais são
completados de novo, creditando material que não chegou. Custou apagar e refazer os 56 primeiros
lançamentos.

## Quem dá baixa em quê (`lib/recebimento-fonte.js`)

Vitor: *"para deixarmos o Omie apenas para esses itens seria um problema?"* — não é. **Cada fonte
manda onde de fato sabe**:

| domínio | itens | quem baixa |
|---|---|---|
| material que o Almoxarifado lança no CMR | **756** (500.642 kg) | **CMR** — o Omie não escreve |
| cobertura/piso comprado pronto + consumível de oficina | **93** (2.918 kg) | **Omie** |

Pro Omie vão: **telha, calha, rufo, cumeeira, pingadeira, grade de piso, degrau, grelha, gradil,
grating** (Vitor 19/08: *"grade de piso, telhas, calhas e rufos seria bom também fazer por sync"* —
chegam prontos, sem corrida) **+** consumível de oficina e serviço (bico de cola química,
prisioneiro, autobrocante, eletrodo, luva, disco de corte, rolo de espuma).

⚠️ **`CHAPA XADREZ COSIPISO` fica no CMR** — é piso, mas é chapa de aço que a gente fabrica, tem
corrida e está lá (1.969 kg só na OP-103). A lista é de **produtos**, não da palavra "piso". Pela
mesma razão `telha` e `grade` **não** podem estar na regex de aço (estavam, e forçavam o contrário).

**UM DONO POR ITEM**: `conciliarRecebimentoCmr` pula o que é do Omie, senão as duas rotinas lançam
recebimento no mesmo item.

Por que o Omie não pode opinar sobre o primeiro grupo: ele marca recebimento que o CMR não
confirma — em **10 grupos** diz que chegou MAIS do que o Almoxarifado lançou; na OP-097 são
**6.233 kg** de perfil H contra **445 kg** no CMR. Os 286 lançamentos antigos **ficam como
histórico**: apagá-los faria item já recebido voltar a "aguardando". Datas de entrega e status do
PedidoOmie seguem vindo do Omie.

🚨 **Premissa que eu tinha errada: parafuso, porca, arruela e diluente ENTRAM no CMR** — 406 linhas
de PARAFUSO SEXT, 217 de ARRUELA LISA, 134 de PORCA A194, 89 de DILUENTE. Os itens de parafuso que
não casam na conciliação são compras que **ainda não chegaram**, não material fora do CMR. Se o
Omie tivesse ficado "cuidando dos parafusos", estaria baixando material que o CMR contradiz.

A lista de "o que passa pelo CMR" sai **do próprio CMR** (famílias = 2 primeiras palavras das 3.705
linhas, cache de 10 min), não de cadastro à mão — material novo lançado sai do domínio do Omie no
dia seguinte. Guarda extra `RX_ACO`: descrição com cara de aço (`PERFIL`, `CHAPA`, `W150X22.5`)
fica com o CMR **mesmo que a família não apareça lá**, porque a descrição pode estar escrita de um
jeito que o parser não reconhece.

⚠️ **Casa só por descrição IDÊNTICA dentro da mesma OP.** Casamento por perfil aproximado
(`casarPerfilComOmie`) acerta 1–2 por OP e o custo de errar é alto: marcar como recebido material
que não chegou trava a compra e para o corte.

⚠️ Item cujo material ainda **não chegou** simplesmente não é fechado por ninguém — nem CMR nem
Omie. É o estado correto: 200 dos 555 em aberto estão nessa situação.
