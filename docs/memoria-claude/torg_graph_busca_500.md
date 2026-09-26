---
name: torg_graph_busca_500
description: O search do Graph neste drive devolve HTTP 500 desde 22–23/09/2026 e derrubou SEIS pontos, só UM com alarme; os SEIS foram corrigidos listando por caminho — delta e varredura cega NÃO servem (medido), e o modelo em branco da LQC vinha sendo escolhido por data, o que já era bug
metadata:
  type: project
---

⚠⚠ **O ÍNDICE DE BUSCA DO SHAREPOINT ADOECEU, E ISSO NÃO TEM CONSERTO DO NOSSO LADO.** Desde
22–23/09/2026, no drive do portal, tudo que passa por `search` devolve **HTTP 500
`generalException`**. Medido em 26/09 com o mesmo token, nos mesmos segundos:

| chamada | resultado |
|---|---|
| `drives/{id}/root/search(q='LQC')` | **500** |
| `drives/{id}/root:/Comercial/1. Orçamento:/search(q='LQC')` | **500** — escopar em pasta **não** salva |
| `…/2.5.2 Fabricação:/search(q='T105')` | **500** (OP-105 e OP-103) |
| `…/children` por caminho | **200**, ~100 ms |

⚠⚠ **SEIS PONTOS DEPENDEM DA BUSCA E SÓ UM AVISA.** O cron tem heartbeat; os outros cinco são tela,
e tela que falha não manda e-mail para ninguém:

| onde | o que para | alguém é avisado? |
|---|---|---|
| ✅ `lib/lqc-sharepoint.js` (`listarLqcs`) | cron `lqc-sharepoint` | **sim** — 65 h sem sucesso |
| ✅ `app/api/producao/desenhos/route.js` | **modal de desenhos, em 7 telas de PCP/produção** | não |
| ✅ `lib/lqc-planilha.js` (`baixarModeloLqc`) | criar LQC no portal (modelo em branco) | não |
| ✅ `lib/lqc-op-servidor.js` (`lerFonteLqc`) | gerar OP a partir da LQC | não |
| ✅ `lib/databook-arquivo.js` (`procurarArquivoPorNome`) | 4º degrau que resgata certificado movido | não |
| ✅ `lib/sharepoint-lpc.js` (`buscarLpcDaOp`) | importar revisão de LPC | não |

⚠ O modal de desenhos degrada **quieto**: as liberações de GRD já gravadas continuam aparecendo
(vêm do banco), só a lista de PDFs disponíveis fica vazia. Marca que já tem GRD parece normal.

## As duas saídas que NÃO servem — medidas, não supostas

⚠⚠ **A CORREÇÃO DO CMR NÃO SE TRANSPLANTA.** `lib/cmr-localizar.js` varre a árvore da
rastreabilidade (teto de 600 pastas) e resolveu o CMR. A árvore `/Comercial/1. Orçamento` tem **mais
de 5.000 pastas** — ~3.000 só em `ORÇAMENTOS_2026`. A varredura cega **estourou a cota do Graph**:
`429 activityLimitReached`, ~1.370 respostas perdidas no meio. Varredura que falha em 1/3 das pastas
escolheria arquivo velho sem erro nenhum.

⚠⚠ **`delta` TAMBÉM NÃO.** `root/delta` não usa o índice de busca e responde — mas o drive é grande
demais: **328.592 itens em 301 páginas, 330 s, sem terminar**, e nenhuma LQC nas 301 primeiras
páginas. Não cabe em cron.

## O que serve: a estrutura é regular

⚠⚠ **TODA PASTA DE ORÇAMENTO TEM AS MESMAS 7 SUBPASTAS, E A LQC MORA EM `5.Estudos`.**
`/Comercial/1. Orçamento/ORÇAMENTOS_2026/` → `1. Solicitados` (16), `2. Concluidos` (**307, todas
numeradas `NNN-26-CLIENTE-OBRA`**), `3. Declinados` (11), `COTAÇÕES_2026`, `Workspace`. Dentro de
cada: `1.Emails | 2.Projetos | 3.Documentos | 4.Cotações | 5.Estudos | 6.Propostas |
7.Confidencialidade`.

Medido em 26/09, listando as 334 pastas de orçamento **e** o `5.Estudos` de cada:
**651 chamadas ao Graph, 33,5 s, ZERO throttle** → 110 LQC, **90 de 2026 com número, em 83
orçamentos**. A busca, em 29/08, achava 93 / 74 / 54. Listar acha pelo menos tanto quanto buscava.

⚠ **Precisa listar OS DOIS níveis.** 21 pastas (todas em `1. Solicitados`, obra em andamento) não
têm `5.*`, e **4 LQC estão soltas no nível da pasta do orçamento** — olhar só `5.Estudos` perderia
essas quatro. E há **4 cópias** do modelo `LQC-000-00`, o que confirma o aviso que já estava em
`lib/lqc-planilha.js`.

⚠ Para os desenhos vale o mesmo: a pasta `2.5.2 Fabricação` é conhecida, e listar as subpastas
A1–A4 custa poucas chamadas por OP.

⚠⚠ **A COTA DO GRAPH É COMPARTILHADA POR TODOS OS CRONS.** Paralelismo 3 com pausa entre lotes
passou sem um único 429; paralelismo 8–10 em 2.500 pastas derrubou. Quem escrever varredura nova
mede isso ANTES, porque o preço de errar sai no cron do vizinho.

Ver [[torg_crons]], [[torg_sync_sharepoint_pcp]], [[torg_databook_certificado_movido]] e
[[torg_orcamento_lqc_numero]].

## O que foi corrigido em 26/09 (✅ na tabela) — e o que sobrou

`lib/sharepoint-arvore.js` é a peça nova: `varrerArvore` lista por caminho, pagina o
`@odata.nextLink`, respeita o `Retry-After` do 429 e **derruba a varredura inteira** se qualquer
pasta falhar. ⚠ Raiz 404 é `null` (resposta legítima: OP sem pasta de projeto); subpasta 404 no
meio é corrida normal e se ignora.

⚠ **Não reaproveitei `listAllFilesRecursive` de propósito** — ela tem `catch { return }` por pasta
e `maxDepth: 5`. No modal de desenhos isso seria o pior defeito possível: pasta que falha vira
"a marca não tem desenho", indistinguível de não ter mesmo. Ela ficou intocada para os outros
chamadores.

**Modal de desenhos** (`lib/desenhos-fabricacao.js`): varre a `2.5.2 Fabricação` da OP e filtra a
marca em memória. Medido contra a produção: OP-105 307 PDF em 5,7 s, OP-103 79 PDF em 2,9 s; a
2ª abertura é **0 ms**.
- ⚠⚠ **O CACHE GUARDA A PROMESSA, NÃO O RESULTADO.** Três marcas abertas juntas disparariam três
  varreduras idênticas. E **falha não vira retrato**: o erro solta a entrada, senão o modal ficaria
  quebrado por cinco minutos depois de um blip.
- ⚠⚠ **TETO DE 600 PASTAS, menor que o padrão de 2.000.** Isto roda dentro do pedido do navegador:
  a 2.000 pastas passaria de dois minutos e a Vercel mataria a rota — o operador receberia HTML no
  lugar de JSON. `maxDuration` subiu de 60 para 120 s.
- ⚠ **Obsoleto passou a ser barrado pelo CAMINHO INTEIRO.** Com a busca só dava para olhar o pai do
  arquivo; agora um PDF em `…/A/OBSOLETOS/2025/` também é descartado.

**Cron do LQC** (`varrerPastasDeLqc`): anda só até o `5.Estudos`, nunca mais fundo — é isso que
segura a cota. Medido contra a produção: **46,5 s, 659 pastas, 90 LQC de 2026 em 83 orçamentos**,
idêntico ao levantamento independente. ⚠ **De-dup pelo `id` do drive**: a mesma LQC aparece em duas
pastas quando a obra sai de "Solicitados" para "Concluidos" e a cópia velha fica.

## Os outros quatro, fechados no mesmo dia

Medido contra a produção depois de cada troca:

| ponto | custo agora |
|---|---|
| `baixarModeloLqc` | **1,9 s** (varre só a pasta `000-…`; a varredura inteira ficou de reserva) |
| `procurarArquivoPorNome` | **3,3 s**, e reencontrou o `R 261163.pdf` em "Certificados 2026/Certificados Digitalizados" |
| `buscarLpcDaOp` | 10–16 s por OP (OP-102 2 obras, OP-103 1, OP-105 3) |
| `lerFonteLqc` | **45 s** — ver abaixo |

⚠ **`procurarArquivoPorNome` MUDOU DE ARQUIVO**, de `lib/sharepoint.js` para
`lib/sharepoint-arvore.js`. Ela era uma busca; agora é varredura. Quem procurar por ela no lugar
antigo acha um comentário apontando o novo.

⚠ **O cabeçalho de `lib/sharepoint-lpc.js` dizia "NÃO faz crawl recursivo (a árvore de cada OP é
enorme)".** Não é: medido, ~130 pastas e 8–9 s. Aquilo foi escrito quando a varredura era
sequencial. Documentação que envelhece vira decisão errada — por isso a medida ficou no lugar.

⚠⚠ **`lerFonteLqc` LEVA 45 s E EU NÃO ESTREITEI, DE PROPÓSITO.** Dava para olhar só a pasta
numerada do orçamento (~3 s), mas a garantia desta função é *"existe UMA cópia desta planilha no
servidor"* — e a LQC-295-26-R01 está em DUAS pastas (`2. Concluidos/295-26-DANPOWER-ENC0337` e
`1. Solicitados/24_09 - DANPOWER-REVISÃO - VITOR`). Estreitando, ela escolheria uma em silêncio.
Gerar OP com a planilha errada é pior que esperar. `maxDuration` das duas rotas: 60 → **300 s**.

## Dois achados de DADO que apareceram na prova (não são defeito de código)

⚠⚠ **ESTUDO 295 — RESOLVIDO EM 26/09, E QUASE APAGUEI O ARQUIVO ERRADO.** Eu tinha dito que a
cópia sobrando era a de `1. Solicitados`, pela lógica de que a obra passou para "Concluidos" e a
velha ficou para trás. **Era o contrário**, e só os bytes mostraram:

| arquivo | tamanho | modificado |
|---|---|---|
| `1. Solicitados/24_09 - DANPOWER-REVISÃO - VITOR/…R01.xlsx` | **749.141 B** | 24/09 |
| `2. Concluidos/295-26-DANPOWER-ENC0337/…R01.xlsx` | 472.033 B | 08/09 |
| `2. Concluidos/295-26-DANPOWER-ENC0337/5.Estudos/…R00.xlsx` | 472.033 B | 08/09 |

O "R01" que estava na pasta da obra era o **R00 renomeado** — sha256 idêntico ao arquivo logo
abaixo. O R01 de verdade, 277 KB maior, é o da pasta de data. Apagar "a de Solicitados" teria
destruído o único R01 com conteúdo. Apagado o renomeado (id `012SCVJYN7T4…`, com conferência de
nome+pasta+tamanho+sha antes do DELETE); `lerFonteLqc` da 295 passou a funcionar.

⚠⚠ **A LIÇÃO: "qual é a cópia velha" NÃO SE DEDUZ DA PASTA NEM DA DATA DE CRIAÇÃO.** As duas foram
criadas com 35 s de diferença (23/09 19:39 e 19:40) — provavelmente a mesma operação de cópia. O
que separou foi TAMANHO e HASH. Antes de apagar arquivo de proposta, baixe os dois e compare.

⚠⚠ **ESTUDO 316 — A ORIGEM QUEBRADA ERA SINTOMA; O ESTUDO TINHA DADO DE OUTRA OBRA.** Ele
apontava para `LQC-316-26-TMSA-ETC-MB-0141-TORG-R00.xlsx`, que não existe mais, e o **conteúdo**
era da TMSA (21 linhas, 15.713 kg, áreas `ETC MB-0141`) dentro de um orçamento que a central E a
pasta do SharePoint dizem ser **QWS Serviços / REVAMP-04**. Trocar só o ponteiro para a planilha do
QWS deixaria o peso da TMSA com o nome do QWS — consistente por fora, errado por dentro.

Reimportado em 26/09 da planilha certa (`LQC-316-26-QWS-REVAMP-4-TORG-R000.xlsx`): **32 linhas,
25.365 kg, áreas `DE-REPLAN-200A-18-…`**, custo R$ 542.887, preço R$ 1.014.743 (R$ 40,00/kg). A
estrutura bate com a do estudo 313, que o cron importou. Backup do estado anterior guardado antes
de gravar.

⚠ **R$ 40,00/kg é bem acima dos R$ 18,51 do 313** — vem do BDI da própria planilha (46,5% do
preço), não de conta do portal. Vale o Comercial olhar antes de a proposta sair.

⚠ **O cron teria consertado sozinho, e é por isso que o conserto da busca importa**: a planilha do
QWS é de 25/09 e o estudo é de 23/09, então `decidirImportacao` devolve "atualizar". O que travava
era o cron estar morto desde 23/09. ⚠ Ele roda **`40 6-20 * * 1-5`, só dia útil** — num sábado, a
próxima chance seria segunda 6h40.

⚠ Sobrou uma aresta cosmética na 295: o R01 vive numa pasta de data, então `lerFonteLqc` devolve
`pasta: null` (ela só reconhece o formato `{grupo}/{orçamento}/…`). Não impede nada; some se o
Comercial mover o arquivo para `295-26-DANPOWER-ENC0337/5.Estudos`.

## ⚠⚠ E um bug que a correção revelou: o modelo em branco era escolhido pela DATA

`baixarModeloLqc` ficava com a cópia **mais recente** do `LQC-000-00-CLIENTE-OBRA-TORG-R00.xlsx`, e
existem **quatro** no servidor — três dentro da pasta de uma obra de verdade (`117-26-TAKRAF`,
`235-26-MEGASTEAM`, `291-26-TESTE`). Bastava alguém mexer numa delas para o portal passar a exportar
o estudo em cima da planilha da TAKRAF. Agora vence a que está na pasta do modelo (número
todo-zero); sem nenhuma lá, volta a mais recente **com aviso na tela**, porque exportar com uma
cópia é ruim e não exportar é pior.

⚠ Só dá para distinguir porque a varredura por pasta traz o **caminho** — a busca do Graph não
trazia. O defeito existia desde sempre e ninguém tinha como vê-lo.
