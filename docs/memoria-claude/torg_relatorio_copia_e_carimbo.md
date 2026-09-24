---
name: torg_relatorio_copia_e_carimbo
description: Relatório de inspeção "sem assinatura" no data book — a cópia da pasta da obra é arquivada ANTES das assinaturas (agora o livro serve o do portal); e convite desviado para outra pessoa punha o carimbo pelo e-mail errado (agora segue o titular)
metadata:
  type: project
---

**Vitor (24/09/2026):** *"Relatório de EVS e LP da OP-102 está puxando os relatórios sem assinatura"*.
Eram dois defeitos somados, medidos em produção:

**1. O data book tinha a CÓPIA da pasta da obra, não o relatório.** `arquivarRelatorioNaObra`
(lib/relatorio-arquivo.js) grava o PDF em `OP-xxx/8. Qualidade/3. Relatórios de Inspeção/…` **na
aprovação** — antes de qualquer assinatura — e a cópia nunca mais muda. Na OP-102 a §12 recebeu os
relatórios duas vezes em 21/09: pelo navegador do servidor (a cópia, origem `servidor`) e pelo vínculo
do portal (`inspecao_campo`, PDF remontado com as assinaturas de agora). Em 22/09 o Geraldo tirou a
duplicata — e ficou a cópia, com o Alexandre "aguardando assinatura". Medido: **7 documentos** de data
book eram cópias (OP-102: EVS-102-001, RLP-102-001…004; OP-089: RIP-089-001/002).

⚠⚠ **A cópia agora É o relatório** (`fonteDeCopiaArquivada`, lib/relatorio-pdf-fonte.js): nome
`<código>[ Rnn] - <rótulo do tipo>` + pasta `/8. Qualidade/` + origem `servidor` → sai o relatório do
portal. Amarrações: o código é buscado **dentro da obra do documento** (e `pdfDoRelatorio` confere de
novo) e a **revisão** tem de ser a vigente — cópia de revisão antiga continua sendo o arquivo. Vale no
livro, nos volumes, no portal do cliente (`baixarDocumento`) e no olho (rota de download).
⚠ RIP-089-001 não existe mais no portal: a cópia dele segue sendo servida como arquivo.

**2. Convite desviado: o carimbo saía pelo e-mail de quem recebeu o link.** Em 24/09 (13:26 UTC) os
convites pendentes do Alexandre Stival foram desviados para `vitor@torg.com.br`, a pedido do Vitor
(`REDIRECIONAR_CONVITE_ASSINATURA` no AuditLog: *"apenas destino alterado"*, nome mantido). Ele assinou
os cinco às 13:54, e a imagem era procurada pelo e-mail do CONVITE — o dele, sem carimbo. Os RIP-102
tinham sido corrigidos à mão uma hora antes (`CORRIGIR_CARIMBO_ASSINATURA`, também a pedido dele).

⚠⚠ **O carimbo é do TITULAR** (`titularesDesviados`, lib/assinatura-cadastro.js): o registro do desvio
é o único lugar que guarda de quem a assinatura é. `completarImagens` (quem já assinou) e
`imagemDoCadastro` (no ato, rota `/api/assinar/[token]`) usam o e-mail de antes do PRIMEIRO desvio.
⚠ **Titular sem imagem não recebe a de quem assinou pelo link** — seria a assinatura de uma pessoa no
quadro de outra. ⚠ `completarImagens` precisa do `id` da assinatura no select.

Ainda desviados e pendentes em 24/09: RIP-103-002, RIP-103-003, RIP-071-001, RIP-085-001 — já saem com
o carimbo do Alexandre quando assinados.

**Não feito (sugestão):** rearquivar o PDF na pasta da obra quando o envio conclui. A cópia da pasta é o
BACKUP, e hoje ela fica com a folha de antes das assinaturas; o livro já não depende dela.

Ver [[torg_relatorio_quadros_assinatura]], [[torg_relatorio_editar_assinado]], [[torg_databook_revisao]].
