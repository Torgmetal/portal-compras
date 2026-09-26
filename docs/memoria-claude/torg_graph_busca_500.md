---
name: torg_graph_busca_500
description: O search do Graph neste drive devolve HTTP 500 desde 22–23/09/2026 e derrubou SEIS pontos do portal, só UM com alarme; listar por caminho funciona, delta e varredura cega NÃO servem (medido)
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
| `lib/lqc-sharepoint.js` (`listarLqcs`) | cron `lqc-sharepoint` | **sim** — 65 h sem sucesso |
| `app/api/producao/desenhos/route.js` | **modal de desenhos, em 7 telas de PCP/produção** | não |
| `lib/lqc-planilha.js` (`baixarModeloLqc`) | criar LQC no portal (modelo em branco) | não |
| `lib/lqc-op-servidor.js` (`lerFonteLqc`) | gerar OP a partir da LQC | não |
| `lib/databook-arquivo.js` (`procurarArquivoPorNome`) | 4º degrau que resgata certificado movido | não |
| `lib/sharepoint-lpc.js` (`buscarLpcDaOp`) | importar revisão de LPC | não |

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
