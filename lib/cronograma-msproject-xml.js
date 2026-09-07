import "server-only";

// Exporta um cronograma do portal para XML do MS Project (MSPDI —
// "http://schemas.microsoft.com/project"). O Project abre esse .xml nativamente
// (Arquivo → Abrir → Importar) e vira um cronograma nativo, com tarefas, datas,
// duração, dependências (finish-to-start), % concluído, baseline e hierarquia.
// O cronograma do portal veio originalmente do Project (guarda uidMpp), então é
// um round-trip: o cliente compara/valida contra o Project dele.
//
// Hierarquia Setor → Área → Tarefa: o setor é a tarefa-resumo (isSummary) do
// departamento (nível 1); a ÁREA (campo `area`) vira uma summary SINTÉTICA no
// nível 2 e as tarefas descem pro nível 3. Sem nenhuma área definida, cai no
// caminho antigo (emite as tarefas como estão) — não mexe em cronograma legado.

const HORAS_DIA = 8; // MinutesPerDay 480
const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const fmt = (d, hora) => { if (!d) return null; const iso = new Date(d).toISOString().slice(0, 10); return `${iso}T${hora}`; };
const dur = (dias) => `PT${Math.max(0, Math.round(dias || 0)) * HORAS_DIA}H0M0S`;
/** Data em que a tarefa REALMENTE terminou — só para quem está 100%. null nas demais. */
const concluidaComData = (t, percent) => (t && percent >= 100 ? (t.dataFimReal || t.dataRealizacao || null) : null);
const diasEntre = (a, b) => (a && b ? Math.max(0, Math.round((+new Date(b) - +new Date(a)) / 86400000)) : 0);
// Dias ÚTEIS entre duas datas (pula sáb/dom) — pro Duration bater com o Gantt no modo DU.
const diasUteisEntre = (a, b) => {
  if (!a || !b) return 0;
  const s = new Date(a); s.setHours(12, 0, 0, 0);
  const e = new Date(b); e.setHours(12, 0, 0, 0);
  let n = 0;
  while (s < e) { s.setDate(s.getDate() + 1); if (s.getDay() !== 0 && s.getDay() !== 6) n++; }
  return Math.max(0, n);
};
const diaISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// Monta a ordem de emissão (linhas) com o nível de outline recalculado.
// Cada linha: { uid, level, isSummary, nome, start, finish, dias, t? } — `t` é a
// tarefa real (ausente nas summaries sintéticas de área).
function montarLinhas(tarefas) {
  const all = [...(tarefas || [])];
  const temArea = all.some((t) => t.area && String(t.area).trim());

  // Caminho legado: nenhuma área → emite como antes (ordem por uid, nível/summary guardados).
  if (!temArea) {
    return [...all]
      .sort((a, b) => (a.uidMpp || 0) - (b.uidMpp || 0))
      .map((t) => ({
        uid: t.uidMpp, level: Math.max(1, t.outlineLevel || 1), isSummary: !!t.isSummary,
        nome: t.nome, start: t.dataInicioPrevista, finish: t.dataFimPrevista, dias: Math.max(0, t.duracaoDias || 0), t,
      }));
  }

  const maxUid = all.reduce((m, t) => Math.max(m, t.uidMpp || 0), 0);
  let synthUid = maxUid + 1000; // faixa reservada pros summaries sintéticos de área

  const deptsPresentes = [...new Set(all.map((t) => t.departamento || "__SEM__"))];
  const orderedDepts = [
    ...DEPT_ORDER.filter((d) => deptsPresentes.includes(d)),
    ...deptsPresentes.filter((d) => !DEPT_ORDER.includes(d)),
  ];

  const linhas = [];
  for (const dept of orderedDepts) {
    const doDept = all.filter((t) => (t.departamento || "__SEM__") === dept);
    const deptSummary = doDept.find((t) => t.isSummary);
    // Tudo que não é o resumo do dept vira "folha" (agrupada por área). Nada é descartado.
    const folhas = doDept.filter((t) => t !== deptSummary);
    const nivelBase = deptSummary ? 2 : 1; // nível dos itens diretos do dept

    if (deptSummary) {
      linhas.push({
        uid: deptSummary.uidMpp, level: 1, isSummary: true, nome: deptSummary.nome,
        start: deptSummary.dataInicioPrevista, finish: deptSummary.dataFimPrevista,
        dias: Math.max(0, deptSummary.duracaoDias || 0), t: deptSummary,
      });
    }

    // Agrupa por área (""=sem área); ordena os grupos pelo menor uid do grupo.
    const grupos = new Map();
    for (const t of folhas) {
      const key = t.area && String(t.area).trim() ? String(t.area).trim() : "";
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(t);
    }
    const entradas = [...grupos.entries()].sort(
      (a, b) => Math.min(...a[1].map((t) => t.uidMpp || 0)) - Math.min(...b[1].map((t) => t.uidMpp || 0))
    );

    for (const [area, ts] of entradas) {
      const ordenadas = ts.sort((a, b) => (a.uidMpp || 0) - (b.uidMpp || 0));
      if (area) {
        const starts = ordenadas.map((t) => t.dataInicioPrevista).filter(Boolean).map((d) => +new Date(d));
        const finishes = ordenadas.map((t) => t.dataFimPrevista).filter(Boolean).map((d) => +new Date(d));
        const aStart = starts.length ? new Date(Math.min(...starts)) : null;
        const aFinish = finishes.length ? new Date(Math.max(...finishes)) : null;
        linhas.push({ uid: ++synthUid, level: nivelBase, isSummary: true, nome: area, start: aStart, finish: aFinish, dias: diasEntre(aStart, aFinish) });
        for (const t of ordenadas) {
          linhas.push({ uid: t.uidMpp, level: nivelBase + 1, isSummary: false, nome: t.nome, start: t.dataInicioPrevista, finish: t.dataFimPrevista, dias: Math.max(0, t.duracaoDias || 0), t });
        }
      } else {
        for (const t of ordenadas) {
          linhas.push({ uid: t.uidMpp, level: nivelBase, isSummary: false, nome: t.nome, start: t.dataInicioPrevista, finish: t.dataFimPrevista, dias: Math.max(0, t.duracaoDias || 0), t });
        }
      }
    }
  }
  return linhas;
}

export function gerarCronogramaMSProjectXML(cronograma, tarefas) {
  const du = (cronograma.tipoDias || "DU") === "DU"; // dias úteis x corridos
  const uidById = new Map((tarefas || []).map((t) => [t.id, t.uidMpp]));

  const startsAll = (tarefas || []).map((t) => t.dataInicioPrevista).filter(Boolean).map((d) => +new Date(d));
  const finishesAll = (tarefas || []).map((t) => t.dataFimPrevista).filter(Boolean).map((d) => +new Date(d));
  // Período do projeto = intervalo das tarefas (o dataInicio/dataFim gravado defasa —
  // só alarga, nunca encolhe). Gravado só de fallback quando não há tarefa com data.
  const projStart = startsAll.length ? new Date(Math.min(...startsAll)) : (cronograma.dataInicio ? new Date(cronograma.dataInicio) : new Date());
  const projFinish = finishesAll.length ? new Date(Math.max(...finishesAll)) : (cronograma.dataFim ? new Date(cronograma.dataFim) : projStart);

  const linhas = montarLinhas(tarefas);

  const tasksXml = linhas.map((row, i) => {
    const id = i + 1;
    // Duração e marco derivam das DATAS exibidas (a verdade do Gantt do portal), não do
    // campo duracaoDias — que pode estar defasado (resíduo) ou 0 (imports .mpp deixam 0).
    // Como as tarefas são auto-agendadas (Manual=0), o Project recalcula o fim pela
    // Duration: se ela não bater com as datas, o Project mostra período diferente. Assim
    // ele reproduz exatamente a mesma barra/marco que o portal.
    const temDatas = !!(row.start && row.finish);
    const dias = temDatas
      ? (du ? diasUteisEntre(row.start, row.finish) : diasEntre(row.start, row.finish))
      : Math.max(0, row.dias || 0);
    const marco = !row.isSummary && temDatas && diaISO(row.start) === diaISO(row.finish); // summary nunca é marco
    const start = fmt(row.start, "08:00:00");
    const finish = fmt(row.finish, "17:00:00");
    const t = row.t;
    /* ⚠⚠ A DEFASAGEM TEM DE VIAJAR NO LINK, senão o Project remonta a FILA. As tarefas saem
       auto-agendadas (Manual=0): o Project ignora as datas que mandamos e recalcula pelas
       antecessoras. Sem <LinkLag> todo sucessor volta a começar depois que a antecessora TERMINA
       — exatamente o cronograma em fila que Vitor recusou ("quando a montagem já tiver uma
       quantidade de peças prontas a solda já tem que começar"). O XML abria mais longo que o PDF
       e que a tela, com os mesmos dados.
       ⚠ LinkLag é em DÉCIMOS DE MINUTO, não em dias: um dia útil = 8 h = 480 min = 4.800. O
       LagFormat 7 (dias) diz só como o Project EXIBE — quem manda no cálculo é o número.
       ⚠ A defasagem no portal é da TAREFA (aplicada sobre o maior fim entre as antecessoras); no
       Project ela é do LINK. Repetir o mesmo lag em cada link reproduz a mesma conta. */
    const lag = (!row.isSummary && t ? (t.defasagemDias || 0) : 0) * 10 * 60 * HORAS_DIA;
    const preds = (!row.isSummary && t ? (t.antecessoraIds || []) : [])
      .map((aid) => uidById.get(aid))
      .filter((u) => u != null)
      .map((u) => `<PredecessorLink><PredecessorUID>${u}</PredecessorUID><Type>1</Type>` +
        `<LinkLag>${lag}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`)
      .join("");
    const baseDias = (t && t.dataInicioBase && t.dataFimBase)
      ? (du ? diasUteisEntre(t.dataInicioBase, t.dataFimBase) : diasEntre(t.dataInicioBase, t.dataFimBase))
      : 0;
    const baseline = (t && t.dataInicioBase && t.dataFimBase)
      ? `<Baseline><Number>0</Number><Start>${fmt(t.dataInicioBase, "08:00:00")}</Start><Finish>${fmt(t.dataFimBase, "17:00:00")}</Finish><Duration>${dur(baseDias)}</Duration><DurationFormat>7</DurationFormat></Baseline>`
      : "";
    const percent = t ? Math.min(100, Math.max(0, Math.round(t.percentualRealizado || 0))) : 0;
    /* ⚠⚠ TAREFA CONCLUÍDA VAI COM A DATA REAL, senão o Project agenda o resto cedo demais. O
       recálculo do portal usa `dataRealizacao` como base da sucessora quando a antecessora está
       100% (fimEfetivoAntecessora) — o XML mandava só a PREVISTA. Na OP-105 a "Fase 1 - TC 4706"
       terminou 18/08 mas ia no arquivo como 10/08: o Project recalculava a Preparação 6 dias úteis
       antes do que a tela e o PDF mostram, e o mesmo arquivo abria um cronograma diferente.
       ⚠ Start/Finish acompanham o real: para tarefa 100% o Project SOBRESCREVE Finish com o
       ActualFinish de qualquer jeito — deixar a prevista ali só deixaria o arquivo contraditório.
       ⚠ ActualStart é obrigatório junto do ActualFinish; sem data real de início cai na prevista. */
    const fimReal = concluidaComData(t, percent);
    const iniReal = fimReal ? (t.dataInicioReal || row.start || fimReal) : null;
    const actual = fimReal
      ? `\n      <ActualStart>${fmt(iniReal, "08:00:00")}</ActualStart>\n      <ActualFinish>${fmt(fimReal, "17:00:00")}</ActualFinish>`
      : "";
    const startEfetivo = fimReal ? fmt(iniReal, "08:00:00") : start;
    const finishEfetivo = fimReal ? fmt(fimReal, "17:00:00") : finish;
    const diasEfetivo = fimReal
      ? (du ? diasUteisEntre(iniReal, fimReal) : diasEntre(iniReal, fimReal))
      : dias;
    const marcoEfetivo = fimReal ? (!row.isSummary && diaISO(iniReal) === diaISO(fimReal)) : marco;
    return `    <Task>
      <UID>${row.uid}</UID>
      <ID>${id}</ID>
      <Name>${esc(row.nome)}</Name>
      <Active>1</Active>
      <Manual>0</Manual>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <OutlineLevel>${Math.max(1, row.level || 1)}</OutlineLevel>
      <Summary>${row.isSummary ? 1 : 0}</Summary>
      <Milestone>${marcoEfetivo ? 1 : 0}</Milestone>${startEfetivo ? `\n      <Start>${startEfetivo}</Start>` : ""}${finishEfetivo ? `\n      <Finish>${finishEfetivo}</Finish>` : ""}${actual}
      <Duration>${dur(diasEfetivo)}</Duration>
      <DurationFormat>7</DurationFormat>
      <PercentComplete>${percent}</PercentComplete>
${preds ? "      " + preds + "\n" : ""}${baseline ? "      " + baseline + "\n" : ""}    </Task>`;
  }).join("\n");

  const workingTimes = `<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>`;
  const weekDays = [1, 2, 3, 4, 5, 6, 7].map((dt) => {
    const working = du ? (dt >= 2 && dt <= 6) : true; // DU: seg-sex; DC: todos
    return `        <WeekDay><DayType>${dt}</DayType><DayWorking>${working ? 1 : 0}</DayWorking>${working ? workingTimes : ""}</WeekDay>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>${esc(cronograma.titulo || cronograma.nomeArquivo || cronograma.opNumero)}</Name>
  <Title>${esc(cronograma.titulo || cronograma.opNumero)}</Title>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${fmt(projStart, "08:00:00")}</StartDate>
  <FinishDate>${fmt(projFinish, "17:00:00")}</FinishDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>${du ? 2400 : 3360}</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DurationFormat>7</DurationFormat>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
${weekDays}
      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>
${tasksXml}
  </Tasks>
</Project>
`;

  const slug = String(cronograma.opNumero || cronograma.titulo || "cronograma").replace(/[^\w.-]+/g, "-");
  return { xml, filename: `cronograma-${slug}.xml` };
}
