---
name: torg_ui_capricho
description: "Feedback do Vitor (11/07) — capricho visual é ponto fraco recorrente meu; revisar alinhamento, quebra de página/layout e texto ANTES de subir"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
---

Vitor (11/07): "muita coisa quebrada e desalinhada… se atentar a esses detalhes de **quebra de página e escrita** pois aparece **muito nas suas produções**". É um padrão recorrente meu — entrego UI/PDF funcional mas com desalinhamento, quebras feias e texto sem revisão.

**Why:** o portal tem uma identidade consistente (cards `bg-white rounded-xl shadow-sm border border-gray-100`, faixa de métricas `grid divide-x`, `tabular-nums`, rótulos `text-[10px] uppercase tracking-wider`, `text-torg-dark/gray/blue/orange`). Quando eu solto algo fora desse padrão (categorias cruas, cards soltos, plural "item(ns)", quebra de layout no mobile, quebra de página ruim no PDF), destoa e o Vitor percebe na hora.

**How to apply (checklist antes de subir QUALQUER UI/PDF):**
- **Espelhar o padrão existente** — achar um componente do portal que já faz aquilo e copiar o estilo (não inventar). Ex.: faixa de métricas = a do Resumo Financeiro.
- **Alinhamento:** valores monetários/numéricos à direita com `tabular-nums`; colunas alinhadas; usar `divide-y`/`divide-x` do padrão; cuidar do **mobile** (grid 2-col não pode "quebrar" sem divisória).
- **NÚMERO NUNCA QUEBRA EM DUAS LINHAS.** Reincidente: "R 260787" partido na tabela de materiais do portal do cliente (22/08) e "R$ 12.096.000,00" partido na barra de KPI da LQC (23/08 — "não deixe quebrar essas coisas"). Regra: todo valor (moeda, peso, código de rastreio, data) leva `whitespace-nowrap`; só a coluna descritiva pode quebrar; quando não couber, a tabela ROLA de lado (`overflow-x-auto`) — rolar mostra o número inteiro, quebrar não. Em faixa de KPI, abrir menos colunas (`sm:grid-cols-3 xl:grid-cols-6`) antes de espremer valores de moeda.
- **Texto/escrita:** REVISAR. Nada de plural preguiçoso "item(ns)"/"nota(s)" — usar singular/plural certo (`1 item`, `2 itens`, `1 nota`, `2 notas`). Sem código cru na tela (usar labels tipo `labelCategoria`). Sem "Em construção" solto parecendo bug.
- **Quebra de página (PDF):** conferir órfãs/viúvas, seção que corta no meio, tabela sem cabeçalho na página seguinte, rodapé sobrepondo conteúdo. Testar com dados realistas (muitos itens → várias páginas).
- **Ver antes de dizer que está pronto** — quando não dá pra rodar preview (portal roda contra Neon prod, auth-gated), pedir print ou revisar o JSX/Tailwind com olho crítico; não presumir que "compilou = está bonito".

Relacionado: [[torg_op_vistas]] (as abas da OP onde isso apareceu), [[torg_deploy_granular]].

**Ícone de tesoura no chip de corte — NÃO usar (Vitor pediu 2×):** 17/08 no painel de Liberar ("tire essa tesoura de desenho") e 18/08 de novo quando repeti o ícone no chip "falta cortar" da tela de produção. O chip é só TEXTO ("falta cortar N" + seta). Tesoura vale só como ícone do SETOR Corte (título de página/funil do PCP). Regra geral: antes de pôr ícone em chip/badge de listagem, checar se o Vitor já rejeitou.
