---
name: torg_syneco_apontamento_fonte
description: Apontamento por setor (painel Produção + Relatório do dia) vem do mesApontamento por dataInicio na janela BRT via lib/syneco-dia.js — nunca do mesOrdem
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

O "Apontamento de hoje por setor" do Painel de Produção e o "Relatório do dia"
(/api/producao/controle/apontamentos-dia) **têm que mostrar os mesmos números**
— o Vitor compara o painel contra o Relatório do dia ("de acordo com o
lançamento do Syneco").

A fonte correta é o **`mesApontamento`** (eventos do dia), **NÃO** o `mesOrdem`
(cumulativo por ordem — soma o total de ordens de vários dias e infla
Solda/Acabamento/Jato; ex.: Solda marcava 18.886 kg em vez de 3.309 kg).

A conta correta (replicada nos dois): filtrar por **`dataInicio`** na **janela
UTC-naïve** `[dia T00:00:00.000Z, dia T23:59:59.999Z]` (`janelaDiaBRT`) e
**normalizar os nomes crus do Syneco** (Serra/Plasma/Oxicorte→Corte, MIG/MAG/TIG→
Solda, Esmeril/Lixamento→Acabamento, Granalha→Jato…). Sem filtro de `produzidoUn>0`.

⚠️ **REGRA GERAL — toda data do Syneco (mesOrdem/mesApontamento) é UTC-naïve. Para janela de dia/mês use 00:00Z–23:59:59.999Z; para o dia-calendário use `diaSyneco()` de `lib/syneco-dia.js` (parte UTC). NUNCA offset -03:00 / T03:00:00Z, nem `diaBRT()` de `lib/data-br` (esse converte fuso/-3h e é só pra timestamp do portal, UTC real, ex.: createdAt).** Em 30/06/2026 corrigi TODOS os relatórios Syneco pra esse padrão (commit 95fd0d5): painel mês, relatório-do-dia mês, /api/mes/apontamentos, /api/producao/mes, PCP setor, PCP painel-corte (hoje+mês), relatorio-corte, e pmp/importar-syneco-corte (diaBRT→diaSyneco). A **ingestão** (`/api/mes/sync-ordens`) NÃO muda — o valor gravado já é naïve e as janelas agora batem.

⚠️ **A janela é UTC-naïve (00:00Z), NÃO -03:00.** As datas do Syneco são gravadas
UTC-naïve (relógio BRT escrito como se UTC). O offset -03:00 (versão antiga) jogava
os apontamentos entre 00:00–03:00 — **corte noturno/madrugada** — pro dia anterior,
sumindo do "hoje" (Corte aparecia 475 em vez de ~2.071; só o Corte/Jato sofriam, o
turno do dia batia). Corrigido 30/06/2026 (commit aa552a6). Diferença residual nos
setores que produzem AGORA = defasagem do push do agente MES, não da janela.

Ambas as telas usam **`lib/syneco-dia.js`** (`normalizeSetorSyneco` +
`janelaDiaBRT`) para não divergirem. Bug corrigido em 23/06/2026 (commit df4aa6e);
diagnóstico anterior em [[torg_mes_syneco]].

**Duas fontes Syneco coexistem de propósito — não unificar:**
- **"Apontado HOJE/dia"** (Painel + Relatório do dia) → **`mesApontamento`** (eventos do dia), como acima.
- **"Relatório de Produção" por setor** (`/pcp/relatorio-corte`, abas Corte/Montagem/Solda/Acabamento/Jato/Pintura) → **`mesOrdem`** (acumulado por ordem) = **total programado × produzido por obra**, que é o que esse relatório quer (não é "do dia"). Usa `whereSetorSyneco()` de `lib/syneco-dia.js` pra casar os nomes do setor. O "ocultar obra" ali é **por setor** (tabela `RelatorioCorteObraOculta`, unique `[obra,setor]`, ADMIN-only). Criado 24/06/2026 (commit 578d8c8).

**Furos de apontamento (painel Produção) — Acabamento é OPCIONAL.** A detecção de furo (`lib/conjuntos-setor.js`, `listarFurosApontamento` + a por-OP) flagra setor com mais unidades que o mínimo de um upstream (impossível sem o apontamento faltar). Mas peças podem **legitimamente não passar no Acabamento** → "Jato/Pintura acima de Acabamento" NÃO é furo. Por isso o **Acabamento entra em `SETORES_OPCIONAIS`** e não serve de base de comparação (upstream). NÃO remover essa exclusão "achando que é bug" — é regra do Vitor (o gerente confere o Acabamento no fim, pela Pintura). Em 28/06/2026 os 102 furos do painel eram TODOS por Acabamento → foram a 0 (commit 6b9ef93). Ainda flagra o Acabamento quando ELE passa de um upstream real, e os demais setores normal.

**Portal NÃO escreve no Syneco.** O agente da fábrica (C:\MesSync) só EMPURRA dados pro portal (`/api/mes/sync-ordens`, upsert INSERT...ON CONFLICT). Não há caminho de volta — "dar baixa no Syneco" só dá no software do Syneco na fábrica. Patch direto no `mesOrdem` seria sobrescrito no próximo sync.

**Baixa manual (OP finalizada com apontamento incompleto no Syneco):** tabela **`RelatorioObraConcluida`** (unique `[obra,setor]`, ADMIN-only, rota `/api/pcp/relatorio-corte/concluir`). Marca a obra/setor como **100% só na VISÃO do relatório** (força produzido=planejado/pct=100; sobrevive ao sync; reversível com "reabrir"). NÃO altera o Syneco. Criado 24/06/2026 (commit a2bb8da); T36/CORTE e T86/CORTE já marcados.

**Três "baixas/esconder" do PCP — todas só VISÃO, ADMIN-only, reversíveis, nenhuma toca no dado real:**
1. `RelatorioCorteObraOculta` (`[obra,setor]`) — oculta obra do Relatório de Produção.
2. `RelatorioObraConcluida` (`[obra,setor]`) — força 100% no Relatório (baixa manual).
3. `PcpCarteiraObraBaixa` (`opNumero` unique, rota `/api/pcp/painel-corte/baixa`) — esconde obra/frente da "Necessidade por obra" do **Dashboard do PCP** (commit 8889788).

**Descoberta importante (24/06/2026):** o **pipeline de status da `PecaConjunto` não avança** — quase tudo fica travado em **`CORTE`** e praticamente nada chega a `EXPEDIDO` (ex.: T67F 1722 pç todas em CORTE, T78B 1088, T64T 1762). Por isso o Dashboard do PCP e as carteiras contam obras já enviadas como "em aberto". A baixa do dashboard é paliativo de visão; o problema de fundo é o status das peças não ser mantido (ninguém "libera" montagem→…→expedido). Ver [[torg_fila_corte]].
