---
name: torg_cmr_lancamento_portal
description: O CMR tem TRÊS caminhos de escrita — planilha (2) e a tela de lançamento do portal (`registro_manual`); DO_CMR cobre os três SEMPRE com categoria MATERIAL (06/10)
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

**Resolvido em todo o portal (`56a9a688`, mesmo dia, Vitor: "pode corrigir"):** `ORIGENS_CMR` tem as três
origens e `DO_CMR` leva `categoria: "MATERIAL"`. A constante paralela do primeiro commit saiu. Passam a contar:
- a ficha do R no data book;
- o vínculo do certificado escaneado (`casar-pdfs`, o UPDATE de `match-certificados`, que ganhou o mesmo
  filtro de categoria, e a manutenção);
- a rastreabilidade/status e o lote de pintura;
- a checagem de existência dos botões de importar/atualizar a planilha, que deixam de criar outra linha
  para o mesmo R.

Teste: `testes/lib/cmr-tres-origens.teste.js`.

⚠ **Correção do que eu tinha dito:** não havia duplicata ATIVA.
- O R 261401 tem a entrada da planilha ativa, com corrida, certificado e PDF; a manual está desativada.
- O R 261392 tem a manual ativa e duas cópias da planilha, criadas pelo botão de importar 4 dias depois
  do lançamento e desativadas à mão. É a prova do defeito.

⚠⚠ **45 de 46 lançamentos do portal não têm corrida nem certificado** (medido em 06/10). Agora que contam,
o data book mostra "sem corrida no CMR" nessas linhas, o que é o certo: o Almoxarifado lançou com a nota
na mão, e o certificado completa depois, pela edição da tela (`camposEditaveisCmr`). Só 1 certificado
escaneado (R 261392) estava na pasta para casar.

⚠ Ao medir, não espalhe `...DO_CMR` e depois sobrescreva `categoria`: a chave de depois vence, e a
consulta passa a incluir o que o filtro existe para excluir. Caí nisso na medição.

Ver [[torg_rastreio_corrida]] e [[torg_qualidade_import_cmr]].
