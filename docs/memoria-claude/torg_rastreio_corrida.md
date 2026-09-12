---
name: torg_rastreio_corrida
description: "Atribuir o R (rastreabilidade) a cada peça: LPC × CMR, FIFO pela entrega mais antiga, só peça cortada ganha R; lib/rastreio-peca.js"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-18T23:20:27.370Z
---

Ideia do Vitor (18/08/2026): dá pra **descobrir sozinho qual corrida/lote foi usada em cada
peça** cruzando a LPC com o CMR e usando a **data de entrega × data do apontamento de corte**.
Funciona — e na maioria das vezes **sem rateio nenhum**, porque cada material costuma ter uma
corrida só na OP.

`lib/rastreio-peca.js` — `rastreioDaOp(opNumero, opId)` e `rastreioDoConjunto(...)`:

- **Demanda** = `PecaConjunto` com `perfil` + a data em que foi cortada (`MesOrdem` op. 10/20
  com `produzidoUn>0`; fallback `corteConcluidoEm` / `dataProducao`).
- **Oferta** = `DocumentoQualidade` categoria MATERIAL da OP (rastreio, corrida, certificado, NF, pedido,
  peso, data), casada ao perfil por `casarPerfilComOmie`.
- **Regra**: a peça só pode ter saído de material recebido **até o dia do corte**.
- Situações: `R_DEFINIDO` · `AGUARDANDO_CORTE` · `ESTOQUE` (cortada antes de qualquer entrega) ·
  `SEM_MATERIAL`.

⭐ **O R é quem manda.** Vitor (18/08): *"você menciona muito corrida nos termos, mas para nós o R
é quem manda, ele que puxa as demais informações dos certificados. R = Rastreabilidade."* Corrida,
lote, certificado, NF, pedido e fornecedor são atributos **puxados pelo R** — nunca o contrário, em
tela, Excel, PDF ou conversa. Entrada do CMR **sem corrida NÃO é uma situação**: o R vale igual e o
campo sai escrito "sem corrida no CMR" (flag `semCorrida`) pra completar no Almoxarifado.

⭐ **FIFO pela entrega mais antiga** (regra do Vitor, 18/08): entre as entradas disponíveis no dia
do corte vale a de **entrega mais antiga**, gastando o peso recebido antes de passar à próxima.
É **política declarada de consumo**, não chute — foi isso que destravou o impasse do "provável"
(aquilo escolhia e *chamava de dúvida*; isto segue uma regra). `criterio: unica | fifo` fica
gravado e a tela lista as outras entradas disponíveis, explicando por que aquele R foi escolhido.

⭐ **Só peça CORTADA ganha R** — em aberto fica `AGUARDANDO_CORTE`, de propósito. Além de ser a
regra, conserta o FIFO: antes uma peça nem cortada "gastava" o lote de quem já tinha cortado.

🚫 Histórico: a 1ª versão marcava "provável" quando havia mais de uma candidata. Vitor barrou —
*"abre um precedente enorme para uma auditoria"*. O que o salvou não foi remover o FIFO, foi
**declarar o FIFO como regra da casa** em vez de apresentá-lo como evidência.

**Premissa declarada na tela** (verdadeira na Torg): material é comprado e recebido **por OP**
(RM por OP, CMR com coluna OBRA). Peça cortada antes de qualquer entrega cai em `ESTOQUE`
justamente porque a premissa não vale ali.

**Causa das indefinidas = duas corridas do mesmo perfil na fábrica ao mesmo tempo.** Concentram-se
em um ou dois materiais (OP-089: W150X22,5 e W150X13; OP-103: chapa 4,75). Só zera com registro
do nº R no momento do corte ou segregação física — é processo, não software.
- `rastreioDoConjunto` devolve os **croquis** que compõem o conjunto, cada um com sua corrida —
  é o formato que o Data Book precisa. Ver [[torg_qualidade]].

⭐ **O nº DA RASTREABILIDADE vem SEMPRE na frente da corrida e do lote** (Vitor, 18/08): é o
`DocumentoQualidade.importRef` = coluna **"ÍNDICE R"** do CMR (ex.: `261065`), preenchido em
3.705 de 3.705 linhas — é por ele que o Almoxarifado/Qualidade acha o material e o certificado.
Exibido como `R 261065`. Ordem canônica em qualquer tela/planilha/PDF:
**Rastreab. (R) → Corrida/lote → Certificado → …**. O Data Book (`lib/databook-pdf.js`) já abria
por "Índice R"; as telas do PCP e o modal do CompraChip foram alinhados depois.

**Nunca esconder "sem corrida"** — Vitor quer ver pra ir conferir: escreve "sem corrida" em âmbar
na linha (não traço), e o modal da OP conta quantas entradas estão assim. Com o nº R do lado, o
Almoxarifado acha e completa.

`GET /api/qualidade/rastreio/[opNumero]?marca=X` (marca = conjunto ou peça). No painel de
Liberar do PCP o chip de material abre a tabela; conjunto (sem perfil) tem o botão "corridas".

⚠️ **Armadilha do casamento de CHAPA** (corrigida 18/08): quando a descrição não traz a palavra
`ESPESSURA` — "CHAPA LQ A36 6,3x1500x3000" — o **1º número é a norma (A36)**, não a espessura.
Comparar com `nI[0]` fazia 6,40 casar com 36 e a peça saía "sem material". `lib/casar-omie.js`
agora tira norma/grau (`A36`, `A-36`, `A572`, `GR.50`, `ASTM`, `LQ`) e procura a espessura entre
os números < 100 mm. Na OP-089: peças com corrida definida 197 → 347, e as 124 falsas "de
estoque" zeraram.

Cobertura (18/08/2026, peças com perfil): OP-089 47% R definido (25 por FIFO) · 6% aguardando
corte · 48% sem material; OP-103 66% (57 por FIFO) · 17% aguardando · 14% sem material; OP-097 2%
— só 12 peças cortadas até agora, 61% aguardando corte (é a realidade da obra).
**O gargalo não é o algoritmo, é o lançamento**: perfil sem entrada no CMR daquela OP.
Ver [[torg_status_compra_cmr]], [[torg_qualidade_import_cmr]] e [[torg_desenho_rastreado]].
