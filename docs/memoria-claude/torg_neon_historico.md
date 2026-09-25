---
name: torg_neon_historico
description: O banco (Neon "neon-cyclamen-candle", plano Launch) guarda só 6 HORAS de histórico e NÃO tem snapshot agendado — registro apagado há mais de 6 h só volta pelo backup semanal (domingo); caso RIP-112-001 (25/09/2026)
metadata:
  type: project
---

**Medido em 25/09/2026 no console do Neon** (projeto `gentle-fog-97975034`, "neon-cyclamen-candle",
plano **Launch**, região São Paulo): **History retention = 6 horas**; Backup & Restore diz **"No
snapshots, no schedule set"**. Ramos: `main` + 3 de preview da Vercel (cópia do `main` no dia em que
nasceram; não servem de backup).

⚠⚠ **NÃO HÁ "VOLTAR NO TEMPO" ALÉM DE 6 HORAS.** O backup que sobra é o semanal no SharePoint
(`/Workspace/Backup - Portal/AAAA-MM-DD`, domingo 01:00 BRT — [[torg_backup_banco]]). Registro criado e
apagado dentro da mesma semana não está em lugar nenhum.

**Caso que revelou (24–25/09/2026):** o RIP-112-001 (pintura, OP-112, marcas T112A11 ×2, T112A30, T112A33,
T112A36; 4 equipamentos) foi aberto pela Lais (conta stival2112, "Alexandre Stival") em 23/09 e EXCLUÍDO
pelo Geraldo (qualidade@) em 24/09 15:49 pela tela de Inspeções. A exclusão apaga o relatório e o documento
que ele criou na seção 14 do data book, e a auditoria guarda só código e tipo. Vitor autorizou recuperar;
não havia de onde: 6 h de histórico, sem snapshot, backup de 20/09, ramos anteriores. Sorte: as duas
gravações dela tinham **0 medições** (`MEDIR_RELATORIO_CAMPO` → `"medidas":0`) — perdeu-se só a lista de
peças.

**Como se chega ao console:** Vercel (logado) → Storage → neon-cyclamen-candle → "Open in Neon" (SSO
`/api/marketplace/sso?...`; no navegador do app o link tenta nova aba e é bloqueado — navegar direto no
href). Login direto em console.neon.tech não tem o projeto.

Pendente (decisão do Vitor): aumentar a retenção de histórico e/ou agendar snapshot; exclusão de relatório
guardar cópia completa + motivo.
