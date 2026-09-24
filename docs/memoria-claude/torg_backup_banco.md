---
name: torg-backup-banco
description: "Portal Compras — onde ficam os backups: banco (SharePoint semanal), código (GitHub) e documentos (SharePoint ao lado do Blob)"
metadata:
  node_type: memory
  type: project
---

**Banco**: Neon (`ep-cold-hill-acrnaqw9`, sa-east-1), 196 MB, 133 tabelas com dados. Dump semanal **domingo 4h** em `SERVIDOR › Workspace › Backup - Portal › AAAA-MM-DD` (`lib/backup-banco.js` + `/api/cron/backup-banco`). Medido: 165 tabelas, 352.919 linhas, 18,5 MB comprimidos, 104s (teto da função: 300s).

**Por que o desenho é esse** (não simplificar sem entender):
- **Um arquivo por tabela, NDJSON gzip** — 196 MB em memória estoura a função; e NDJSON truncado ainda é legível, array JSON gigante truncado não abre.
- **Paginação por keyset (cursor no `id`), nunca `skip`** — com `skip` o Postgres relê e descarta as linhas puladas a cada página; na tabela de 121 mil linhas (MesOrdem) vira leitura quadrática e a função morre no tempo.
- **`manifesto.json` sobe por ÚLTIMO** — pasta com tabelas e sem manifesto = backup interrompido. É como se descobre sem abrir arquivo por arquivo. O monitor de crons vigia (`maxHoras: 192`).
- Upload com `conflict: "replace"` (o `uploadFileToFolder` é `rename` por padrão e duplicaria).

**Código**: GitHub `Torgmetal/portal-compras` + máquina do Vitor + builds da Vercel. ⚠️ O repo **saiu do iCloud** (está em `~/dev/portal-compras`) — o problema de arquivos-fonte apagados não vale mais nessa máquina.

**Documentos**: Vercel Blob (sem versionamento nem lixeira) **com segunda cópia no SharePoint** para Qualidade e RH (`lib/qualidade-doc-backup.js`, `lib/rh-doc-backup.js` — best-effort com registro no AuditLog quando falha). SharePoint tem lixeira de 93 dias e histórico de versões.

**Ponto cego que continua**: a janela de restauração do Neon (point-in-time) nunca foi confirmada — depende do plano e só dá para ver no console. Ver [[torg_seguranca_pendencias]].

**Medido em 24/09/2026 (Vitor: "como está nossos backups?"):**
- Dump em dia: 5 pastas (29/08 a 20/09), todas com manifesto e 0 falhas; a de 20/09 tem 175 tabelas,
  395 mil linhas, 21,5 MB. ⚠⚠ **O TEMPO ESTÁ CHEGANDO NO TETO**: 192 s (30/08) → 236 → 234 → 249 s
  (20/09), contra `maxDuration` de 300 s — eram 104 s quando isto foi escrito. Estourar = pasta sem
  manifesto; o monitor acusa em até 192 h.
- Segunda cópia dos arquivos: RH 185/185 ✓; Qualidade pela tela de Documentos 59/59 ✓;
  ⚠ **anexos do Data Book (`origem: anexo_databook`) 323 só no Blob, nenhum com cópia** — esse caminho
  de upload não chama `backupISODocumentoQualidade`; ⚠ **293 fotos de inspeção só no Blob**.
- Código fora do GitHub, só no Mac do Vitor: o checkout principal (branch do Codex, dezenas de
  arquivos sem commit), `codex/login-unificado` e duas `claude/*` com commits locais.
- Neon point-in-time: segue sem confirmação — o projeto não tem `NEON_API_KEY`, só `NEON_PROJECT_ID`.
