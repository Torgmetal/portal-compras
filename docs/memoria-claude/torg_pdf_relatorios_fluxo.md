---
name: torg_pdf_relatorios_fluxo
description: PDFs dos relatórios de inspeção — san é texto de UMA linha (TAB derrubava tudo); folhas que fluem (relatorio-fluxo-pdf) com assinatura em toda folha e "FOLHA x DE y" no fim; conferir PDF com sips, não pdftoppm
metadata:
  type: project
---

Verificação dos 10 modelos do SGQ (Vitor, 02/10/2026: *"coloque mais de um agente para verificar todos os modelos e
gerar relatórios de teste para garantir que não tenha nenhum erro"*). O que vale para TODO gerador de relatório
(`lib/relatorio-*-pdf.js`, moldura comum em `lib/relatorio-form-pdf.js`):

- ⚠⚠ **`san` É TEXTO DE UMA LINHA.** Um TAB colado do Excel (ou quebra de linha, ou caractere C1) fazia o
  `widthOfTextAtSize` estourar "WinAnsi cannot encode" — e caíam prévia, link de assinatura, arquivamento e data book.
  Controle e quebra viram espaço; parágrafo é com `quebrarTexto`, que separa ANTES do `san`. Medir largura de texto
  cru (sem `san`) é o mesmo defeito: o EVS e o dimensional faziam isso. Teste: `relatorios-texto-hostil`.
- **Símbolo que muda o sentido vira equivalente** ("≤" → "<=", "≥" → ">=", "μ" → "µ", "→" → "->"); os extras do
  cp1252 (€ • ™ …) a fonte escreve e passam.
- **Palavra mais larga que a coluna** é partida no separador ("/", ",", ";", "-"), nunca no meio da marca;
  `linhaInfoCresce` encolhe a letra até 6 pt antes de partir.
- ⚠⚠ **FOLHAS QUE FLUEM** (`lib/relatorio-fluxo-pdf.js`, `criarFluxo`): cada bloco reserva o espaço antes de desenhar;
  o que não cabe abre a folha seguinte. As assinaturas têm o espaço reservado no pé de TODA folha (regra da pintura) e
  saem logo abaixo do conteúdo; o cabeçalho é desenhado NO FIM, quando o total de folhas é conhecido. Altura fixa sem
  conferir espaço foi a causa de: assinatura fora do papel (US, EVS, LP, pintura), observação cortada sem aviso (todos).
  Sais e poeira usam o fluxo desde `9fa3355e`.
- `blocoTexto` agora CRESCE até `linhas` e devolve o que não coube; `alturaTexto`, `alturaInstrumentos`,
  `alturaAssinaturas` e `medirInfo` (linha de identificação, função pura) dão as alturas para quem reserva antes.
- **Dimensional** (`8d6a3deb`): o corpo é o que sobra DEPOIS da identificação e dos comentários, desenho a desenho;
  comentário que não cabe vai para uma "folha de comentários" no fim. ⚠ O RESULTADO lê `resultadoInspecao` antes do
  campo do formulário — e a reinspeção limpa resultado/verificações (dimensional) e laudo/espessuras (pintura).
- ⚠ **Título de coluna de UMA palavra encolhe, não quebra** ("Toleranci/as" foi o que a quebra fez).
- ⚠⚠ **PARA OLHAR O PDF: `sips -s format png arquivo.pdf --out x.png`** (PDFKit do macOS). O `pdftoppm` e o leitor de PDF
  do Claude NÃO desenham a Helvetica padrão (não embutida) — a folha sai só com caixas e fotos, parecendo defeito do
  gerador. `sips` só faz a 1ª folha: separe as outras com pdf-lib (`copyPages`).
- **Teste que vale:** gerar o PDF e LER DE VOLTA com `unpdf` — texto (`extractText`) e posição
  (`getDocumentProxy` → `getTextContent()`, `transform[5]` = y). "Todo texto entre y=28 e altura−28" pega o que sai do papel.
  ⚠⚠ **E EXIGIR QUE O TEXTO ESTEJA LÁ:** o pdf.js NÃO devolve texto desenhado abaixo de y=0. O teste de
  limites passava com 12 instrumentos sem provar nada — o nome de quem assinou tinha saído do papel e
  simplesmente não aparecia. Cobrar o nome e a data de quem assinou em CADA folha.
  ⚠ O "µ" da WinAnsi volta do pdf.js como "μ" (U+03BC): comparar com isso em mente.
- **02/10/2026 — os 8 geradores passaram pela verificação.** Sais, poeira, LP, EVS e pintura usam o
  `criarFluxo`; o US (folha deitada) e o dimensional (corpo que ocupa a sobra) fazem a mesma conta à
  mão. Todos: assinatura em toda folha, "FOLHA x DE y" contando fotos, nada cortado com "…" em dado
  de documento (descrição de cota além de 2 linhas e legenda de foto além de 3 ainda cortam).
- **Travas de assinatura** (`pendenciasParaAssinatura`): LP, EVS e US não tinham nenhuma até 02/10/2026
  (o EVS-102-001 foi sem junta). Regras em `lib/lp-campos.js`, `lib/evs-campos.js`, `lib/us-relatorio.js`;
  dimensional/pré-montagem passaram a exigir as 3 verificações.

Ver [[torg_relatorios_sais_poeira]], [[torg_pintura_tinta]], [[torg_cotas_abc]].
