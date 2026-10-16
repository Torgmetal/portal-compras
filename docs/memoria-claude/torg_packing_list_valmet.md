---
name: torg_packing_list_valmet
description: Obras Valmet emitem o Packing List da Valmet (modelo LMS BRACELL) no lugar do FORM 22; dados da pasta da obra a cada emissão
metadata:
  type: project
---

Obras com cliente **Valmet** emitem, no assistente "Emitir romaneio", o **Packing List da Valmet** (Excel + PDF na 4.2),
igual ao FOR-081 da TMSA ([[torg_romaneio_tmsa]]). Vitor, 16/10/2026: "precisa acessar a pasta da obra e verificar as
informações e preencher todas as informações".

Fontes, lidas A CADA emissão (nada gravado no portal):
- `1. Comercial/1.3 Pedido de compras`: **OC** de maior revisão ("rev1" vence) → Order Txt `351/401541` (companhia/OC,
  como a Valmet exige na NF) e projeto `J5A199`; **Instrução de Faturamento** → comprador e supervisor na obra.
- `2. Engenharia/2.5 Projetos/2.5.2 Fabricação/2.5.2.5 Listas de Controle Interno`: **Lista de Equivalência Torg ×
  Valmet** de maior `_Rnn` (uma aba por desenho de montagem PM-01…06) → "Desenho Valmet" = **Valmet Code** por marca.

**Why:** a lista de equivalência SOFRE REVISÃO — a R01 trocou MF01219225→MF01219515 (95 peças) e 227→516 (6) na OP-094,
e os romaneios 01/02 (feitos à mão) já tinham saído com o código velho.

**How to apply:**
- Order Item = nº do volume; Nr. do Pacote = fórmula do modelo (NF + fornecedor; NF digitada na emissão); TAG = marca
  Torg; Desenho em branco — decisões do Vitor.
- ⚠ "Código do material" fica VAZIO: o comentário da própria Valmet na célula diz "Not Use". Os comentários do modelo
  são os nomes de campo da Valmet e ficam no arquivo (o exceljs quebra se `protection` vier nula — refazer com `texts`).
- ⚠ unpdf com `mergePages:true` cola tudo numa linha e as regex perdem os campos; usar `false` e juntar com "\n".
- ⚠ O `revisaoDoArquivo` da TMSA (`\bR(\d+)\b`) NÃO vê `_R01` (o "_" mata a fronteira) — usar `revisaoValmet`.
- Código: `lib/packing-valmet*.js`; PDF pelo desenhador do FOR-081 (`lib/romaneio-tmsa-pdf.js`).
