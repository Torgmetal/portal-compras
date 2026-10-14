---
name: torg_recebimento_estoque
description: RRA (arame) e RRP (penetrante) são de ESTOQUE, sem OP — RRA-EST-001; entram na §12 de cada data book cuja obra usou o R (arame) ou o lote no LP (penetrante); tinta segue por OP
metadata:
  type: project
---

**Pedido (Vitor, 14/10/2026):** *"ele pede para selecionar a OP — o que não pode ser, pois o Arame será usado
para várias obras"*, e depois o mesmo para *"líquido penetrante e revelador"*. Obra sem RRA não é problema: o
responsável do data book cria o recebimento depois.

**Como ficou (`357de8e9`, `lib/recebimento-estoque.js`):**
- `opNumero = "EST"` (`OP_ESTOQUE`, em `lib/recebimento-certificados.js` para a tela poder usar). Código
  **RRA-EST-001** / RRP-EST-001 — `codigoRelatorio` tratava "EST" como "000". A rota de criação IGNORA a OP que
  chegue para esses dois tipos, sem contrato (é da obra) e sem checar escopo.
- **Distribuição:** assinado por todos, entra na **§12** de cada data book ABERTO cuja obra usou:
  - arame → pelo **R**: `consumiveisDaOP` (o arame vigente na data da solda de cada conjunto, o mesmo do carimbo e da §06);
  - penetrante → pelo **lote**: `penetranteLote`/`removedorLote`/`reveladorLote` dos relatórios LP da obra (N.A. ignorado).
  Uma obra recebe todos os que usou. Recalcula, não acumula: não usado/não assinado → sai (só livro aberto).
- Quem distribui: `vincularNoDataBook` delega para `vincularRecebimentoDeEstoque` quando `opNumero === "EST"`
  (cobre a última assinatura) **e o cron `/api/cron/data-book`** (hora em hora, horário comercial) para a obra
  que soldar/usar o lote DEPOIS da assinatura.
- PDF: "ORIGEM: Estoque — uso em várias obras" no lugar de OP/cliente/contrato (`identificacaoRir`).
- Tela: o modal do computador esconde o campo OP; no celular a OP escolhida antes não vai ao relatório e o
  tipo aparece mesmo fora do escopo da obra. Lista mostra "Estoque".

⚠ **Antes disso a busca de certificados estava QUEBRADA em produção** (`818bcfa7`): o select pedia
`DocumentoQualidade.indiceR`, que não existe (o R é `importRef`) — "Unexpected end of JSON input". Estava
também na criação do recebimento e na rota do PLP. Prisma mockado não pega campo inexistente: os testes agora
conferem o select contra o schema (`testes/lib/campo-indice-r-inexistente.teste.js`).

Relacionado: [[torg_recebimentos_certificado]], [[torg_databook_relatorio_assinado]].
