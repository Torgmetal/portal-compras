---
name: torg_relatorio_us
description: Relatório de ultrassom (RUS) — a tabela lista a indicação REPROVADA (PI-QUA-003 15.1) E toda peça ensaiada (sem indicação = linha própria, laudo A); tela grava `marca`/`comprimento`, PDF traduz
metadata:
  type: project
---

**RUS-113-001 (25/09/2026)** — Vitor, pela foto do link de assinatura: *"as informações não estão sendo
colocadas na tabela abaixo no relatório de ultrassom; exemplo: nem a peça foi enviada para lá"*.
Era o ÚNICO relatório de US do portal (aprovado, `linhas` vazio, enviado para assinatura sem ninguém
ter assinado).

**Três causas, todas no caminho tela → PDF (`linhasTabelaUS` em `lib/us-relatorio.js`):**
1. A tela e o Campo gravam a peça em `marca`; o PDF lia `peca` — "Identificação da Peça" saía
   vazia até em indicação lançada.
2. A tela pede "Compr. reprovado (mm)" e grava em `comprimento`; o PDF imprimia na coluna
   "Compr. Inspec." e a "Compr. Reprovado" ficava vazia. Comprimento inspecionado nenhuma tela pede —
   fica em branco (regra do Vitor de 22/08: campo sem fonte fica em branco).
3. ⚠⚠ Só a descontinuidade REPROVADA vira linha (PI-QUA-003, item 15.1 — decisão de 22/08, segue
   valendo). Relatório aprovado imprimia a tabela vazia, sem dizer o que foi ensaiado. Agora toda peça
   sem indicação sai numa linha própria: peça, "—", ângulo do cabeçote, laudo **A** e
   "Sem indicação reprovável".
- ⚠ O "A" só sai com `resultadoInspecao` lançado: em rascunho a peça aparece sem laudo. O portal não
  afirma a aceitação antes do inspetor.
- ⚠ A frase não cabia a 6,2 pt (90 pt numa coluna de 67): a célula encolhe até 5,4 pt antes da
  reticência, com folga de 3%. No corpo exato, o `fit` cortava a última letra.
- As telas (FormUS e Campo) avisam, junto do aviso do 15.1, que a peça sem indicação sai com laudo A.
- A quantidade (`qtdPeca`, 12 na T113A1) NÃO sai no US. O EVS a mostra em "QUANT. DE PEÇAS".

O link de assinatura regera o PDF do banco a cada abertura — a correção valeu para o RUS-113-001 sem
reemitir. O arquivo final vai para o SharePoint quando é arquivado.

Relacionados: [[torg_qualidade]], [[torg_nao_declarar_furo]]
