---
name: torg_cronograma_periodo
description: Cronograma — PDF agrupa por área (área = tarefa-resumo do Project); período gravado defasa e corta tarefa no Gantt
metadata: 
  node_type: memory
  type: project
  originSessionId: d9c0cffd-a288-4e74-b94d-9b9291161750
  modified: 2026-08-15T13:55:08.377Z
---

## Antecipação de tarefa = lead/lag (commit 0a78a1d)

Regra do Vitor: **"muitas vezes começamos uma atividade mesmo sem ter finalizado a anterior"** — antecipar é normal, o finish-to-start NÃO é rígido. Antes não dava pra pôr data retroativa numa tarefa com antecessora: o recálculo forçava a data EXATA do FS e ainda tratava antecessora não concluída como "termina hoje" (`fimPrev < now → fimEfetivo = now`), então tudo voltava pra frente.

Modelo escolhido pelo Vitor (entre "não empurrar o que já começou" / lead-lag / "antecessora não força data"): **lead/lag do MS Project**. `CronogramaTarefa.defasagemDias` (DU ou DC; **negativo = antecipação**). Ao digitar a data à mão, `calcularDefasagem()` mede a defasagem vs o FS e grava; o recálculo aplica em cima da base FS → a data digitada sobrevive, e se a antecessora atrasar a sucessora anda junto **preservando** a antecipação. "Gerar Datas" também aplica.

⚠️ `addWorkdays()` agora aceita negativo (antes devolvia a própria data); use `workdaysBetweenSigned`/`calendarDaysBetweenSigned` pra medir (as versões antigas clampam em 0). `inicioFsPuro()`/`fimEfetivoAntecessora()` são compartilhados entre o recálculo e a gravação da defasagem — **não duplicar essa lógica**.

## PDF tem que agrupar por ÁREA (commit a8d1b08)

O Gantt em PDF listava tudo numa lista corrida por `uidMpp`, ignorando o `departamento` → saía "Comercial, Engenharia, Comercial, Engenharia, Suprimentos…" misturado. A **tela** (`/planejamento/cronogramas`) sempre agrupou por área, e o **MS Project** também (a área é a **tarefa-resumo de nível 1**: Comercial / Projeto / Suprimentos / Fabricação / Expedição) — só o PDF destoava. Reclamação do Vitor: "não tá separando por área, misturou comercial, projeto, suprimentos".

Agora `lib/cronograma-pdf.js` agrupa por `ORDEM_DEPT` (COMERCIAL→ENGENHARIA→SUPRIMENTOS→FABRICACAO→EXPEDICAO→MONTAGEM) com faixa de cabeçalho; resumo de `outlineLevel<=1` vira o cabeçalho e não repete como linha. **Qualquer visão nova de cronograma (export, tela, relatório) deve agrupar por área** — é a formatação que o Vitor considera padrão.

O import está OK: `lib/mpp-parser.js` tira a área do resumo de nível 1 (`DEPT_MAP` por `startsWith`) e os filhos herdam via `currentDept`. ⚠️ Ponto frágil: se um resumo de nível 1 NÃO casar com o `DEPT_MAP`, o `currentDept` **não é resetado** e os filhos herdam a área do grupo anterior.

`Cronograma.dataInicio/dataFim` é o período do cronograma e **defasa com facilidade** — quando defasa, a tarefa que cai fora sai desenhada como uma **lasquinha espremida na borda** do Gantt (e o "Período: X — Y" do app/PDF fica errado). Reportado pelo Vitor na T097 em 16/07/2026 ("atualizei o cronograma e perdeu a formatação"): gravado 01/07→11/09 vs tarefas reais 25/06→16/09. **4 de 11 cronogramas ativos estavam defasados** — não era caso isolado.

**Corrigido (commit bcc14cd), nos dois lados:**
- `lib/cronograma-recalcular.js`: só esticava o `dataFim` PRA FRENTE — o `dataInicio` **nunca voltava atrás**. Agora sincroniza os dois sentidos, e o bloco saiu de trás do `if (updates.length === 0) return` (edição de data que não cascateia sucessora não gera updates, mas ainda joga tarefa pra fora do período).
- `lib/cronograma-pdf.js`: preferia o período gravado e só usava o min/max das tarefas se ele fosse nulo. Agora a linha do tempo é a **UNIÃO** dos dois → nunca corta tarefa, mesmo com dado defasado.

Dados de produção já sincronizados (T074, T078, T082, T097) — só alargando, nunca encolhendo.

⚠️ Ao mexer em qualquer visualização de cronograma (Gantt na tela, PDF, export): **nunca confiar só no período gravado** — sempre unir com o min/max das tarefas. Ver [[torg_cronograma]].

## ⚠️ ATUALIZAÇÃO 15/08/2026 (commit 83a4228) — período = intervalo EXATO das tarefas

A regra "só alarga, nunca encolhe / UNIÃO com o gravado" **foi trocada** — ela causava o bug inverso: ao **reduzir durações** (fix de duração de 14/08), o `dataFim` ficava preso na data velha e o "Período" do PDF/export saía lá na frente (o Vitor viu o PDF do ENC 0328 mostrando 10/12 com tarefas até 22/10). **8 cronogramas estavam defasados pra MAIS** (JHSF 20/11→12/10, etc.) — backfill rodado.

Agora **período = EXATAMENTE min início / max fim das tarefas datadas** (encolhe também) — cobre todas as tarefas por definição, não corta e não infla:
- `cronograma-recalcular.js`: o sync grava o intervalo exato (compara por dia via `diaISO`).
- `cronograma-pdf.js`: `t0/t1` = min/max das tarefas; **não une mais** com o gravado (gravado só de fallback se não há tarefa com data).
- `cronograma-msproject-xml.js`: `projStart/projFinish` idem. **E `Duration`/`Milestone` derivam das DATAS** (span início→fim em DU/DC), não do `duracaoDias` (que defasa ou fica 0 no import .mpp). Sem isso: tarefa auto-agendada (`Manual=0`) tinha o fim recalculado pelo Project (divergia do portal) e **cronograma importado saía com quase tudo virando marco** (JHSF: 39 tarefas multi-dia com duracaoDias=0 viravam marco → agora 7 marcos reais de 46). Marco = início==fim (regra do [[torg_cronograma]], agora aplicada também no XML).
