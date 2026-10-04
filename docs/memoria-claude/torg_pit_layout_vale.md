---
name: torg_pit_layout_vale
description: O PIT segue o layout do PIT da Vale (OP-122) de agora em diante, inclusive no Anexo I da proposta; o PDF atual do portal (faixa azul, 8 colunas) não é esse layout; PIT de cliente com "proibida a reprodução" não se converte
metadata:
  type: project
---

Vitor (04/10/2026), ao ver o Anexo I da prévia da proposta sair no PDF atual do portal:
*"O pit não está nesse formato, falamos de usar de agora em diante o modelo igual criamos para o da
Vale naquele mesmo layout"*.

**O modelo da Vale** é o PIT do cliente (TMSA/Vale, `TPR00751-008-00103`) convertido pelo Codex para o
layout Torg, preservando todas as informações dele (sessões do Codex de 16 e 17/09/2026). A prévia
aprovada está no Mac, fora do git: `output/pdf/PIT-OP-122-Torg-R0.pdf` (ReportLab, A4 paisagem, 21
folhas). Estrutura:
- cabeçalho com título, linha de contexto (`OP-122 / TMSA - VALE / TR 36 - OS 01`) e origem/revisão à
  direita;
- Identificação da obra;
- Histórico de revisões: Rev. | TE | Descrição | Por | Ver. | Apr. | Aut. | Data;
- Tipos de emissão A–H (no anexo de proposta vale **D - PARA COTAÇÃO**);
- Documentações de referência;
- Atividades de inspeção em hierarquia (1.0 → 1.1 → item 1.1.1), um cartão por item com 9 colunas:
  Item | Descrição da atividade | Documentos aplicáveis | Local de inspeção | Abrangência/amostragem |
  Critério de aceitação | Ponto fornecedor | Ponto cliente | Registro;
- linhas de Comentários por item;
- Notas e legenda.

⚠⚠ **O PDF que a aba Qualidade gera hoje NÃO é esse layout.** `lib/plano-cliente-pdf.js` tem a faixa
azul e 8 colunas (o modelo de 26–28/08). Passar o PIT para o layout da Vale é trabalho pendente — e o
Anexo I da proposta tem de sair do mesmo gerador, senão os dois divergem.

**Os 5 padrões (`PIT_PADRAO`) no layout da Vale** — conversão usada na prévia da proposta (04/10):
- documentos aplicáveis e critério de aceitação = o critério do padrão (o PIT da Vale também repete);
- abrangência = o percentual (`pctAvaliado`);
- Ponto Torg / Ponto cliente = os códigos TORG / CLIENTE, por extenso pela legenda;
- registro = NOTAS quando há (padrão BÁSICO), senão o significado do código (RI, DB, CT, X);
- ⚠ **local de inspeção NÃO existe no padrão.** Foi DERIVADO por etapa ("FO = Torg / Recebimento",
  "… / Durante a fabricação", "… / Antes da fabricação" para EPS/RQP…) e **a Qualidade precisa
  confirmar** antes de virar regra;
- linha sem número de item continua o item de cima (célula mesclada no Excel da Qualidade) e herda
  tipo, percentual e critério. No padrão BÁSICO essas mesmas linhas vêm preenchidas, o que confirma.

⚠⚠ **PIT × escopo:** se a proposta põe ensaios não destrutivos nos Exclusos, LP e US do PIT saem
"N.A. — fora desta proposta". O PIT Torg pede 10% de LP e US, e a 328 os exclui: anexar o padrão cru
faria a proposta prometer o que ela mesma exclui.

⚠⚠ **PIT de cliente com reprodução proibida não se converte.** O `PR-QUA-011` da TMSA (pasta
3.Documentos do orçamento 328-26) diz "É absolutamente proibida a sua reprodução, total ou parcial,
sem a prévia autorização da TMSA". Nesses casos a proposta cita o documento ("atendido conforme a
ETC") e anexa o PIT Torg. O PIT da Vale era de projeto, emitido para o fornecedor seguir; este é
procedimento interno da TMSA.

Ver [[torg_escopo_proposta]] e [[torg_marca_bv]].
