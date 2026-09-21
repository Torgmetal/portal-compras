---
name: torg_assinatura_doc
description: Fluxo genérico de assinatura eletrônica de documentos por setor (PDF Torg + e-mail + token com data/IP + revisão automática)
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-11T14:06:04.904Z
---

Fluxo **genérico** (11/08/2026) para um documento do portal ser **validado/assinado pelos setores** por e-mail. Reutilizável por qualquer documento via o campo `tipo`.

**Peças:**
- `lib/assinatura-doc.js` — `fmtRev(n)` (R00/R01…), `getRevisao(tipo)`, `bumpRevisao(tipo)` (upsert incrementa; server-only).
- Models (SQL no Neon, db push bloqueado por drift): `DocumentoRevisao` (tipo @id, revisao), `EnvioAssinatura` (tipo/revisao/titulo/**snapshot Json**/enviadoEm), `AssinaturaDocumento` (envioId/nome/email/setor/token @unique/assinadoEm/**ip**; FK cascade). Reutilizadas por todos os tipos — muda só `tipo`.
- Página pública `/assinar/[token]` (+ `/api/assinar/[token]` GET/POST, `/pdf`) — allowlist no middleware. POST grava data/hora + **IP** (`x-forwarded-for`); idempotente. O PDF sai do **snapshot** (versão congelada no envio) + assinaturas atuais.
- Envio: rota `assinatura` do módulo cria EnvioAssinatura + 1 AssinaturaDocumento por destinatário + e-mail (cabecalhoEmail + botão + PDF anexo). `baseUrlDe(req)` de lib/databok-assinaturas.js.

**Revisão automática**: `bumpRevisao(tipo)` sobe quando o conteúdo muda (ex.: novo treinamento; criar/editar/excluir auditoria do cronograma). Assinatura mostra verde "Assinado + data + IP" / laranja "Aguardando".

**Usos atuais** (cada um: botão Exportar PDF + Enviar p/ assinatura + gerador de PDF próprio):
- `PLANO_TREINAMENTO` — RH › Treinamentos (`lib/plano-treinamento-pdf.js`), commit ef81601.
- `CRONOGRAMA_AUDITORIA` — Qualidade › Auditorias Internas, aba Cronograma (`lib/cronograma-auditoria-pdf.js`), commit 4bc04e5. [[torg_qualidade_auditorias_internas]]

Para um tipo novo: gerar o PDF, adicionar branch em `/api/assinar/[token]/pdf`, criar rota `assinatura` (GET/POST) e ligar `bumpRevisao` na criação/edição.
