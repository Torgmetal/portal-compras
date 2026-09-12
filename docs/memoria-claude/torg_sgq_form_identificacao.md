---
name: torg_sgq_form_identificacao
description: FORM do SGQ vai carimbado DENTRO do documento (rodapé/célula), nunca no nome do arquivo; índice mestre é a autoridade
metadata:
  type: feedback
---

O número do formulário do SGQ vai **dentro do documento** — rodapé do PDF, ou a célula G7 do
modelo .xlsm (o campo `(FORM 22 Rev.00)`, acima de "ESTE DOCUMENTO FAZ PARTE DO SISTEMA DE GESTÃO
DA QUALIDADE"). **Nome de arquivo fica livre e descritivo.** Helper: `refFORM()` de `lib/sgq-forms.js`
(formato `"planilha"` reproduz o carimbo do .xlsm).

**Why:** a ISO 9001:2015 §7.5.2 pede "identificação e descrição (título, data, autor ou número de
referência)" e a §7.5.3.2 controle de alterações — nada sobre nome de arquivo. Nome de arquivo
qualquer um renomeia, e não sobrevive à impressão, ao anexo de e-mail nem à seção do Data Book. E o
"padrão `FORM nn - ...`" que parece existir no SharePoint só aparece no GRD e num registro de
calibração: é hábito de quem emitia GRD, não regra. Vitor corrigiu isso em 30/08/2026, depois de eu
já ter renomeado os arquivos (commit a5d7a1d, revertido em b37a7431).

**How to apply:** ao criar exportação nova, conferir o índice mestre
`FORM - 00 - Lista de Informação Documentada.xlsx` (aba FORMULÁRIOS) — é a autoridade: 34 formulários,
20 ativos, 11 INATIVOS, 3 EXCLUÍDOS. Os inativos são exatamente os que o portal substituiu (10 ata,
11 competências, 12/13 treinamento, 17/19 provedores, **18 = a RM**, 20 RTNC): não carimbar número
de formulário aposentado. E só carimbar quando o documento É o formulário — relatório gerencial
sobre o assunto não é o formulário do assunto (o GRD do portal é histórico de liberações, não a guia
FORM 09). Ver [[torg_qualidade]], [[torg_romaneio_terceiro]], [[torg_rnc]].
