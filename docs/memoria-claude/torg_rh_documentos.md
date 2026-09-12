---
name: torg-rh-documentos
description: Portal Compras Torg — upload/visualizar/enviar documentos de RH + backup ISO no SharePoint (2026-06)
metadata: 
  node_type: memory
  type: project
  originSessionId: 6159e822-8d9e-416e-8542-b783d3627472
---

Feature de documentos de RH (RH › Documentos), v1 em 2026-06. Antes a tela era só metadados; agora anexa arquivo + backup ISO.

**Decisões do Vitor:** documentos PRIVADOS (só ADMIN/RH; download por proxy autenticado, não link público); backup no SharePoint numa pasta nova de docs; arquivos podem ser GRANDES (>4MB).

**Como funciona:**
- Schema `Documento` ganhou `arquivoUrl/arquivoNome/arquivoTamanho/arquivoTipo/sharepointUrl`.
- Upload é DIRETO pro Vercel Blob via client token (`@vercel/blob/client` `upload` + rota `/api/rh/documentos/upload-token` com `handleUpload`) — evita o limite de ~4,5MB da função serverless. Sufixo aleatório na URL.
- Privacidade: a `arquivoUrl` NUNCA volta no GET (só flag `temArquivo`). Ver/baixar = proxy `/api/rh/documentos/[id]/download[?inline=1]` (requireRole ADMIN/RH, faz stream do Blob).
- Backup ISO: `lib/sharepoint.js` `uploadFileToFolder` + `ensureFolder` (PUT Graph, cria pasta se faltar). `lib/sharepoint-rh.js` `backupDocumentoRh` baixa do Blob e sobe. `lib/rh-doc-backup.js` `backupISODocumento` orquestra COM AuditLog (BACKUP_DOC_SHAREPOINT_OK/ERRO) — não silencioso. Pasta = env `SHAREPOINT_RH_DOCS_FOLDER` (default `/RH/Workspace/Documentos`), mesmo drive `SHAREPOINT_DRIVE_ID` dos funcionários. ⚠️ Vitor vai confirmar/ajustar o caminho exato da pasta.
- Enviar: `/api/rh/documentos/[id]/enviar` manda o arquivo como ANEXO (Resend; `lib/email.js` sendEmail agora aceita `attachments`).
- Confirmado que o SharePoint app-only token ESCREVE (já subia a planilha de funcionários — ver [[torg-omie-recebimento]] não; ver lib/sharepoint-rh.js).

**Importação em massa do SharePoint (2026-06):** os documentos que o RH já tinha organizados em `/RH/Workspace/1. Funcionários/{PJ|TORG|VMI}/{Nome}/{NN Categoria}/arquivo` foram importados. Decisão do Vitor: **servir DIRETO do SharePoint** (sem copiar pro Blob). 
- Schema ganhou `Documento.sharepointItemId @unique` — quando setado, o arquivo vem do SP (proxy/enviar fazem fallback via `lib/sharepoint.js` `fetchRhItemResponse`/`downloadRhItem`; `temArquivo` no GET considera os dois).
- Categoria-pasta → tipo: `02 ASO`→ASO, `03 Ficha de EPI`→FICHA_EPI, `04 Certificados de Treinamento`→CERTIFICADO, `01 Admissionais`→**novo tipo ADMISSIONAL** (categoria Pessoal). Validade fica em branco (não dá pra extrair do nome).
- Resultado: **1017 docs** criados p/ os **69 funcionários cadastrados**; **20 pastas sem cadastro** receberam marcador `⚠ NAO CADASTRADO NO PORTAL.txt` no SP (exceto EDIVANDO DE OLIVEIRA PIRES, provável = EDVANDO já cadastrado — Vitor confirmar).
- Script idempotente (pula `sharepointItemId` existente): `/tmp/import-sp.cjs --apply` (lê `.env.local`, casa por nome normalizado + lista de typos confirmados). **Re-rodar quando cadastrarem os ~11 faltantes COM documentos** (ex: Guilherme Agnelli Corte Campos 44 arq, Bruno Henrique Camargo 10, Natalina 9, Ricardo 9, Douglas 7, Fabio 5…) pra vincular os ~95 arq que ficaram de fora.

**Pendências/v2:** confirmar pasta SharePoint com Vitor; `onDelete: Cascade` em Documento.funcionario apaga docs ao excluir funcionário (avaliar SetNull); arquivos muito grandes (>250MB) precisariam de createUploadSession (Graph) — improvável em RH.
