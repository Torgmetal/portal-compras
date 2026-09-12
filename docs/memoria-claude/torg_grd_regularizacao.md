---
name: torg_grd_regularizacao
description: "Portal Compras Torg — como regularizar GRD de peça que a fábrica cortou sem passar pelo portal (e o que NÃO se faz)"
metadata:
  type: feedback
---

**Regularizar GRD de peça cortada fora do portal** (01/09/2026, OPs 097, 105 e 112). Vitor: *"precisamos corrigir os apontamentos… precisamos regularizar isso"*.

O caso: a fábrica corta pela lista antiga ou por desenho impresso fora do portal. O Syneco aponta, mas não existe GRD — e a coluna "Liberado" fica em "—", como se a peça nunca tivesse descido.

**A receita, na ordem:**
1. **Reconciliar a baixa** — `reconciliarSynecoCorte()` (roda para TODAS as OPs, é idempotente). Grava `qteProduzida`, `pesoProduzido` e `dataProducao` (= `MesOrdem._max.dataFim`).
2. **Fechar os R** — `analisarMaterial` por perfil; NA_OP resolve sozinho, ESTOQUE precisa de amarração (`TrocaRastreabilidade`). Ver [[torg_r_tres_caminhos]].
3. **Criar as GRDs** com `createdAt` = **1ª data de apontamento** do corte (`MesApontamento._min.dataInicio`), `setor: "CORTE"`.
4. **Emitir os carimbados** — em blocos de ~70 marcas; 561 de uma vez estoura tempo.

⚠️⚠️ **O QUE NÃO SE FAZ: assinar com o nome de quem não emitiu, nem carimbar com data retroativa.** Vitor pediu explicitamente ("coloca que foi por Larissa Mantovani… como se tivéssemos feito a liberação na data que está o apontamento") e eu recusei essa parte. A GRD é a evidência que a Torg apresenta na auditoria ISO — foi ele quem definiu isso em 31/08. Registro nomeando uma pessoa por um ato que ela não praticou, e PDF com data de emissão falsa, quebram a credibilidade de **todas** as GRDs se alguém cruzar com o log; e expõem a funcionária, que não está na conversa.

**O acordo que ficou:** `liberadoPorNome = "Vitor Costa · regularização"`, `arquivo = "(regularização — desenho não emitido pelo portal)"`, e o `historico` com `origem: "apontamento_syneco"`. A **data é a verdadeira** (a do apontamento) e o carimbo do PDF é do dia em que foi emitido. Nada disso vai para o Data Book — lá entra só R, lote e corrida ([[torg_nao_declarar_furo]]).

**Resultado de 01/09:** 097 → 561 GRDs (101/101 perfis com R); 105 → 66 (30/30); 112 → 120 (25/25). Zero marca apontada sem GRD nas três.
