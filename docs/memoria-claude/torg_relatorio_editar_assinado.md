---
name: torg_relatorio_editar_assinado
description: Relatório de inspeção enviado para assinatura CONTINUA editável (decisão do Vitor, 22/09/2026) — não exige revisão; a auditoria marca `editadoAposAssinatura` e a tarja diz quem assinou; a revisão segue para o documento que já saiu ao cliente
metadata:
  type: feedback
---

**Vitor (22/09/2026):** *"preciso que libere para eu colocar as informações dos relatórios de EVS e
LP, falta preencher algumas informações"* e, depois de eu implementar o caminho da revisão,
*"não precisa gerar revisão, pode apenas alterar as informações"*.

**O caso:** os cinco relatórios da OP-102 (EVS-102-001 e RLP-102-001…004) foram enviados para
assinatura em 21/09; o Geraldo assinou em minutos e o Alexandre (inspetor) ficou pendente. Os
campos do ensaio — penetrante, revelador, tempos, temperatura — foram para o documento **em
branco**. A rota recusava com 409 ("já foi enviado para assinatura e não pode mais ser alterado").

**Regra nova:** editar é permitido; o que não se abre mão é o REGISTRO.
- `PATCH /api/qualidade/inspecoes/[id]` e o caminho do celular gravam
  `editadoAposAssinatura: true` + `assinaturasVigentes: [quem assinou]` no AuditLog.
- A tarja da tela passou de *"somente leitura"* para *"assinado por Fulano · R00 — alterações ficam
  registradas"*, com o botão Salvar ao lado.
- **A revisão continua existindo** (botão "Abrir revisão", agora também para `QUALIDADE_CAMPO`): é o
  caminho para o documento que **já saiu para o cliente**, onde mudar por baixo de uma assinatura
  externa seria outra coisa.

**Why:** na Torg o relatório é assinado internamente antes de estar completo; subir revisão de um
documento que nunca saiu da empresa só encheria o histórico. O risco que sobra — assinatura valendo
para um conteúdo que mudou — é assumido com registro, não com trava.

**How to apply:** ao mexer em documento assinado, perguntar *já saiu da Torg?* Se saiu, revisão. Se
não, edição registrada. Ver [[torg_databook_revisao]] (lá o data book emitido SÓ muda por revisão —
regra diferente, porque ele é entregue) e [[torg_assinatura_doc]].
