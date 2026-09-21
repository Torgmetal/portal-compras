---
name: torg_cronograma_envio_cliente
description: Envio do cronograma ao cliente pelo portal — contatos do cliente ficam registrados na OP (OP.clienteContatos)
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
---

**Enviar cronograma ao cliente** (commits 3a39ebc, 6cbd714) — botão "Enviar ao cliente" na tela do cronograma (`/planejamento/cronogramas`), ao lado do "Exportar Gantt (PDF)". Confirmado funcionando pelo Vitor.

Vão **2 anexos** (`sendEmail({attachments:[{filename, content: base64}]})` — o `lib/email.js` suporta anexo, cc e replyTo):
- **PDF** do Gantt (`gerarCronogramaPDF`) — pra leitura.
- **.xml do MS Project** (MSPDI, `gerarCronogramaMSProjectXML` — síncrona, devolve `{xml, filename}`) — o cliente abre no Project dele (Arquivo → Abrir) pra validar/comparar. **Regra do Vitor: o xml SEMPRE vai junto do PDF.** Na T097 sai com 22 `<Task>` e 12 `<PredecessorLink>`.

**Estrutura espelha o "Enviar lembrete" das tarefas**: setores da Torg saem da lista fixa `lib/contatos-tarefas.js` (CONTATOS_TAREFAS), + a parte nova: os **contatos do CLIENTE**.

**Regra do Vitor — o contato do cliente fica registrado NA OP**: `OP.clienteContatos` Json `[{nome,email}]`. No 1º envio os contatos usados são gravados lá e nos próximos já vêm marcados, sem redigitar. Na 1ª vez, o contato do cadastro da OP (`clienteContato`/`clienteEmail`, que já existiam e estão preenchidos em ~6 OPs) aparece sugerido com o selo "do cadastro da OP".

- `GET /api/planejamento/cronogramas/[id]/enviar` → `{cronograma, setores, clientes, temOp, historico}`.
- `POST` → gera PDF, envia 1 e-mail por destinatário, registra os contatos CLIENTE na OP, grava `CronogramaEnvio` + revisão + auditLog.
- `CronogramaEnvio` (destinatarios Json `[{nome,email,tipo:SETOR|CLIENTE}]`, mensagem, assunto, enviados) → o modal mostra os últimos 5 envios ("o cliente já recebeu esta versão?").
- Componente: `components/planejamento/ModalEnviarCronograma.jsx`. Acesso ADMIN/PLANEJAMENTO/COMERCIAL.
- ⚠️ 2 de 11 cronogramas não têm `opId` (T074, T071) — envia normal, mas não dá pra registrar contato; o modal avisa.
- **Editar/remover contato do cliente (21/07, commit 2cfc9d9):** no modal, cada contato JÁ registrado tem lápis (edita nome+e-mail inline) e lixeira (remove) — Vitor errou um e-mail no cadastro e não tinha como corrigir (só marcar/desmarcar/adicionar). `PATCH /api/planejamento/cronogramas/[id]/contatos-cliente` grava a lista inteira em `OP.clienteContatos` (dedupe por e-mail). O contato legado "do cadastro da OP" segue só-leitura. Como `OP.clienteContatos` é compartilhado, a correção vale tbm pro envio da ata da OP ([[torg_op_vistas]]).

Relacionado: [[torg_cronograma_periodo]], [[torg_cronograma]], [[torg_tarefas_planejamento]].
