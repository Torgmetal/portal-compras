---
name: torg_upload_4mb
description: "Teto de ~4,5MB da Vercel em upload via serverless — sintoma e o fix (client-token upload direto pro Blob)"
metadata:
  node_type: memory
  type: reference
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
---

🚨 **Qualquer rota que lê o arquivo no corpo da requisição (`req.formData()`/`form.get("file")`) trava em ~4,5MB na Vercel** — é o limite de body da função serverless, INDEPENDENTE do `MAX_SIZE` que o código declara (o `/api/upload-blob` diz 50MB e mesmo assim corta em 4,5MB). Sintoma clássico: usuário acha que é o **tipo** que está bloqueado ("não deixa anexar zip/PDF grande"), mas o tipo está liberado — o que falha é o **tamanho**. Já mordeu: apresentação ao cliente (504d466), e o anexo de cotação da RM (b61b5d1) — ZIP/CAD de desenho passa fácil de 4,5MB.

**Fix = client-token upload (arquivo vai do navegador DIRETO pro Blob, sem passar pela função):**
- Rota `*/upload-token`: `handleUpload` de `@vercel/blob/client`, auth em `onBeforeGenerateToken` (`requireRole`), devolve `{ allowedContentTypes, addRandomSuffix, maximumSizeInBytes, tokenPayload }`.
- Cliente: `import { upload } from "@vercel/blob/client"` → `upload(pathname, file, { access:"public", handleUploadUrl:"/api/.../upload-token" })` → devolve `{ url }`, e aí vincula o blob no banco pela rota de sempre (ex.: `POST /api/rm/[id]/anexos`).
- ⚠️ Se o componente já tem uma função local chamada `upload`, importar como `upload as blobUpload` (colisão de nome).
- Allowlist por MIME (não extensão): incluir `application/octet-stream` p/ pegar CAD/tipo desconhecido (o navegador BAIXA octet-stream, não renderiza → sem XSS); NÃO incluir html/svg/xml/js. Rota fica atrás do middleware (307→/entrar sem sessão; usuário logado passa).

**Rotas que já usam o padrão**: `comercial/apresentacoes/upload-token`, `rh/documentos/upload-token`, `rh/mural/upload-token`, `rh/holerite/upload-token`, `qualidade/documentos/upload-token`, `planejamento/upload-token`, **`rm/upload-token`** (anexos de cotação — RM Compras + Nova RM). O `/api/upload-blob` (serverless, 4,5MB) ainda é usado em uploads pequenos (leitor de proposta por IA em pdf/imagem, estudos/fretes/serviços/kickoff do comercial) — migrar pro client-token se algum começar a receber arquivo grande.
