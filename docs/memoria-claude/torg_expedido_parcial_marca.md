---
name: torg-expedido-parcial-marca
description: "Portal Compras Torg — quanto de cada marca já embarcou vem POR ROMANEIO (lib/expedido-por-romaneio.js); o booleano expedidoRomaneio fazia marca pela metade sumir da próxima carga"
metadata:
  type: project
---

**22/09/2026.** Larissa (PCP), emitindo o romaneio da OP-067: *"ele não reconheceu 3 peças T67F62,
T67F65 e T67F80. Esses itens eram 2 peças de cada marca, e uma peça de cada foi enviada no romaneio
24, o portal entende que as peças já foram expedidas e não aparece para que eu possa selecionar, ou
ele ignora quando subo a lista."*

⚠⚠ **A LEITURA DOS ROMANEIOS DA PASTA JOGAVA A QUANTIDADE FORA.** `marcasExpedidasOP`
(`lib/lista-avancada-sharepoint.js`) abre cada FORM 22 de `4. Expedição/4.2 Romaneios`, soma o PESO
e guarda os números — mas descartava o `qtd` de cada linha e gravava na marca um **booleano**,
`expedidoRomaneio: true`. Marca de 2 peças com 1 embarcada virava marca inteira: `pendente = 0`, a
linha sai do filtro e, quando a lista é importada por arquivo, o item entra no prévio com `qte: 0`.

**Medido antes de mexer:** 9.531 marcas em lista, 4.656 com romaneio, **1.904 delas com qte > 1**
(50.342 peças) dependendo desse booleano. Nos 20 romaneios da OP-067 **nenhuma linha está sem
quantidade** — o dado sempre esteve lá. Simulando a leitura nova na OP-067: 1.590 marcas confirmam
inteiras, **33 são parciais e 41 peças voltam a aparecer**.

A regra agora mora em **`lib/expedido-por-romaneio.js`** e é usada pela importação da lista, pela
API de marcas e pela de produção da OP:

- ⚠⚠ **MÁXIMO POR ROMANEIO, NUNCA SOMA ENTRE ARQUIVOS.** Medido na OP-067: "08. ROMANEIO" e
  "09. ROMANEIO … R1" trazem o mesmo número 08 e os mesmos 22 itens (idem 14/15 e 21/22) — é a
  carga revisada salva noutro arquivo. Somando, a obra embarcaria duas vezes no papel.
- ⚠⚠ **O ROMANEIO EMITIDO PELO PORTAL TAMBÉM VIRA ARQUIVO NA PASTA** (na OP-067 o prévio 27 está
  emitido *e* existe "Romaneio R27" na 4.2). Por isso as duas fontes se fundem **por número**, com o
  portal mandando no que é dele — somar contaria a mesma carga duas vezes.
- ⚠ `numeroDoRomaneio` ignora revisão e zero à esquerda ("14R1" → "14", "R13" → "13", "08" → "8"),
  o mesmo critério da numeração do próximo prévio.
- ⚠ **Linha sem quantidade vale 1** — é uma linha de romaneio; tratá-la como zero apagaria do
  embarque uma peça que saiu.

⚠⚠ **A LISTA PRECISA SER REIMPORTADA POR OBRA** (botão *Atualizar da pasta do servidor*, na seção
Lista de Expedição da OP): o `expedidoPorRomaneio` nasce na importação. Lista importada antes de
22/09/2026 continua caindo no booleano — de propósito, para nenhum número mudar sozinho.

⚠ **O que NÃO mudou, e é o próximo passo:** `ListaExpedicao.pesoExpedido`/`pesoFaltante`,
`expedidasArquivo` e `pesoFaltanteReal` (`lib/expedicao-estrutura.js`, que alimenta o avanço da
Expedição no cronograma) continuam contando a marca inteira pelo booleano. Ficou fora porque mexe
no avanço de todas as obras e merece medição própria.

⚠ Na OP-067, 45 marcas aparecem com embarcado **maior** que a quantidade da LE (ex.: T67A86, LE diz
2, romaneio 7 diz 4) — reenvio, LE revisada para menos ou erro de digitação no romaneio. A API
limita ao total da marca (`Math.min`), então elas seguem como expedidas.

Ver [[torg_status_obra]], [[torg_import_romaneios]], [[torg_romaneio_carga]].
