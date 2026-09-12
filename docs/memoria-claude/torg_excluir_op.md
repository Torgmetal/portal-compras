---
name: torg-excluir-op-cascade
description: Excluir OP é cascade complexo — o DELETE existente bloqueia se há RM e não limpa PCP/produção/qualidade; ~15 FKs opId sem onDelete + vários vínculos por opNumero texto
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Pedido (2026-06-15): admin poder **excluir obras/OPs que já entraram em PCP/Produção** (limpeza antes dos testes reais).

**Já existe** `DELETE /api/comercial/op/[id]` (app/api/comercial/op/[id]/route.js ~147-199; botão em app/compras/painel-ops/[opId]/OPAcoesClient.jsx, só admin via prop). MAS:
- **Bloqueia se a OP tem RM** (>0 → 409). OPs em PCP/produção têm RM → não dá pra excluir hoje.
- Só cascateia comercial (OPItem, Aditivo→AditivoItem, Revisao, AjustePrazo — todos onDelete:Cascade) + EstoqueReserva/EstoqueAlocacao (Cascade). Guard `requireRole([ADMIN, COMERCIAL])`.

**Cascade incompleto — FKs opId SEM onDelete** (deixam órfão / recusam o delete): RM, RMItem (opItemId/aditivoItemId/opDestinoId), PedidoOmie, ProducaoSemanal, Romaneio, PlanejamentoCarga, FluxoCaixa, PecaConjunto, Orcamento, MesApontamento, MesOrdem, Cronograma (cascades internos), TarefaPlanejamento, NecessidadeSemanal, Recebimento (via RMItem), Cotacao/CotacaoItem (via RM/RMItem).

**Vínculos por opNumero em TEXTO (sem FK)** — precisam delete manual por opNumero: PecaConjunto, DocumentoQualidade, DataBookQualidade (@unique), SolicitacaoProducao (@unique), PedidoExpedicao (@unique), NecessidadeSemanal, Cronograma, PmpMeta. Gotcha: `OP.numero` ("088") ≠ `PecaConjunto.opNumero`/`MesOrdem.op` ("T88A"); `obraParaNumeroOP()` (app/api/mes/sync-ordens) faz o mapeamento.

**Plano (a implementar, pendente decisão do Vitor):** endpoint admin-only (force) que, numa **transação** (prismaDirect), deleta os filhos por opId (RMItem→RM, cotações, recebimentos, romaneios, planejamento, produção, MES, cronograma, peças) + por opNumero (texto), e por fim a OP (cascata comercial+estoque). Confirmação digitando o número da OP + AuditLog com counts. **Sem staging → testar em OP de teste descartável primeiro.** "obra" = campo `OP.obra` (rótulo), não entidade separada. Ver [[torg_fila_corte]], [[torg_qualidade_import_cmr]] (mismatch de opNumero).
