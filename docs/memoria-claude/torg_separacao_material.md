---
name: torg_separacao_material
description: "Lista de separação de material do PCP: agrupa por perfil com barras/peso e o R de cada material, com troca do R no ato da separação"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-19T01:58:17.097Z
---

Botão **"Separação"** no painel de Liberar do PCP (`/api/pcp/separacao`,
`app/pcp/dashboard-prioridades/SeparacaoModal.jsx`). Sai da OP inteira ou **só das peças
selecionadas** — o botão mostra a contagem.

Pedido do Vitor (19/08/2026): *"precisa conter tipo do material, quantidade de barras, pesos
unitário e total e o principal a Rastreabilidade do material — será em cima disso que vamos
liberar e garantir que os materiais que estamos usando são de fato os Rs"*.

Agrupa por **PERFIL** (é como se separa no estoque): perfil · aço (A36/A572) · peças · **barras
(6 m)** + comprimento total · peso un. · peso total · **R** · e o que o R traz (corrida,
certificado, NF, fornecedor, data).

⭐ **Troca do R**: *"pode ocorrer que no ato da separação um fardo que esteja mais fácil de ser
retirado esteja acima do que de fato é o R indicado"*. Cada linha tem um select com **todos os Rs
daquele material no CMR — inclusive de outras OPs** (é justamente o fardo mais acessível). Trocou
o R, corrida/certificado/NF/fornecedor/data mudam junto — quem manda é o R
([[torg_rastreio_corrida]]). A linha trocada fica destacada e o papel registra "indicado era R xxx".

⚠️ **Barras** = mínimo pelo comprimento total em barra de 6 m; **não** considera perda de corte.
Chapa não tem barra — ali vale o peso. Está escrito na tela pra ninguém tratar como exato.

## Fluxo acordado (Vitor, 19/08/2026)

1. **PCP gera a lista** (OP inteira ou só as peças selecionadas) e exporta o Excel — coluna
   "Conferido (visto)" pra assinar.
2. **Almoxarifado separa** com o papel. Pegou o fardo indicado → **nenhuma ação**. Pegou outro →
   anota o R que saiu.
3. **Só havendo troca**, o **PCP registra** no portal (decisão do Vitor: *"pcp registra"* — o
   almoxarifado não precisa de acesso; nada de tela separada pra ele). O botão
   "Registrar N troca(s)" só aparece quando há pendência.
4. Registrada, a troca **vence o FIFO** em tudo: painel de Liberar, carimbo do desenho, GRD e
   Data Book.

`TrocaRastreabilidade` (uma linha por OP+perfil): `rIndicado` · `rUsado` · motivo · quem · quando.
**Só existe linha quando houve troca.** Em `lib/rastreio-peca.js` isso vira `criterio: "troca"` —
o R deixa de ser regra de consumo e passa a ser **fato observado**, que é o que sustenta auditoria.
O R trocado pode ser de **outra OP** (o fardo mais acessível veio de outro lote), então a entrada
do CMR é buscada pelo R sem filtrar por OP.

## Matcher: perfil HP e ferro redondo (corrigido 19/08)

Montando a lista da OP-067 apareceram dois furos em `lib/casar-omie.js`:
- **HP não era reconhecido**: `HP250X62` (38.851 kg, a maior linha) saía sem material. HP entrou na
  família W — e, principalmente, **HP e W agora têm que concordar**: `HP250` e `W250` são seções
  diferentes com a mesma bitola, casar uma na outra seria pior que não casar.
- **Ferro redondo da Engenharia** (`FRØ3/8"`) não caía em REDONDO.

O matcher roda contra as **1.135 descrições distintas** do CMR, não as 3.705 linhas — 219 perfis em
185 ms. Ver também a armadilha da chapa sem "ESPESSURA" em [[torg_rastreio_corrida]].

## Saldo do R — "recebido" não é "disponível" (19/08/2026)

Vitor: *"na OP-84 você mostra os materiais como ok e data do dia 18/06; nesses casos o material foi
usado para os projetos anteriores — precisa ficar como sem material, ou na separação informar qual
R vai ser usado"*.

🚨 **O CMR é registro de ENTRADA, não de estoque.** "Recebido em 18/06" não quer dizer que a barra
está no pátio hoje. Na OP-084: R 260788 entrou com **13.272 kg** e tem **78 kg** de saldo; o 260789,
**44 kg** de 6.240; o 260817, **48 kg** de 1.125. Quem ia separar via só a data e ia procurar fardo
que não existe mais.

Cada R agora traz **entrou / comprometido / saldo**; esgotado (<5%) sai marcado, com sugestão dos R
que ainda têm material (da OP ou de outra). Vai também na planilha, coluna "Saldo do R".

O saldo sai do **próprio motor de rastreio** — soma do `consumidoKg` das peças atribuídas àquele R.
Não é estimativa nova: é o mesmo número que decide o R de cada peça ([[torg_rastreio_corrida]]).

⚠️ **Não mexer no recebimento do Compras por causa disso**: a compra FOI recebida em junho, marcar
"sem material" lá seria falso ([[torg_recebimento_cmr]]). O que era falso era tratar *recebido* como
*disponível*.

**24/08/2026 — duas mudanças:**
- O modal virou **`components/SeparacaoModal.jsx`** (era `app/pcp/dashboard-prioridades/`): serve o painel da TV **e** a lista nova `/pcp/producao` [[torg_prioridades_setor]]. Com peça marcada sai só das marcadas; sem marcar, da OP inteira.
- 🚨 **Material sem R agora diz qual VAI usar.** Vitor: *"no caso das peças que estiverem sem o R deve ser informado qual será usado"*. Só peça CORTADA ganha R carimbado [[torg_rastreio_corrida]], então material não cortado cujas entradas do CMR não são desta OP saía **em branco** no papel — mandando o Almoxarifado escolher o fardo por conta. Agora `rIndicado` cai para a previsão **FIFO** (entrada mais antiga com saldo, mesmo de outra OP) e vem com `rPrevisto: true`.
  - ⚠️ **Previsto vai MARCADO** na tela e na planilha (`R 260682 (previsto)` + contagem no subtítulo). "Vai usar" e "usou" não podem parecer a mesma coisa no papel de quem separa.
  - ⚠️ **Previsão só dentro da PRÓPRIA OP.** Estendi o FIFO ao CMR da empresa e o resultado foi apontar R de **2025, de OPs encerradas**, como material a separar — saldo de R de outra OP é `null` por construção (o consumo é contado na OP dele), então nem dá para saber se o fardo existe. Sem material desta OP: **"A DEFINIR"**, e o Almoxarifado escolhe + registra a troca.

🚨 **O matcher tem de casar com o material DESTA OP primeiro (24/08/2026).** `casarPerfilComOmie` escolhe UMA descrição e as opções são as linhas do CMR com aquela descrição EXATA. Rodando contra o CMR inteiro, casava com a redação de outra obra: `TBØ42.40X2.65` da OP-089 ia para *"TUBO AC CC 42,4 X 2,65mm"* (OP-028) enquanto a OP-089 tinha *"TUBO REDONDO (42,40) X 2,65MM"* (R 260810) comprado para ela — e a OP sumia das opções. Agora casa **duas vezes**: `comoItensOp` (só esta OP) e, só se falhar, o CMR da empresa. Medido: 22 materiais da OP-089 apontavam fardo de outra OP → **zero**.

⚠️ Sobram ~24 materiais em "A DEFINIR" na OP-089: perfis que o matcher não liga a descrição nenhuma do CMR da obra (`FRØ1/2"` × "BARRA REDONDA ACO CARBONO LAMINADA"). É **lacuna de vocabulário do cadastro**, não conta errada — chutar ali repete o erro acima.
