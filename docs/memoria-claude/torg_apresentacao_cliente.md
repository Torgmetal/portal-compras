---
name: torg_apresentacao_cliente
description: Portal de Apresentação ao Cliente (Comercial) — página pública por token com docs cadastrais/portfólio da Torg + boas-vindas + capa; espelha o portal de Auditoria
metadata:
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Feature criada 06/07/2026 (commit fda8df0; movida Compras→**Comercial** em 2fabcb2 — apresentar a empresa ao cliente é do Comercial). Vive em **`/comercial/apresentacoes`** (requireRole ADMIN/**COMERCIAL**); página pública **`/apresentacao/[token]`** (sem login, liberada no middleware).

**Espelha o portal de Auditoria da Qualidade** (`Auditoria`/`portal-cliente/[token]` com `capaUrl`) — é o "painel de homologação" que o Vitor citou. Padrão reusado: token único, `capaUrl` (imagem de capa do hero, Blob), `mensagemBoasVindas`, tracking de acesso.

**Modelos (3):** `DocumentoInstitucional` (biblioteca fixa da Torg — cadastrais/portfólio, cadastra 1x, reusa), `ApresentacaoCliente` (contato, empresa, mensagemBoasVindas, capaUrl, clienteEmail, `docsInstitucionaisIds` Json = quais da biblioteca incluir, token, status RASCUNHO/PUBLICADO, primeiro/últimoAcessoEm, acessos), `ApresentacaoDoc` (extras por cliente).

Decisões do Vitor: **biblioteca fixa + extras por cliente** (nova apresentação já vem com todos os institucionais ativos, dá pra marcar/desmarcar + add extras) e **o portal manda o e-mail** (Resend, `/[id]/enviar`, botão pro link). Fluxo: cadastra biblioteca → Nova apresentação → editar (capa, docs, mensagem) → Publicar (gera token) → copiar link OU enviar e-mail.

⚠️ **Upload: usa CLIENT TOKEN (upload direto navegador→Blob), NÃO `/api/upload-blob`** (corrigido 504d466, 17/07). Bug: `/api/upload-blob` empurra o arquivo pela função serverless → **teto de 4,5MB da Vercel** → documento grande (portfólio/catálogo) falhava silencioso (nenhum doc >4,4MB tinha subido). Agora `uploadArquivo` chama `upload()` de `@vercel/blob/client` c/ `handleUploadUrl: /api/comercial/apresentacoes/upload-token` (`handleUpload`, ADMIN/COMERCIAL, allowlist PDF/Office/imagem/zip, 50MB). **REGRA GERAL: arquivo do usuário >4,5MB precisa de client-token upload** — mesmo padrão do RH ([[torg_rh_documentos]]) e Qualidade. `/api/upload-blob` (serverless) só serve p/ anexos pequenos (RM).

⚠️ **Tabelas criadas por SQL direto, NÃO `prisma db push`** — havia drift no banco (`Ferias.descontos` + `PontoItem.empresa` existem no banco mas não no `schema.prisma`, do módulo Ferias do Matheus). `db push --accept-data-loss` DROPARIA esses dados. Ver [[torg_icloud_delecao]] (o schema.prisma commitado tem os 3 models; o banco foi alterado só com CREATE TABLE). Matheus precisa reconciliar o schema com o banco.
