---
name: torg-cmr-lote
description: "Gravar N" do CMR é lote atômico com chave (CmrLote) — resposta perdida não pode virar R duplicado
metadata:
  type: project
---

Pedido 2054 (05/10/2026): 43 itens, "Gravar 43". Os 43 R foram gravados (261832–261874), mas os avisos
um por um (~1 s cada) seguraram a função até a Vercel derrubá-la nos 60 s. A tela recebeu a página de
erro ("Unexpected token 'A'… is not valid JSON") e manteve "Gravar 43" de pé — outro clique duplicaria.

Desenho aprovado pelo Codex (consulta `database`), em `lib/cmr-lote.js`:
- O navegador gera `loteId` e o repete a cada tentativa até um sucesso (`lib/cmr-lancar-cliente.js`).
- `CmrLote` (criada por `scripts/ensure-mes-tables.mjs`) guarda os R e ids EXATOS + hash do conteúdo.
  Reenvio devolve o que já existe (antes de ler o SharePoint); mesma chave com outro conteúdo → 409.
- Documentos + CmrLote + AuditLog numa transação; travas `cmr-lote:<id>` e depois `cmr-r:<ano>`.
- Avisos em lote (3 consultas) em `lib/recebimento-notificacoes.js`; idempotentes por `chaveEvento`.
- Reenvio NÃO chama `/espelhar` (ele anexa sem conferir); a reconciliação manda à planilha o que falta.

**Why:** resposta perdida não é "nada gravado"; R duplicado contamina a rastreabilidade do cliente.
**How to apply:** qualquer caminho novo que emita R passa por `gravarLoteCmr`. Pendente sugerido pelo
Codex: índice único de `importRef` em MATERIAL — conferir duplicidades antes de criar.
