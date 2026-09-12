---
name: torg_tekla_tmsa_vale
description: OP-122 Vale/TMSA (TPR00751) — acompanhamento no formato do cliente; teste no Tekla 2025 com UDAs de montagem (SKU, TAG, CWP, Item LX, desenho) em docs/tekla-tmsa-vale
metadata:
  type: project
---

**OP-122 = Vale, Expansão da PDE N5W, via TMSA (projeto TPR00751, OC 231297-1, pacote N1455).** A TMSA exige três
documentos no modelo dela (planilhas em ~/Downloads e nos e-mails de 11/09): **Avanço de Fabricação** semanal (corte
sexta, envio segunda; colunas cinza = lista LX da TMSA, amarelas = Torg em kg por etapa), **Mapa de Controle e Registros**
por TAG (21 tipos: CI, MP, UM, CS, CE, CP, EF, AC, DM, EPS, CQS, EVS, LP, PM, US, AS, RG, AD, PU, SGS) e **Romaneio padrão**
`TPR00751-XXX_TORG_YY` (XXX = embarque TMSA, YY = nosso; NF só após aprovação; carregamento liberado por TMSA/Vale).
Reunião de PIM 22/09/2026 08:30 na Torg (Levi Soares, TMSA). Prévia aprovada: artifact
https://claude.ai/code/artifact/e66dfd2e-0d19-4a44-9eda-9fe59c011c41 — perfil de acompanhamento por OP, cinco blocos
(itens LX ↔ marca, avanço, mapa, romaneio, e-mails). **O SKU é definido pela TMSA** (coluna cinza; vai em etiqueta RFID).

**Tekla 2025 (Windows do Vitor):** o caminho é Open API/macro, não controle de tela. Pacote em `docs/tekla-tmsa-vale/`:
`objects.inp` (5 UDAs da MONTAGEM na aba "TMSA / Vale"), `TORG_TMSA_PreencherUDA.cs` (macro que grava os UDAs a partir
de `mapeamento-sku.csv` casando por ASSEMBLY_POS), LEIA-ME. Depois: cópia do relatório de LPC ("036 VFI_Lista de peças
por conj") com as colunas `ASSEMBLY.USERDEFINED.*`, para o portal importar o SKU junto com a marca. A sessão do Mac não
alcança o Tekla; quem roda é a sessão do Windows.

**Why:** a Torg precisa entregar no formato do cliente sem digitar; o vínculo SKU × marca é o coração.
**How to apply:** ver [[torg_preco_venda_kg]] (obra Galvani) e [[torg_listas_le_lpc]] (importadores).
