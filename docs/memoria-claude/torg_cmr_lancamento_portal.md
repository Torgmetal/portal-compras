---
name: torg_cmr_lancamento_portal
description: O CMR tem TRÊS caminhos de escrita — planilha (2) e a tela de lançamento do portal (`registro_manual`); quem lê fardo tem de incluir o terceiro, e data book/certificados ainda não incluem
metadata:
  type: project
---

Gabriel (Engenharia), OP-120, 06/10/2026: o UDC 115x60x4,75 (R 261773) e o 128x60x4,75 (R 261774)
chegaram, o Eduardo lançou pela **tela de lançamento do CMR** (`lib/cmr.js` → `origem: "registro_manual"`),
e a janela "Selecionar R" dizia "0 de 77 recebimentos compatíveis" na busca pelo próprio R.

- **Causa:** `DO_CMR` (`lib/cmr-origens.js`) só aceitava `importacao_planilha` e `planilha_sharepoint`.
  O comentário dali já avisava: "esquecer a segunda apaga a entrada da vista". Agora são três.
- **Medido:** 47 lançamentos `registro_manual` de MATERIAL, todos "Certificado de material", de 10/09 a
  06/10, sendo 42 da OP-118 e 4 da OP-120.
- **Corrigido (`dc2aea12`):** `DO_CMR_COM_LANCAMENTO` só na leitura de fardos (`lib/fardos-compativeis.js`),
  que já exige `categoria: "MATERIAL"`.
  - ⚠ `registro_manual` também é gravado por documentos da Qualidade e por calibração; sem a categoria,
    entraria lixo.
  - O Liberar frentes (`material-liberacao`) e a gravação do R já enxergavam, porque não filtram origem.

⚠⚠ **AINDA NÃO INCLUEM O LANÇAMENTO DO PORTAL (pendente, pede decisão):**
- `lib/databook-ficha-r.js`: a ficha do R no data book pode sair `R xxxx | — | —`, sem corrida nem
  certificado. A OP-118 tem 42 assim.
- `documentos/casar-pdfs` e `lib/match-certificados.js`: o certificado escaneado não cola sozinho na
  entrada lançada pelo portal. Atenção: este caminho GRAVA o vínculo do PDF.
- `qualidade/rastreabilidade/status` e `lib/pintura-lote.js`: leitura, mesma classe.
- Importadores (`documentos/importar`, `cmr/sincronizar`, manutenção): procuram a linha da planilha por
  R entre as origens da planilha. A linha lançada no portal e depois escrita na planilha vira
  **duplicata ativa** (o R 261401 da OP-118 já está assim). Tratar a linha do portal como linha da
  planilha muda o que eles atualizam: exige teste próprio.

Ver [[torg_rastreio_corrida]] e [[torg_qualidade_import_cmr]].
