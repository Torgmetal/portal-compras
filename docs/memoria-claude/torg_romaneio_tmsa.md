---
name: torg_romaneio_tmsa
description: Obras da TMSA emitem o romaneio no modelo FOR-081 dela (Excel do próprio modelo + PDF desenhado da planilha), salvos na 4.2 Romaneios; TAG por peça, OC por TAG, volumes da simulação
metadata:
  type: project
---

**Pedido (Vitor, 15/10/2026):** "implantar para as obras da TMSA esse padrão de Romaneio", só nelas. O modelo dele é o
FOR-081 da TMSA (`Modelo_Romaneio.xls`). **Layout exato, não pode mudar nada.** Excel e PDF, os dois na pasta de
expedição da OP (`4. Expedição/4.2 Romaneios`). Nas obras TMSA **substitui** o FORM 22.

**Regras (todas dele):** Nº = sequência 1, 2, 3 por OP (o `RomaneioPrevio.numero`); data do embarque = a da EMISSÃO;
referência de projeto = "TPR / OP-nnn"; campo livre = dados da Torg (`DADOS_TORG`, em 3 linhas: I1, I3, I4, porque
a 18 pt numa linha só invade a coluna do peso); tipo = "VOLUME n"; dimensões = as da simulação de carga (opcional,
"Seguir a simulação"); peso bruto = peças + madeira, **625 kg/m³** (média de eucalipto e pinus, "não precisa ter 100%
de certeza"); TAG = número da TMSA **por peça** (`EtiquetaCampoExtra.tagCliente`, lista de equivalência); quantidade =
o que vai de fato; código = **a OC da TAG** ("OCs diferentes para a mesma obra — as TAGs são para cada OC"),
lida das Referências da OP (`OPReferencia`: pedido → [item] → tag); descrição = nome da peça + marca Torg.

**Código (`d5abfb00`):** `lib/romaneio-tmsa.js` (montagem, pura), `-dados.js` (TAGs, OC, TPR, volumes da última
`CargaSimulada`), `-excel.js` (preenche `lib/templates/romaneio-tmsa-for081.b64.js`: o .xls convertido em .xlsx pelo
Excel do Mac via AppleScript), `-pdf.js` (desenha o PDF LENDO a planilha preenchida, porque a Vercel não tem
Excel/LibreOffice; A4 paisagem, repete as linhas 6–8). Rota: `lotes-expedicao/[loteId]/romaneio` (ramo `ehObraTmsa`).
O simulador grava `itens: [{marca, qtd}]` por volume. Simulação antiga só vale onde o volume tem uma marca.

⚠ **Dado que falta (15/10/2026):** nenhuma OP da TMSA tem as Referências (TPR, OC→TAG) cadastradas. Só a OP-105 tem
TAG por peça (1.663). A OP-105 tem 2 OCs no `refCliente` (233707-1, 233708-1), sem dizer qual TAG é de qual. Quem
cadastra é o Comercial. A simulação da OP-105 R2 tem 12 volumes com várias marcas: precisa simular de novo.

**15/10/2026 (fim do dia), TPR e OC estão nos documentos da TMSA na pasta da obra:** cada OC tem a sua **ETC** (FOR-1155)
em `2. Engenharia/2.1 Projetos Orçados/OC<nº>_…/ETC-00846-xx*.xls`, com `Pos | Descrição | Qtd | Desenho | TAG | …` e
"Nº TPR: TPR00846". O nome da pasta da OP também traz o TPR ("OP-105 - TMSA - TPR 846 - Bianchini"). Na OP-105, a
TC 4708 está em DUAS OCs (228631 = quadro do vazador 72118932-1; 228630 = longarinas e apoios), por isso a regra é
TAG + desenho. As OCs R1 (234182 e 234172) repetem as ETC-31/32: **vale a OC original** (233707/233708), decisão do
Vitor. PENDENTE: o leitor de ETCs no romaneio (aprovado, ainda não feito).
