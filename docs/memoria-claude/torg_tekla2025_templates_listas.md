---
name: torg_tekla2025_templates_listas
description: Listas dos templates novos do Tekla 2025 (abas "01/02/03 TORG_…", OP-105/120/124, John) — LE no padrão FORM 21 REV.00 com diferenças de forma; a LPC calcula PESO TOTAL = (2·QTDE−1)×unit e infla o peso gravado no portal
metadata:
  type: project
---

John (Engenharia) escreveu à EV em 28/09/2026: *"se for efetivar, depois temos que lembrar de alterar
na ISO"*. Vitor pediu (01/10) para conferir se as listas da OP-124 estavam fora do padrão. Elas saíram
dos **templates novos do Tekla 2025** (ambiente "Torg", PC do John, abas "01 TORG_Lista de peças",
"02 TORG_Lista de peças por conj", "03 TORG_LISTA DO PROJETO FORM21"). O mesmo template de LPC já
aparece na **T105D** (29/09) e na **T120B** (30/09).

- **A LE (T124-LE-R00) está no padrão do FORM 21:**
  - carimbo "(FORM 21 REV.00)" igual ao modelo e ao índice mestre;
  - mesmas colunas, cabeçalho e fórmulas da OP-121;
  - TOTAL fecha;
  - nome e pasta certos (2.6).

  Diferenças de forma:
  - a aba ganhou o prefixo "03 TORG_" (o import do portal lê do mesmo jeito);
  - o logo aponta para o caminho do Tekla 2025 (em toda LE do Tekla ele é link, não embutido);
  - a DESCRIÇÃO traz códigos (PL2-n, CS2-n, VM2-n) no lugar do nome da peça (COLUNA, SUPORTE, VIGA, como sai na exportação Syneco);
  - o cliente vem "STAHLDACH", mas o cadastro diz MARKO.
- ⚠⚠ **A LPC DO TEMPLATE NOVO CALCULA O PESO ERRADO: PESO TOTAL = (2·QTDE − 1) × PESO UNIT.**
  - **Exemplo:** T124A-P4 tem 4 × 1,03 kg e o arquivo traz 7,23 em vez de 4,12.
  - **Conferido em 01/10:** a T124A tem 129 linhas nesse padrão, a T105D 5 e a T120B 18. No template antigo ("036 VFI_…") a conta fecha: T118B 502 de 502 linhas e T94A 205 de 205.
  - **No banco:** os conjuntos da T124A somam **29.614 kg**, contra **21.255 kg** da LE da obra. T124A1 ficou com 97,18 kg (a LE diz 88,08) e T124A4 com 256,67 kg (a LE diz 159,30).
  - **Quem é afetado:** produção, programação de corte e metas em kg que leem a LPC. O peso da OP (`pesoRealPecas`) usa a LE e não é afetado.
- **O ponto da ISO:** se os templates novos forem adotados, o FORM 21 (modelo R00 e índice mestre) e o PO-13 precisam de revisão. O índice mestre ainda diz **REV 00**. A LE formatada pelo portal sai **Rev.01**, decisão do Vitor de 30/08 registrada em `lib/sgq-forms.js`; atualizar o índice cabe à Qualidade.
- **Pendente (decisão do Vitor):**
  - corrigir a fórmula no template do Tekla, reexportar T124A, T105D e T120B e reimportar no portal (a reimportação substitui só aquela fase);
  - fazer o import da LPC conferir PESO TOTAL contra QTDE × PESO UNIT.

Ver [[torg_listas_le_lpc]], [[torg_sgq_form_identificacao]], [[torg_peso_real_op]], [[torg_producao_e_lpc]].
