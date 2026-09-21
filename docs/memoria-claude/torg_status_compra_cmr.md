---
name: torg_status_compra_cmr
description: "Status de COMPRA por OP na Preparação (PCP) vem do CMR do Almoxarifado (não do Omie); rastreabilidade corrida/NF/pedido; sync diário"
metadata:
  type: project
---

**Status de COMPRA do material por OP (Vitor 18/08, commits e35da79 + 3223740).** Pedido: no painel do PCP/Preparação, saber se o material da obra foi comprado / aguardando entrega / falta comprar / recebido parcial ou total.

**FONTE = CMR, não Omie (decisão do Vitor):** o Omie não serve — nota que chega tarde e material **faturado direto pro cliente** que nunca gera nota nossa. O **CMR** (`CMR TORG-{ano}-Almoxarifado01.xlsx`, pasta `/Almoxarifado/01. Rastreabilidade`) é lançado no recebimento, fica atualizado e já traz corrida/lote/NF/pedido. Colunas: R/RC · ÍNDICE R · DESCRIÇÃO · Nº CERTIFICADO · **LOTE/CORRIDA** · ESPEC. TÉCNICA · **PEDIDO DE COMPRAS** · **DATA RECEB.** · **Nº NF** · FORNECEDOR · **OBRA** · QTD PÇS · **PESO/LITRO** · OBS.

**Armadilhas achadas (não repetir):**
- ⚠️ A planilha escreve OPs de 3 dígitos como **"OP 0103"** (zero extra) — `soDigitos` do `parse-cmr` normaliza com `parseInt`+`padStart(3)`. Sem isso o vínculo com a OP some (103/102/106 davam 0%).
- ⚠️ O import ANTIGO jogava pedido/NF/data/peso num **TEXTO na observação** (`"Pedido: 1661 · NF: 170059 · Receb.: 7/20/26 · Peso/litro: 7567KG"`) — não dava pra somar. Agora são colunas: `pedidoCompra`, `nfNumero`, `dataRecebimento`, `pesoKg`, `quantidade` em `DocumentoQualidade` (+ índice opNumero/categoria). Backfill extraiu do texto nos 3.475 registros.
- ⚠️ O `CMR_PATH` fixo apontava pra `CMR TORG-2026.xlsx` (parada em 04/08) e não pra `-Almoxarifado01.xlsx` (a viva) → banco estava com recebimentos só até **20/07**. **`baixarCmrAtual(ano)`** (lib/sharepoint) busca por nome e pega a **modificada mais recente** na pasta de rastreabilidade. 1ª sync trouxe **230 linhas**.
- Só ~55% das linhas têm peso: material contado por PEÇA (tinta, parafuso) usa `quantidade`.

**Implementação:** **`lib/status-compra.js`** — `statusCompraPorOp(nums)` compara **recebido (CMR, soma `pesoKg`)** × **solicitado (RMItem.peso das RMs da OP)**: `RECEBIDO_TOTAL` (≥95%) · `PARCIAL` · `AGUARDANDO_ENTREGA` · `FALTA_COMPRAR` (tem item sem pedido) · **`SEM_RM` ⚠** (sem requisição no portal **OU** recebido > **150%** do solicitado = RM incompleta → NÃO mostra % irreal tipo 845%/912%; cobre sozinho as OPs antigas 067/071/083/085 que o Vitor mandou desconsiderar, sem hardcode) · `SEM_DADOS`. `rastreabilidadeDaOp(num)` devolve corrida/certificado/NF/pedido/fornecedor/peso. **`components/CompraChip.jsx`**: chip no card da OP (raia + tela cheia da Preparação) → modal com KPIs + tabela de rastreabilidade. Rota `/api/planejamento/rastreabilidade/[opNumero]`. **Sync**: `/api/qualidade/cmr/sincronizar` — POST = botão "atualizar agora"; GET = **cron diário 12h UTC/9h BRT** (CRON_SECRET, no vercel.json); dedupe por `importRef`.

**Regra do Vitor:** melhor "sem requisição lançada" (honesto) do que um status que mente — que é justamente o problema do Omie. **OP-114**: segue no jogo com "!" (verificar com o Almoxarifado).

**Botão "Atualizar CMR" (commit 5645699):** `components/BotaoSincronizarCmr.jsx` (POST na rota de sync, responde "N entrada(s) nova(s)"/"já estava em dia" e recarrega a tela) em **DOIS lugares** (escolha do Vitor): **Painel do PCP** (ao lado do "Atualizar") e **Qualidade › Rastreabilidade** (ao lado do "Importar (CMR)", só na aba `material`).

**Pendente:** avaliar mostrar o chip de compra também nas telas novas de produção (/producao/prioridades).

**MATERIAL POR ITEM no painel de Liberar (18/08, commit 31c637e):** Vitor: "o status do material deveria aparecer na frente de cada item, não no quadro resumo". **`materialPorPerfil(opNumero, perfis)`** (lib/status-compra) casa o **perfil da peça** com as entradas do CMR daquela OP usando o mesmo matcher do Omie (`casarPerfilComOmie`, passando o CMR como `{descricao: nome}`). O despacho GET devolve `material` em cada peça; a coluna mostra **"ok DD/MM"** (verde, tooltip com material+NF+corrida+data) ou **"sem material"** (âmbar); conjunto/GC sem perfil = "—". Também no **Excel** (Relação Syneco ganhou coluna Material). Pra isso funcionar o `casar-omie` ganhou: **CANTONEIRA por polegadas** (L2.1/2''X3/16'' ↔ "DN. 3/16 X 2.1/2POL"), **U LAMINADO** em polegada (U4"X7.95 ↔ "PERFIL U LAMINADO 4\"") e **BARRA CHATA**. Validado OP-097: W150X24 (124 pç) e U8"17.10 (56 pç) = SEM material; cantoneiras/chapas/U4"/W150X37.1 = ok com NF e data. **Visual**: contador clicável "N sem material" (filtra só essas), barra de resumo peças/kg na tela + selecionado. **Removidos os destinos Revisão / Aguard. material / Cancelar** (sobraram Prioridade e Terceiro) — Vitor: não faziam sentido.

**Busca do código Omie em 2 níveis (commit f68fa48):** primeiro a RM da própria OP, depois o **catálogo** (itens com código de qualquer RM, distinct, sob demanda) — o código é do PRODUTO, não da obra. RT-001 foi de 2→4 de 6. Os 2 restantes (TUBO 1.1/2" e 1/2" DIN2440) **não existem em nenhuma RM** (conferido: a OP-085 tem 6 RMs e só 3 itens de aço; o catálogo tem 20 tubos e nenhum é esses) — vieram de estoque. Próximo passo possível: consultar o cadastro de produtos do Omie pela API (o portal já integra) pra cobrir os que nunca passaram por RM.
