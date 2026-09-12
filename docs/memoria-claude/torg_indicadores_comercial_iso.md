---
name: torg_indicadores_comercial_iso
description: "Painel ISO do Comercial (/comercial/indicadores) LÊ os números da planilha manual RELATÓRIO_PROPOSTAS no SharePoint, não do banco"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-07T21:17:33.565Z
---

Painel `/comercial/indicadores` (novo 07/08/2026) — indicadores ISO do processo **Comercial/Vendas**, no mesmo padrão dos outros setores ([[torg_indicadores_iso]]): `IndicadoresIsoClient` compartilhado + rotas `/api/comercial/indicadores/iso[/detalhe|/pdf]` + `gerarIndicadoresIsoPDF`. Role `["ADMIN","COMERCIAL"]`. Link "Indicadores ISO" na `SidebarComercial`.

**3 indicadores** (defs em `lib/indicadores-iso.js`, processo COMERCIAL): Taxa de Conversão de Propostas (≥15%, mensal), **Ciclo Médio de Vendas** (≤60 dias, mensal — SUBSTITUIU a antiga "Aderência ao Prazo da Proposta", conforme a planilha ISO do Vitor), CSAT (≥85%, trimestral — segue **pendente**, sem pesquisa).

**FONTE = planilha manual do SharePoint, NÃO o banco** (decisão do Vitor: o Comercial preenche à mão e é a fonte da verdade). `lib/indicadores-comercial-iso.js`:
- Baixa `RELATÓRIO_PROPOSTAS_<ano>.xlsx` do caminho `/Comercial/1. Orçamento/ORÇAMENTOS_<ano>/…` no drive padrão (`SHAREPOINT_DRIVE_ID` = biblioteca SERVIDOR; é o MESMO drive `b!CCiljQSme…` do arquivo) via `downloadFileByPath` de [[torg_libs_compartilhadas]]/`lib/sharepoint.js` (client credentials Azure). Parseia com **SheetJS (`xlsx`)**.
- Lê a aba **"Indicadores"** (a planilha tem 5 abas: Dados/Cadastro/Orçamentos/Indicadores/Em aberto). Layout: col0=Indicador, col1=Faixas(Porte), col2=Descrição, col3=Unidade, **col4..15 = Jan..Dez**, col16=Resultado(ano), col17=Meta. Blocos por faixa (ATÉ R$1,2M / DE R$1,2M-10M / DE R$10M-50M / MAIS DE R$50M / **GERAL**).
- Parser ANCORA por `faixa==="GERAL"` (rastreando o último col1 preenchido) + regex na descrição — robusto a inserção/remoção de linhas. Conversão = linha GERAL "TAXA DE CONVERSÃO POR QTD" (col16 = acumulado); Ciclo = GERAL "CICLO MÉDIO DE VENDA". Gate: conversão só nos meses com "Orçamentos Enviados">0; ciclo só com "Qtd Orçamentos Fechados">0 (senão null). `raw:true` → % vêm como fração (0,24 → ×100). Detalhe usa "Orçamentos Fechados"(conv, sem "QTD") e "Tempo para fechamento"(ciclo).
- **Cache** em memória 10min por ano + **falha graciosa** (se a leitura falhar, série null + nota com o erro; não quebra o painel).

`/api/qualidade/indicadores` também passou a puxar conversão+ciclo dessa lib (antes calculava do `Orcamento` do banco, que dava **conversão 100% irreal** porque as PERDIDAS não gravam `dataFechamento` — 0 de 42) → os dois painéis batem agora. `fonte:"parcial"` nos 2 (faz o card mostrar a nota "lido da planilha"; o cliente só exibe `nota` quando fonte=parcial ou pendente).

Validado 08/2026 contra a planilha real: conversão Jan 24%→Jul 19,1% (acum **14,88%**), ciclo 41→2 dias (acum **15**, meta 60). Ago em curso (7 enviadas, 0 fechadas → 0%).

**Pendências:** CSAT (precisa da pesquisa). Se o Comercial mudar o layout da aba Indicadores (renomear "GERAL"/descrições), o parser cai pra null — reconferir os âncoras.
