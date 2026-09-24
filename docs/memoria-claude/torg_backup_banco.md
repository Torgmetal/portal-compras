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

**Corrigido em 24/09/2026 (Vitor: "pode atacar"):**
- **Dump do banco**: quatro tabelas por vez, gzip em fluxo (a tabela não vira texto inteiro em
  memória antes de comprimir) e parada própria aos 270 s — o que faltar vai para `falhas` com
  "tempo esgotado", o manifesto sobe e o heartbeat sai vermelho no mesmo domingo. Ensaio só de
  leitura contra a produção: a LEITURA inteira (177 tabelas, 405 mil linhas) leva **11 s** — os 249 s
  eram quase todos os uploads em fila; estimativa com 4 em paralelo ~75 s.
  ⚠ **Modelo sem tabela no banco (P2021) não é falha** — 13 modelos novos do MES estavam no código e
  não no banco, e o domingo seguinte sairia vermelho à toa. Vão para `modelosSemTabela` no manifesto.
- **Arquivos só no Blob**: cron diário `/api/cron/backup-arquivos` (03:30 UTC, `lib/backup-arquivos.js`)
  copia anexos do Data Book e fotos de inspeção para `Backup - Portal › Arquivos › {Data Book | Fotos
  de inspeção} › OP-nnn`, com nome fixo por id (`replace`, nunca duplica), 4 por vez, parando aos
  240 s. Anexo: grava `sharepointUrl`/`sharepointItemId` no documento. Foto: o registro é o AuditLog
  `BACKUP_FOTO_INSPECAO_OK` (sem DDL). Primeira leva: 616 arquivos, ~250 MB — uma ou duas noites.
- **O Data Book usa a cópia** se o arquivo sumir do Blob (`baixarDocumento`): antes, Blob 404 era erro
  seco mesmo com cópia existindo.

**Código que só existia no Mac — salvo em 24/09/2026 (Vitor: "sobre o código desse Mac poderia ajustar
isso?")** como `refs/backup/2026-09-24/<nome>` no GitHub: `codex-corrigir-planilha-syneco` (a pasta
principal), `codex-login-unificado`, `codex-edicao-manual-carga`, `claude-fervent-kapitsa-49946b`,
`claude-practical-hofstadter-8b89a4` — commits locais + alterações não commitadas.
- ⚠⚠ **NÃO É BRANCH, DE PROPÓSITO.** Branch nova no GitHub = deploy de pré-visualização na Vercel =
  cópia do banco criada pela integração do Neon (foi o que estourou o limite em 15/06, ver
  [[torg_vercel_neon_deploy]]). `refs/backup/*` a Vercel ignora e o `git clone` comum não baixa.
- ⚠ **Snapshot num índice temporário** (`GIT_INDEX_FILE`): a pasta, o índice e a branch da outra sessão
  ficam intactos — conferido antes/depois. Fora: `output/`, `outputs/`, `previews/` (artefatos, ~120 MB,
  com JSON de permissões do SharePoint que tem e-mail de gente) e `testes/__*` (scripts de uso único que
  GRAVAM EM PRODUÇÃO se a bateria de testes rodar depois de restaurar).
- **Recuperar:** `git fetch origin 'refs/backup/*:refs/backup/*'` e `git switch -c recuperado refs/backup/2026-09-24/<nome>`.
- ⚠ No zsh, laço `for x in $LISTA` NÃO separa por espaço, e `"$C:refs/…"` vira modificador `:r` —
  os dois morderam nesta operação. Laço explícito, e `${C}` com chaves.
