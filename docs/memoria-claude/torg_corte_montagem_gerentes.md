---
name: torg_corte_montagem_gerentes
description: Produção › Corte e montagem — consulta no celular dos gerentes; mesma rota e mesma regra de situação do PCP (lib/status-setor)
metadata:
  type: project
---

Matheus (03/10/2026): tela de consulta para os gerentes de Corte e Montagem, no celular de pé
(`app/producao/corte-montagem`). Obra → setor → cartões com situação, feito/qtd e croquis
("0/6 · faltam 6", toque abre quais faltam com "faltam X de Y").

- Dados: `/api/pcp/despacho?opId&setor` (o mesmo do PCP) — nunca uma segunda conta.
- `lib/status-setor.js` (feitoDaPeca, situacaoDaPeca, SIT, resumoDoSetor) é a regra ÚNICA; o
  ProducaoClient do PCP importa dali. Mudou o critério, muda nas duas telas.
- Só consulta: liberar/baixar/programar continuam no PCP.
- Desenho: na Montagem a marca abre o `DesenhoPecaModal` com `soVer` — só "Ver desenho"; emitir
  carimbado e imprimir GRD ficam no PCP (pedido do Matheus, 03/10/2026).
- Todos os módulos já viram gaveta no celular (`app/globals.css`, max-width 1023px) — não precisa
  layout próprio.
- PCP › Produção: abaixo do `md` a tabela tem min-w 900 e rola só ela; acima, segue a regra do Vitor
  (sem rolagem lateral).

**15/10/2026 — rápida, filtro e desenho impresso (Matheus):**
- Lista das obras: `/api/pcp/producao?lista=1` → `listaDeObrasDaProducao` (lib/prioridades-setor-data),
  mesmas obras do PCP via `obrasCandidatas`, sem carregar peça (5 s → <1 s); a última lista fica no
  localStorage e aparece na hora.
- Desenho: índice da pasta 2.5.2 Fabricação também no banco (`DesenhoIndice`, cache entre lambdas;
  TTL 5 min contado da varredura). A tela chama `?aquecer=1` ao abrir a Montagem. ⚠ Índice
  vencido NUNCA é servido, nem para só ver: chegou a aceitar até 2 h na consulta, e o Codex barrou
  (revisão substituída/OBSOLETOS sem aviso ao montador) — Matheus decidiu voltar aos 5 min.
- "Só o que falta" virou **"Não montado"** (Corte: "Não cortado"). A regra estava certa; em obra
  grande (OP-118: 2.641 peças) a lista inteira desenhada travava o celular e parecia que o filtro
  não funcionava → cartões em lotes de 60 com "Mostrar mais".
- Montagem mostra "desenho impresso dd/mm" discreto quando há GRD (`p.grd`, já vem do despacho).
