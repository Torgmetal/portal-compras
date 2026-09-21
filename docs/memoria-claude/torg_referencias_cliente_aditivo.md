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

## A abertura do aditivo é PÁGINA, e a receita se digita à mão (17/09/2026)

Vitor, olhando o modal "Novo aditivo" no localhost: "e onde eu descrevo a receita por exemplo?"
(não tinha onde — nascia sozinha da planilha do estudo ou de UMA linha com o "valor do aditivo"),
"está muito ruim de ver essas info" e "para o caso de ter que digitar na mão precisamos de algumas
coisas, informar o peso, unitário e a descrição".

- `/comercial/[id]/aditivo/novo` (`NovoAditivoClient.jsx`), em 5 blocos na ordem em que o Comercial
  pensa: **1 Pedido do cliente** (OC/ETC/TAG) → **2 Receita** (`ReceitasAditivoEditor`: descrição,
  cobrado por kg/pç/m²/m/un/valor fechado, peso × unitário = total; avisa se não bate com o valor
  da OC) → **3 Verba de compras** (os `ItemFormRow` de sempre) → **4 Prazo e comunicado** →
  **5 Proposta e estudo** (recolhido; anexar preenche receita/verba/descrição só se ainda em branco).
  Sem `<form>`: o navegador de pastas e as linhas têm botões próprios.
- A conta mora em `lib/receita-aditivo.js` e a rota usa a MESMA (`receitasDoAditivo`): precedência
  digitado > planilha do estudo > uma linha com o valor. O `valor` do aditivo = soma das linhas.
- ⚠ Receita ≠ verba continua valendo: as linhas viram `OPReceita` marcadas com `aditivoId` (aba
  Resumo › Receitas do contrato) e aparecem no cartão do aditivo na aba Obra só para quem vê
  financeiro (a página apaga `op.receitas` dos outros).
- O `ModalAditivo` do `OPDetailClient` foi removido; os botões "Novo aditivo" (cabeçalho e aba Obra)
  fazem `router.push` para a página.
