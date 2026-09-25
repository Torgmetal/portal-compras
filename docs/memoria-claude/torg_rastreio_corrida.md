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

## 24/09/2026 — dois furos do motor, achados na OP-102 ("temos mais materiais, sem R no data book")

⚠⚠ **O dia do recebimento conta.** A comparação era por HORÁRIO: o CMR grava o recebimento ao meio-dia
UTC (4.153 de 4.153 linhas) e a ordem do Syneco começa à meia-noite de Brasília (03:00 UTC, 68.870 de
68.870). Toda peça cortada NO DIA em que o aço chegou caía em ESTOQUE. Agora `diaBRT` dos dois lados —
"até o dia do corte" é a regra; a hora nunca foi dado. Cortada no dia ANTERIOR continua ESTOQUE.

⚠⚠ **Corte provado pela etapa seguinte** (regra do Vitor de 09/09, [[torg_baixa_etapa_anterior]]).
Peça sem data própria de corte (Syneco corte/preparação, `corteConcluidoEm`, `dataProducao`) mas com
apontamento de montagem em diante — dela ou de um conjunto que a leva (`ConjuntoCroqui`) — foi cortada
ATÉ o primeiro desses dias. Esse dia vira o teto do FIFO e a linha sai com `corteInferido: true`. Na
OP-102 eram 25 croquis de ferro redondo FRØ3/4" em conjuntos montados, soldados e jateados, e o data
book dizia "aguarda corte". ⚠ O PDF da §02 não ganha marca nenhuma (regra de 22/08: frase é declaração
contra nós); a marca é para as telas internas.
Medido: 1.879 peças ganham R em 17 obras (OP-067: 1.662, livro EM_MONTAGEM). Livro já ACEITO afetado:
só a OP-106 (5 peças) — e a rota do PDF remonta o livro a cada download.

**OP-102 depois da correção:** §02 com 152 de 277 posições com R (eram 117). O que falta é LANÇAMENTO:
- **chapas** (85 croquis cortados entre 12/08 e 24/08, 104 posições): a chapa comprada para a obra
  (RM T102-002, **pedido 1719** da AÇOS MAQ) é **FATURAMENTO DIRETO** (nota para a QWS) e teve a entrega
  registrada à mão em 30/08 (`REGISTRAR_ENTREGA_PEDIDO`) — o que falta é a **LINHA NO CMR**
  (certificado → R). ⚠⚠ Eu disse ao Vitor que faltava "nota de entrada": ERRADO — o R não depende de NF
  em lugar nenhum; `statusEntrega "ATRASADO"` gravado pelo sync é "entregue com atraso". Se a chapa
  chegou antes de 12/08 (registro atrasado), lançar no CMR com a obra 102 e a data real resolve pelo
  FIFO; se chegou em 30/08, as peças saíram de outra chapa → "informar o R usado" na Liberação de
  material (que sugere um R de outra obra — o certo é o da chapa que foi para o corte);
- L6" (a RM diz ATENDIDO_ESTOQUE), HP250X62, TB 8" SCH40, W150X29,8: de estoque, sem R informado;
- 10 peças W cortadas em 12/08 com o CMR dizendo recebido em 13/08 — ou a data do CMR está um dia
  atrasada, ou saiu de outro aço.
⚠ A troca (`TrocaRastreabilidade`) é por PERFIL DA PEÇA, e na chapa o perfil leva a largura
(CH12.50X113, CH12.50X69…): informar o R da chapa de 12,5 é uma confirmação por largura.

⚠ **A NF não é cobrada no rastreio** (Vitor, 24/09/2026: *"vamos tirar essa regra de ter a NF informada,
pois principalmente esses da Aços Maq acaba sendo um problema"*). `conferir` (lib/rastreio-tratativa.js)
não põe mais "nf" nas lacunas do painel de rastreabilidade — faturamento direto nunca terá NF de
entrada da Torg. Pedido, data e OP continuam como aviso; certificado e corrida continuam bloqueando.
As outras NF obrigatórias (botão Receber do pedido; "já foi entregue" no link do fornecedor) ele NÃO
pediu para tirar.


**25/09/2026 — "importamos os certificados faltantes, mas ainda falta puxar" (Geraldo, OP-102).**
O CMR ficou SEM sincronizar de 23/09 a 25/09 (busca do Graph em 500; Matheus trocou a localização da
planilha pela pasta — `lib/cmr-localizar.js`). A rodada de 25/09 10:40 trouxe as 23 linhas com material
(11 da OP-102, R 261646–261656) e o casar-certificados das 10:50 ligou os 11 PDFs.
- ⚠ O PDF do certificado da planilha fica em `sharepointUrl`/`sharepointItemId`; `arquivoUrl` é de upload
  pelo portal. Conferir só `arquivoUrl` diz "sem PDF" para certificado que está ligado.
- ⚠ "Fora do portal" não é "faltando": R reservado sem descrição (casca) não vira registro, de propósito.
  Em 25/09 eram 172 cascas e 0 linhas com material pendentes.
- ⚠ A rodada que importou foi cortada no teto de 60 s DEPOIS de gravar — o `CronHeartbeat` seguiu dizendo
  "falha" com o trabalho feito. Conferir o banco antes de concluir que não rodou.
- OP-102 ficou com 266 de 277 posições com R. As 10 peças sem R (W150×18 ×5, W150×22,5 ×2, W200×35,9 ×3)
  foram cortadas em 12/08 e o material da obra (pedido 1721) entrou no CMR em 13/08: pela regra, veio de
  estoque. Saída: informar o R usado (troca) OU corrigir a data de recebimento no CMR se o material chegou
  mesmo em 12/08. Decisão do Almoxarifado/Qualidade.

**Resolvido (25/09, Vitor: *"pode usar esses mesmo resolva pelo amor de Deus esse data book"*).** Troca
`SEM_R` por perfil, com os certificados da PRÓPRIA OP (pedido 1721, NF 44914): W150X18 → R 261147,
W150X22.5 → R 261148, W200X35.9 → R 261153. Gravada em nome do Vitor, com o motivo, e `AuditLog`
`TROCAR_RASTREABILIDADE` — a mesma gravação da tela "Peça sem certificado". `SEM_R` só preenche a peça que
ficou sem R; as 9 peças desses perfis que o FIFO já tinha resolvido ficaram como estavam. Resultado:
**277/277 posições com R, 0 sem certificado.**
- ⚠ W150×22,5: as 7 peças somam 304 kg e o R 261148 recebeu 270 kg — no papel, o R cobre 34 kg a mais do
  que entrou. (W150×18: 130 de 216 kg; W200×35,9: 609 de 646 kg, dois R da mesma corrida.)
- ⚠⚠ **"Puxar certificados" da §04 é um RETRATO do clique.** Em 25/09, das 09h46 às 09h51, o botão rodou
  5× com "0 novos": os 11 certificados ainda não existiam no portal (CMR parado). Quando o CMR voltou,
  ninguém clicou de novo, e a §02 passou a citar 11 R cujos PDFs não estavam na §04. O PDF monta a §02
  AO VIVO (rastreio), mas a §04 só leva o que está VINCULADO. Conferir sempre: os R citados na §02 têm de
  estar todos na §04. Vinculados os 11 (mesma gravação do botão, `POPULAR_SECAO_MATERIAL_DATABOOK`).
- A tinta R 261393 (W-POLI HPD 451 cinza N6,5, OP 102, criada em 12/09) não está na §15: nunca foi
  vinculada nem removida. Cabe à Qualidade dizer se ela foi usada na 102.
