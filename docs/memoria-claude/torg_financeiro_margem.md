---
name: torg_financeiro_margem
description: "Aba Financeiro da OP — margem de transformação (custo operacional rateado por produção × receita de fabricação); modelo, janela 2026+, o que falta"
metadata: 
  node_type: memory
  type: project
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-07-24T00:24:25.722Z
---

Modelo de **custo/margem por OP** validado com o Vitor (jul/2026) e no ar na aba Financeiro (`app/comercial/[id]/OPDetailClient.jsx`, card `MargemTransformacaoOP.jsx` no topo da vista financeiro; rota `/api/comercial/op/[id]/margem`; motor `lib/rateio-transformacao.js`).

**A ideia (do Vitor):** material é quase todo **faturamento direto** (cliente compra direto — na 083, R$2,31mi 100% FD; receita MATERIAL no `OPReceita` da empresa é só R$77k). Então a margem da Torg **não está no material** — está na **fabricação** ("o que sobra"). Logo: `Margem = (FABRICACAO+PROJETO do OPReceita) − custo de transformação`. Material entra só pelo desvio da verba (estouro real>verba = prejuízo Torg, inclui FD).

**Custo de transformação** = custo OPERACIONAL do mês rateado por produção. Classificação por **plano de contas do Omie** (prefixo de `ContaPagar.categoriaNome`, NÃO por "tem projeto"): 3.x=material(direto), **4/5/6/7/8/10/11/12/13/14/15 = transformação (rateável)**, 16/20=financeiro(fora), 21=capex(fora), 2.x=parcelamento(fora), 4.4=frete. Folha ESTÁ no Omie (6.1 MOD, 7.1 MOI, 7.6 Prestadores terceirizada, 8.1 Empreita, 14.x ADM+pró-labore). "Todas as contas sem projeto" NÃO serve cru — contamina com material sem vínculo (R$416k/jun), juros/factoring/empréstimo (R$365k) e capex (R$411k).

**⚠ JANELA 2026+:** o Syneco só capturou a fábrica inteira em 2026. Em 2025 há meses com 0-2 OPs apontadas + overhead cheio → R$/kg-op explodia (out/25 = R$68/kg). Rateio só vale de **2026-01**; OP com produção 2025 tem custo marcado incompleto (`shareForaJanela`).

**Peso NUNCA em kg·setor na tela** — ver [[torg_peso_kg]]. O motor rateia por kg-op (multi-contado, soma dos setores) internamente, mas na UI só aparece o **peso da lista de expedição** e "% da fábrica → R$".

**Reconcilia com o portal:** `saldoAFaturar = (FABRICACAO+PROJETO) − faturado(medições)`. Na 083 deu R$793k ≈ os R$788k que o portal financeiro mostra. Entrada/OUTRO do `OPReceita` = repasse acordado no início (faturado à parte, fora do saldo). Custo de transformação da 083 = R$412k (4 meses, abr-jul/26).

**Aplicado só nas OPs com dado completo:** 083, 095, 086 (completas), 087/084/085/088/082 (em andamento, sem faturado). **Fora:** 064/067/078/090 (receita R$0 no `OPReceita` — card mostra aviso "preencha o faturamento"). 060 tem 40% em 2025 (custo incompleto). **084 é candidata a prejuízo** (custo≈receita com obra em andamento).

**Aba Diretoria › Resumo mensal** (`components/ResumoMensalDiretoria.jsx`, rota `/api/diretoria/resumo-mensal`, no `DiretoriaClient` ABAS_BASE após "dre"; acesso pela allowlist da Diretoria). Por mês (out/25→mês atual):
- **Resultado do mês (EMPRESA inteira, escolha do Vitor)**: cabeçalho Expedido · Faturado (=`ContaReceber.valor` por emissão) · A pagar (=TODAS as `ContaPagar` por vencimento, exceto CANCELADO) · **Resultado = Faturado − A pagar**. Detalhe: régua de caixa Faturado/Recebido | A pagar/Pago (`valorPago`) | Resultado caixa (Recebido − Pago). NÃO é a soma das obras — inclui receita/despesa fora de OP.
- **Por obra**: Expedido (peso da LISTA), Faturado no mês (medições etapa 60), matéria-prima (ContaPagar 3.x, projeto→OP), transformação (rateio 2026+), % do mês (fatia kg-op), margem.
- **Ranking de obras** (acumulado, pra decidir o que vender): Receita = **faturado do Omie** (`listarPedidosVendaAbertos` — traz obras sem medição no portal, ex. 064/067/078; 1 chamada dá faturado por obra + mapa projeto→OP) − matéria-prima − transformação = margem; obras com produção 2025 marcadas ⚠ (custo subestimado).
- ⚠ **"Faturado/receita" = SÓ etapa 60** (faturada). Medições etapa 10/20 são "a faturar" (romaneios futuros) — NÃO contam como receita. Bug corrigido aqui e na aba Financeiro da OP (083: receita gerada R$652k, não R$3M). Datas-lixo do Omie ("4202-...") cortadas por teto; meses futuros cortados (receita gerada, não agendada).

**Fase 2 — PREVISÃO da obra (FEITA):** card `PrevisaoObra.jsx` na aba Financeiro (abaixo da margem), rota `/api/comercial/op/[id]/previsao`. Avanço físico = kg **expedido** (lista, marcas expedidoRomaneio) ÷ **planejado** (Σ marcas da lista). ⚠ A lista costuma estar INCOMPLETA (ex. 083 lista=93,5t mostra 90%, mas real ~166t=50%) → o **peso planejado é EDITÁVEL no card** (default lista, recalcula client-side). Custo restante = kg restante × R$/kg realizado (custo transformação ÷ kg **expedido da lista** = R$/kg de aço real, ~R$5/kg na 083, NÃO kg·setor). Resultado projetado = receita − custo total proj (só transformação; material FD fora — completo p/ obras FD). Break-even = saldo a faturar (Omie `aFaturar`) ÷ kg restante vs R$/kg realizado → restante fecha positivo/prejuízo. Prazo = kg restante ÷ ritmo de expedição mensal × `OP.dataFimPrevista` (bandeira se atrasa). Validado: **OP-084 projeta PREJUÍZO −R$42k** (R$/kg R$10,40, obra cara); 095/086 ~83%.

**Falta (ideias futuras):** incluir material real na previsão (hoje só transformação — ok p/ FD); rebasear driver de rateio em tonelagem real da lista se quiser custo/kg legível em todo lugar; sincronizar medições das obras sem faturado no portal (064/067/078 já vêm do Omie no ranking, mas o detalhe mensal fica R$0).
