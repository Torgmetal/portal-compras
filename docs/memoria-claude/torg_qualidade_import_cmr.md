---
name: torg-qualidade-import-cmr-perf
description: Importação do CMR (Rastreabilidade/Qualidade) é pesada (planilha ~17MB) e estourava a memória da função (OOM); resolvido migrando o parser de ExcelJS para SheetJS (lê só a aba do ano). CONFIRMADO em prod.
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

A importação do CMR (`app/api/qualidade/documentos/importar`) lê uma planilha de **~17MB**. O leitor antigo (ExcelJS) carregava o workbook inteiro (todas as abas + imagens/formatação) na memória e a função **morria por OOM**: *"instance was killed because it ran out of available memory"*.

Aparecia de jeitos diferentes e confundia (NÃO era acesso, link nem parse — era memória):
- **Safari:** "The string did not match the expected pattern."
- **Chrome:** "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" (o cliente fazia `res.json()` na página HTML de erro da Vercel).

**Correção que resolveu (2026-06-15, CONFIRMADA em produção):**
- `parseCMR` (lib/parse-cmr.js) **migrado de ExcelJS para SheetJS** (`xlsx`, já era dependência): leitura leve (`bookSheets`) só pra listar abas → depois lê **só a aba do ano mais recente** em modo `dense`, ignorando imagens/estilos e as outras abas. Acabou o OOM.
- Margem extra mantida (não resolviam sozinhos!): `maxDuration=300` na rota + memória da função **3009MB** (vercel.json `functions`). O problema era OOM do ExcelJS, não tempo.
- Resultado em prod: Pré-visualizar ~20s, **145 certificados importados** (137 com corrida, 8 sem), 0 erro. Dedupe por `importRef` (reimportar só traz linhas novas).

**Observar / próximos passos:**
- 17MB ainda é grande — a planilha provavelmente tem imagens coladas / muitas abas; enxugar na origem deixaria a importação instantânea.
- As **8 sem corrida** travam a Seção 04 do Data Book até corrigir a corrida na origem (CMR).
- **"Casar PDFs"** (liga os certificados escaneados por índice R, pasta `Certificados Digitalizados`): FEITO — 141/145 vinculados (4 sem scan: 260013, 260032, 260059, 260136). O POST fazia 1 updateMany por PDF (centenas → timeout/504); reescrito pra **1 UPDATE com `UNNEST`** (bulk write do CLAUDE.md), maxDuration 120. Ver o certificado: ícone 👁 na coluna Ações → `/api/qualidade/documentos/[id]/download?inline=1` (proxy autenticado, abre o PDF inline) — confirmado em prod.
- **Seção 04 do Data Book**: FEITO — botão **"Trazer certificados de material desta OP"** (endpoint `POST /api/qualidade/data-books/secao/[secaoId]/popular-material`: `createMany skipDuplicates` dos docs MATERIAL da OP + marca a seção ANEXADO). Vincula por `categoria=MATERIAL` e `opNumero = book.opNumero`. O gerador (lib/databook-pdf.js) JÁ mescla os PDFs dos certificados vinculados → dossiê do cliente. Testado em prod: data book OP-067 (DANPOWER) → 31 certs na Seção 04, ANEXADO. (PDF final do data book ainda NÃO foi testado com muitos certs — risco de perf como no import.)
- **Gotcha — numeração de OP**: o `opNumero` dos certs vem de `soDigitos` da coluna Obra do CMR e nem sempre casa com `OP.numero`. Em 2026-06-15: casavam 067/064/060; tinham certs mas SEM OP correspondente: 074, 071, 036, 008, 079, 038, 050, 069, 076. Esses não entram num data book até a numeração casar.
- Deploy: a Vercel teve **lag pra disparar os pushes** nesse dia (vários deploys); o deploy do parser SheetJS demorou ~minutos a aparecer. Ver [[torg_vercel_neon_deploy]] e [[torg_qualidade]].
