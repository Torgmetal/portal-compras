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

**O cabeçalho inteiro editável (25/09/2026)** — Vitor: *"no campo de desenho e metal de adição não está
sendo possível preencher (…) tipo de chanfro tbm, todos os campos precisamos deixar para ser possível
ajustar"*. No computador desenho e metal já se preenchiam. O buraco era o CELULAR, onde o inspetor
trabalha: sem desenho, material e espessura (a rota do celular nem gravava os dois últimos), e com
chanfro e processo presos a listas fechadas.
- `CAMPOS_CABECALHO_US` (`lib/us-campos.js`): os 24 campos que o PDF imprime, com grupo e `sugestoes`.
  As duas telas, as duas rotas e o `campo-condicoes` leem daqui. O teste `us-cabecalho-campos` cobra que
  cada um tenha entrada e saia no PDF.
- ⚠ A lista da casa virou SUGESTÃO (`<datalist>`): escolhe-se ou digita-se ("1/2 V", "K", "SMAW"). Só o
  tipo de estrutura segue lista fechada, porque tem dois valores pela norma.
- Campo vazio mostra, APAGADO (placeholder), o que vai sair no PDF: o TAG da peça, a AWS D1.1, a marca
  e as medidas decompostas do cabeçote.
- Fabricante e modelo do cabeçote viraram campos próprios, sem a lista agrupada. O Doppler × Mitech
  de 22/09 deixa de existir: a marca não é mais adivinhada pelo rótulo.
- ⚠ O desenho aceita até 500 caracteres nas duas rotas (`limiteDoCampo`); o resto segue 120. Por isso o
  celular pode carregar e devolver `desenho` e `procedimento` sem cortar. Hoje o maior desenho gravado
  tem 34 caracteres.
- `camposCabecalhoUS` decompõe o rótulo da lista ("angular 20x22 · 70 · 2 MHz") mesmo com dimensão ou
  frequência ajustadas à mão; senão o MODELO sairia com o rótulo inteiro.
