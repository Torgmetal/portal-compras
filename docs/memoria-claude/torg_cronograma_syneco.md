---
name: torg_cronograma_syneco
description: Cronograma × Syneco — sincronismo automático do avanço das linhas de fabricação por frente/fase
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-09-07T00:00:00.000Z
---

**Sincronismo automático do avanço do cronograma a partir das baixas do Syneco** (pedido do Vitor 06/08, "hora do show", OP-89 de teste). `lib/cronograma-syneco.js` + injeção no GET `app/api/planejamento/cronogramas/[id]/route.js` (commits e0d07a9 + 6ff4e7b).

**Como funciona**: as linhas de FABRICAÇÃO do cronograma (nome = Preparação/Montagem/Solda/Pintura/Jato/Acabamento, uma por **área**) recebem o `percentualRealizado` calculado do Syneco — **Syneco é a fonte da verdade** (decisão do Vitor: não tem edição manual nessas linhas). % = kg produzido ÷ escopo da fase; início = 1ª baixa. Anexa `syncSyneco {escopoKg, produzidoKg, baixas[]}` em cada linha p/ a tela mostrar histórico.

**Casamento por FRENTE (a sacada)**: as baixas do Syneco trazem a frente no `opSka` (`T89A…`, `T89C…`), o `PecaConjunto.opNumero` idem (T89A/T89C), e a **área** do cronograma tem a letra no fim do nome (`"... (A)"`). Frente = `T<numOP><letra>` (OP 89 → T89). `letraDaArea()` e `letraDoCodigo()` no lib.

**Mapa fase→setor**: Preparação=CORTE, Montagem=MONTAGEM, Solda=SOLDA, Pintura=PINTURA, Jato=JATO, Acabamento=ACABAMENTO (`FASE_SETOR`, normaliza o nome).

**Frente ÚNICA (sem letra) — fix 17/08:** OPs onde NADA tem frente (cronograma com `area = null`, `PecaConjunto.opNumero` = "106", `mesApontamento.opSka` = **nº da peça** tipo "72140235-P1", não código de frente — ex.: **OP 106**) não casavam nada → o cronograma não puxava o Syneco (nem tela nem PDF). Agora o sync também monta um bucket **"OP inteira"** (chave `"*|SETOR"`) agregando TODO o escopo (por tipoPeca) e TODA a produção (por setor), ignorando frente; `avancoDaTarefa` cai nele quando a tarefa não tem letra (`letraDaArea(area) || "*"`). OPs por frente (89) ficam intactas (tarefas têm letra → usam o bucket da frente). Validado OP 106: Preparação **40,1%** (4.075/10.162 kg corte); Montagem/Solda 0% (sem produção ainda). Commit 64d4523.

**Escopo (o 100%) = rota real (regra do Vitor)**: Corte = peças **croqui (P) + avulsas** (tipoPeca ≠ CONJUNTO); Montagem/Solda/Pintura = os **CONJUNTOS**. Peso da `PecaConjunto` por frente (opNumero). Linha sem escopo (frente não modelada na LPC, ex.: **B/T89B da OP-89** não existe) → mantém o manual, não zera. Ver [[torg_peso_real_op]], [[torg_prioridades_setor]], [[torg_syneco_apontamento_fonte]].

**Validado OP-89 (TERMASA)**: frente A Prep 66,4% / Mont 8,8%; frente C Prep 86,6% / Mont 37,7%; Solda/Pintura 0%; frente B manual. Números reais, batem com "preparação já ocorrendo".

**Export "Faltantes por setor"** (06/08, `lib/export-faltantes-setor.js`, botão nas DUAS telas: aba Produção do detalhe da OP `AbaProducao` + aba Produção/Peso do cronograma `ProducaoTab`). Matriz peça × setor (Falta/OK/—) + total faltando por setor. Fonte = `/api/comercial/op/[id]/producao` (setor real do Syneco por marca). **Fallback importante**: se a OP não tem `ListaExpedicao` (Lista Avançada) — ex.: OP-089 — a API cai pras peças **LPC_IMPORT** (casam com MesOrdem por marca), senão dava "Sem peças". **Rota por tipo (regra do Vitor)**: CROQUI (P) só CORTE (vira conjunto na montagem); CONJUNTO segue MONTAGEM→SOLDA→ACABAMENTO→JATO→PINTURA (não passa no corte); AVULSA (solo) corta e pula montagem/solda. Fora da rota = "—". A API devolve `tipoPeca` por peça. Ver [[torg_peca_setor_real]], [[torg_prioridades_setor]].

**Export PDF/XML/e-mail aplicam o sync (fix 17/08):** o % vivo do Syneco só existia no GET — o **PDF do cronograma**, o **MS Project XML** e o **envio por e-mail** liam o `percentualRealizado` ARMAZENADO (defasado: Montagem/Solda saíam **0%** enquanto a tela mostrava **70,9%**; Vitor reportou pelo TPR 763/OP-089). Novo helper **`aplicarAvancoSyneco(prisma, opId, opNumero, tarefas)`** em `lib/cronograma-syneco.js` (extrai a MESMA regra do GET) é chamado nas 3 rotas de export (`[id]/pdf`, `[id]/msproject`, `[id]/enviar`) antes de gerar. O `msproject` nem incluía a `op` — agora inclui id+numero. Commit c7c4992. (Resolve o gap "% vivo só no GET" pros exports; o DB ainda guarda o valor defasado — o snapshot semanal pendente deve calcular o sync igual.)

**PORTAL DO CLIENTE também aplica o sync (05/09/2026):** era o QUARTO lugar lendo o
`percentualRealizado` gravado — a aba Cronograma do cliente mostrava "Preparação 0%" enquanto a tela
do Planejamento mostrava o avanço real. Vitor: *"esse avanço tem que ser igual ao cronograma do
planejamento, tem que tomar esse cuidado"*. `app/api/portal/[token]/route.js` passa a chamar
`aplicarAvancoSyneco` (precisa do `id` da tarefa no select — a função casa por id). ⚠ Eu tinha
"consertado" antes calculando um avanço PRÓPRIO a partir do apontamento: funcionava e criava a
segunda leitura da mesma pergunta. **Regra: quem mostra avanço de fabricação chama essa função — não
recalcula.** Ver [[torg_etapa_conjunto_croqui]].

**A FASE E A ÁREA SÃO O MESMO CADASTRO, LIGADOS PELO NOME (07/09/2026):** as fases (lotes de entrega,
`LoteExpedicao`) viram as ÁREAS do cronograma, e o vínculo é o **nome literal**. Renomear a fase não
chegava no cronograma: a OP-105 ficou com o lote "Quadro**s** Vasadores" e a área "Quadro Vasadores"
— uma letra — e a área órfã parou de receber data e avanço, aparecendo como **atraso que não
existe**. O PATCH do lote (`app/api/comercial/op/[id]/lotes-expedicao/[loteId]`) agora leva o nome
junto, **só quando existe área com o nome antigo** (área renomeada de propósito lá dentro não se
duplica). Ver [[torg_cronograma_periodo]].

**LETRA REPETIDA EM DUAS FASES = AVANÇO NÃO MENSURÁVEL:** o casamento é pela letra da marca
(`T105A-P1` → A). Se duas fases carregam a mesma letra — a 105 tem "Quadros Vasadores (B)" e
"Longarinas (B)" — não há como separar, e lançar o mesmo peso nas duas contaria o trabalho **duas
vezes**. Regra: pular as duas e dizer, nunca dividir por estimativa. Fase só com croqui e nenhum
conjunto (fase C da 105, 944 kg) tem denominador para Preparação e **nenhum** para
montagem/solda/pintura. ⏳ Vitor 07/09/2026: *"a parte de B e C vamos ajustar depois"*. Em 08/09 ele fechou o encaminhamento:
**não vai mexer nas letras** — *"apenas dizer aqui para você qual faz parte de qual"* — e isso vale
**só para a OP-105**: *"somente dessa obra pois não havíamos feito coisas separadas"*. Ou seja, é
caso único, NÃO generalizar o motor de avanço para casar por lista de peças; quando as peças B
entrarem (hoje a LPC da 105 não tem nenhuma), gravar o vínculo na lista da fase (`PecaLote`, as
quatro estão vazias) e medir por script desta obra.

**ATRASO É O QUE PASSOU DO DIA, NÃO O QUE VENCE HOJE (07/09/2026):** a tela comparava
`new Date(dataFimPrevista) < new Date()` — data-só gravada 00:00Z contra o INSTANTE atual — então
toda etapa que vencia HOJE nascia vermelha às 00h01, em **todo** cronograma do portal. Regra agora em
`lib/cronograma-atraso.js` (`tarefaAtrasada`, `diasDeAtraso`, `diaDeHoje`), usada pela linha e pelo
contador do setor. ⚠ O dia do prazo sai em **UTC** (é data-só); o hoje sai em **BRT** (é onde a
fábrica está) — trocar qualquer um dos dois traz o bug de volta com outra roupa. Ver
[[torg_fuso_servidor]].

**Datas por fase a partir do apontamento** (`scripts/avanco-cronograma-fase.mjs`): a janela vai do
**1º apontamento** (ou hoje, se nada começou) até a `dataPrevista` do lote, repartida 4:4:4:6, com a
última etapa fechando **exatamente** na entrega. Etapa inacabada nunca termina no passado. Preparação
mede sobre CROQUIS (é onde o corte é apontado), as demais sobre CONJUNTOS — somar os dois dobra o
peso [[torg_peso_real_op]].

**PENDENTE (próximos passos, confirmados com o Vitor)**:
- **Expedição**: também auto (Vitor pediu fabricação **+ expedição**) — vem do **romaneio** (`RomaneioPrevio.itens[].frente` + pesoTotal), NÃO do Syneco; falta somar peso expedido por frente e mapear a linha "Expedição" do cronograma. OP-89 ainda não tem romaneio (não deu p/ validar).
- **Histórico da baixa na tela**: o `syncSyneco.baixas` já vai no JSON; falta o CLIENT renderizar "abrir a linha → datas/kg/acumulado por setor".
- **Snapshot semanal**: gravar o avanço semana a semana ("igual das mudanças") — usar `CronogramaRegistro` (log por tarefa) ou tabela dedicada; o snapshot deve **calcular o sync** (o DB guarda 0%; o % vivo só existe no GET).
