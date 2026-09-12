---
name: torg_excel_padrao
description: "Padrão das planilhas Torg — lib/excel-relatorio.js (criarRelatorioTorg, cabeçalho ISO 9001 + logo); usar em TODO export xlsx"
metadata: 
  node_type: memory
  type: reference
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-07-23T18:48:45.779Z
---

Quando o Vitor pede "exportar um relatório **no padrão das planilhas que já temos**", ele quer **`lib/excel-relatorio.js`** — helper com branding Torg + cabeçalho **ISO 9001** de controle de documentos (logo, TORG METAL / Estruturas Metálicas / título, Código + Revisão + Emissão, rodapé "Documento controlado", paisagem fitToWidth).

**API:** `criarRelatorioTorg({titulo, subtitulo, kpis[], totalColunas, nomePlanilha, codigoDoc, revisao, elaboradoPor})` → `{workbook, sheet, linhaInicio}`; depois `adicionarHeaderTabela(ws, linha, headers)`, `adicionarLinhaTabela(ws, linha, valores, {fillColor, fontColors, alinhamento})`, `adicionarLinhaTotais` (aceita `{formula:"SUM(D5:D9)"}` — usar FÓRMULA, não valor calculado), `adicionarRodapeISO`, `adicionarLegenda`, `downloadWorkbook(wb, fileName)`, `CORES`.

⚠️ **É browser-side** (busca o logo em `/torg-logo-excel.png` e importa `exceljs` dinamicamente) — importar dentro de componente `"use client"`, idealmente com `await import("@/lib/excel-relatorio")` no clique. Em Node o logo falha silencioso (try/catch → null), então dá pra testar num stub `.mjs` gerando o arquivo com `workbook.xlsx.writeFile()`.

**Códigos de documento** (`DOC_CODES` no arquivo) por módulo: REL-PRD-00x (produção — inclui **REL-PRD-005** = Status de Produção da OP, commit bffe2af), REL-ALM-001, REL-EXP-00x (expedição — **REL-EXP-003** = Lista de Expedição da OP), **REL-ENG-001** (Projetos e desenhos da OP) e **REL-ENG-002** (Lista de peças/LPC da OP, commit 6c7a3d7) — ver [[torg_op_vistas]]. Título fora da lista cai em REL-GER-001; passar `codigoDoc` explícito ao criar relatório novo.

⚠️ **`totalColunas` < 5 quebra** o merge do cabeçalho ISO (`colControleInicio = max(total-2, 4)` colide) — usar 5+ colunas. E a linha de totais com `{formula:"SUM(...)"}` grava `<f>` SEM valor em cache: ler o xlsx com SheetJS mostra a célula vazia, mas o Excel calcula ao abrir — conferir no XML (`unzip` + `grep '<f>'`), não pelo valor.

Exemplos p/ copiar: `app/producao/mapa/MapaProducaoClient.jsx` (exportarSetor) e `app/comercial/[id]/DesenhosOPSection.jsx` (exportar).

🚨 **`adicionarHeaderTabela` e `adicionarLinhaTabela` NÃO devolvem a próxima linha** (devolvem `undefined`). A convenção da lib é incrementar à mão:

```js
let linha = linhaInicio;
adicionarHeaderTabela(ws, linha, headers); linha++;
for (const x of lista) { adicionarLinhaTabela(ws, linha, [...]); linha++; }
adicionarLinhaTotais(ws, linha, [...]);
```

Escrever `linha = adicionarLinhaTabela(...)` faz a primeira linha chamar `getCell(undefined, 1)` e estourar. Aconteceu na planilha do `/pcp/producao` em 24/08/2026.

⚠️ **Sempre `try/catch` no `exportar()`**, com mensagem na tela. Sem ele o erro some: o clique não faz nada e não diz nada, e o usuário acha que o navegador travou — foi assim que o bug chegou ao Vitor em vez de aparecer no portal.
