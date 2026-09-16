---
name: torg_referencias_cliente_aditivo
description: Referências do cliente (TPR/OC/ETC/TAG) com papéis fixos e palavras de cada cliente (Cliente.termos + OPReferencia); aditivo = pedido novo do cliente (status, valor, receita/medição próprias) com comunicado + aceite por setor
metadata:
  type: project
---

**Vitor (16/09/2026):** "precisamos ter campos para descrever as TAGs, OCs, TPR da TMSA (…) não está claro
a estrutura para um novo aditivo (…) e um aviso para os setores"; sobre outros clientes: "vamos deixar
amarrado esses termos?" → **não**; "aditivo: linha de medição nova, linha de materiais novas como se
fosse uma nova OP". Desenho em `docs/superpowers/specs/2026-09-16-referencias-cliente-aditivo-design.md`.

**Papéis fixos, palavras do cliente.** PROJETO (TPR, ENC, obra) · PEDIDO (OC, AF, PC — o que o Fiscal
fatura) · ITEM (ETC) · TAG (TC 8011) · OUTRO (TDR, CNO). O portal só conhece o papel; o rótulo vem do
**dicionário do cliente** (`Cliente.termos`, tela Comercial › Clientes) e é **fotografado** em
`OPReferencia.rotulo` na hora. Dicionários iniciais: TMSA TPR/OC/ETC/TAG; Danpower ENC/PC; Marko AF;
Valmet OC/TAG (`DICIONARIOS_INICIAIS`, lib/referencias-cliente). Cliente sem dicionário = rótulos genéricos.

- `OP.refCliente` passou a ser **derivado** (PROJETOs + PEDIDOs) sempre que as referências mudam — os
  ~60 documentos que o imprimem continuam iguais. Texto manual só vale sem referências.
- Tabelas por `scripts/ensure-mes-tables.mjs` (Cliente, OPReferencia, AditivoAceite + colunas). ⚠ O
  bloco tem de ficar na parte de `main()` que roda SEMPRE (depois de EtiquetaCalibragem) — a primeira
  inserção caiu no ramo que só roda quando as tabelas MES não existem, e nada foi criado. ⚠ Nunca
  emendar esse script com `String.replace(texto)`: o bloco tem `$$` e crase, e `$'`/`$$` são padrões
  do replace — o arquivo foi para 4.483 linhas. Emendar por índice (`slice`) ou com função.

**Aditivo = pedido novo do cliente.** `status` RASCUNHO → DIVULGADO → EM_EXECUCAO → ENCERRADO,
`valor`, referências com `aditivoId`, `OPReceita.aditivoId` (sem estudo, nasce uma linha com o valor),
`OPMedicao.aditivoId` (escolhido ao vincular o pedido Omie — **não** se cria medição placeholder: em modo
manual `valorFaturadoAuto = valorBruto`, e o aditivo apareceria como faturado). Itens de verba
(AditivoItem) continuam sendo a linha de materiais.

**Comunicado aos setores** (`lib/aditivo-comunicado.js`): PDF padrão Torg **sem R$** + e-mail com
botão de aceite por pessoa (`AditivoAceite`, token; página `/aditivo/aceite/[token]`, liberada no
middleware) + sino (`ADITIVO_DIVULGADO`) para ENGENHARIA, PLANEJAMENTO, PCP, PRODUCAO, QUALIDADE,
EXPEDICAO, COMPRAS, FINANCEIRO, FISCAL. Cobrança em `/comercial/kickoffs` (seção "Aditivos — Aceites",
`POST /api/comercial/aditivo/[id]/cobrar`, reusa o convite). Perguntas ainda abertas com o Vitor: uma OC
com vários ETC; TAGs digitadas × importadas da LX da TMSA (OP-122 Vale); quem dá aceite.

⚠ `scripts/revisao-codex/consultar.py` **não existe** no clone (CLAUDE.md manda consultar o Codex antes
de mexer em schema): a consulta `database` não rodou — pendência, não validação.
