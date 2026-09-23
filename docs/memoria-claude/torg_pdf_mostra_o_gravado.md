---
name: torg_pdf_mostra_o_gravado
description: "Informação não vai para o PDF" — o PDF de relatório é sempre o GRAVADO; conferir no banco se houve gravação antes de caçar bug no gerador; botões de PDF gravam o pendente antes de abrir (data-salvar-antes / verPrevia)
metadata:
  type: feedback
---

**Vitor (23/09/2026):** *"mas as informações adicionadas não estão indo para o pdf"* — logo depois de a
junta soldada (EPS, RQS…) entrar nos relatórios de LP/EVS ([[torg_junta_soldada_eps]]).

**O que era:** nada tinha sido gravado. O banco mostrava a última gravação às 19h12 em QUALQUER
relatório, e nenhum padrão novo. O PDF (`/api/qualidade/inspecoes/[id]/pdf`) é gerado na hora a
partir do banco — "Abrir PDF" (computador) e "Ver prévia" (celular) mostravam o documento sem o que
estava só na tela. A `ProtecaoEdicao` avisava ao SAIR da página, mas ignorava de propósito link de
nova aba — justamente o do PDF.

**Why:** a queixa soa como defeito do gerador de PDF, e o reflexo é ir mexer nele. O gerador estava
certo; o caminho até o banco é que não tinha sido percorrido.

**How to apply:**
- "Não aparece no PDF" → primeiro `updatedAt` do relatório e o AuditLog (`MEDIR_RELATORIO_CAMPO`,
  `EDITAR_RELATORIO_INSPECAO`) desde a hora da tentativa. Sem gravação, o problema é de tela.
- Computador: link com `data-salvar-antes` + `target="_blank"` → a `ProtecaoEdicao` grava o pendente e
  só então abre (aba aberta no clique, senão o navegador bloqueia; falhou → a aba fecha). O `salvar`
  é lido por ref — o ouvinte nasce na primeira tecla e gravaria o formulário velho.
- Celular: `verPrevia` no `Medir.jsx` grava sem sair e RECARREGA do servidor (juntas novas ganham
  índice do banco; sem isso a próxima gravação as duplicaria). Ver [[torg_campo_ida_e_volta]].
