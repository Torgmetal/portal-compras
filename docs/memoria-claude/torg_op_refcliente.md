---
name: torg_op_refcliente
description: OP.refCliente — código/referência que o CLIENTE usa para a obra; aparece nos documentos enviados ao cliente
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-07-23T15:57:31.875Z
---

Campo **`OP.refCliente`** (String?, coluna nova no Neon via ALTER 21/07, commit 9e3900a) = o **código de referência que o próprio CLIENTE usa** para aquela obra (contrato/WBS/TAG/nº de projeto do cliente), separado da `obra`/empreendimento (nome da obra) e do `numero` (nº da OP na Torg). Vitor pediu porque "várias obras têm código próprio do cliente e, pra mandar um relatório, fica muito mais fácil dele saber do que se trata".

- **Onde edita:** criação `/comercial/nova` e o modal "Editar OP" (`OPDetailClient.jsx` → `ModalEditarOP`), campo "Referência do cliente" logo abaixo de Obra. APIs POST `/api/comercial/op` e PATCH `/api/comercial/op/[id]` aceitam `refCliente`.
- **Onde aparece (internamente):** cabeçalho da OP mostra chip laranja "Ref. cliente: …" e a **aba "Obra"** (nova 23/07, commit 33a642c, entre Resumo e Engenharia — `app/comercial/[id]/AbaObra.jsx`): identificação (nº OP/cliente/obra + refCliente em DESTAQUE, com aviso quando vazia), prazos/contrato/definições, cadastro do cliente e os contatos que recebem cronograma/ata. Botão Editar abre o `ModalEditarOP` que já existia. Renderiza direto do prop `op` (sem fetch).
- ⚠️ **Em 23/07 nenhuma das 29 OPs tinha refCliente preenchido** — o campo existe desde 22/07 mas ninguém cadastrou ainda; a aba Obra serve justamente pra isso.
- **Onde aparece (documentos ao CLIENTE, commit 2447b60):** ata de reunião (linha "Ref. do cliente" no `AtaDocumento` — página pública + prévia — e no e-mail; subtítulo do modal de envio); cronograma (linha na tabela do e-mail); **Relatório de Status** (linha "REFERÊNCIA DO CLIENTE" na capa do PDF interno e público, puxada AO VIVO da OP via `rel.opId`, sem duplicar no `RelatorioStatus`).
- **Regra pra código novo:** ao criar QUALQUER documento/relatório enviado ao cliente, incluir `OP.refCliente` no cabeçalho quando existir. O `RelatorioStatus` snapshota cliente/obra mas NÃO o refCliente — busca ao vivo pela OP vinculada.

Relacionado: [[torg_op_vistas]], [[torg_relatorios]], [[torg_cronograma_envio_cliente]].
