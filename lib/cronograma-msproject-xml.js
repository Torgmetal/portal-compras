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
const diasEntre = (a, b) => (a && b ? Math.max(0, Math.round((+new Date(b) - +new Date(a)) / 86400000)) : 0);

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
  const projStart = cronograma.dataInicio ? new Date(cronograma.dataInicio) : (startsAll.length ? new Date(Math.min(...startsAll)) : new Date());
  const projFinish = cronograma.dataFim ? new Date(cronograma.dataFim) : (finishesAll.length ? new Date(Math.max(...finishesAll)) : projStart);

  const linhas = montarLinhas(tarefas);

  const tasksXml = linhas.map((row, i) => {
    const id = i + 1;
    const dias = Math.max(0, row.dias || 0);
    const marco = !row.isSummary && dias === 0; // summary nunca é marco
    const start = fmt(row.start, "08:00:00");
    const finish = fmt(row.finish, "17:00:00");
    const t = row.t;
    const preds = (!row.isSummary && t ? (t.antecessoraIds || []) : [])
      .map((aid) => uidById.get(aid))
      .filter((u) => u != null)
      .map((u) => `<PredecessorLink><PredecessorUID>${u}</PredecessorUID><Type>1</Type></PredecessorLink>`)
      .join("");
    const baseline = (t && t.dataInicioBase && t.dataFimBase)
      ? `<Baseline><Number>0</Number><Start>${fmt(t.dataInicioBase, "08:00:00")}</Start><Finish>${fmt(t.dataFimBase, "17:00:00")}</Finish><Duration>${dur(dias)}</Duration><DurationFormat>7</DurationFormat></Baseline>`
      : "";
    const percent = t ? Math.min(100, Math.max(0, Math.round(t.percentualRealizado || 0))) : 0;
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
      <Milestone>${marco ? 1 : 0}</Milestone>${start ? `\n      <Start>${start}</Start>` : ""}${finish ? `\n      <Finish>${finish}</Finish>` : ""}
      <Duration>${dur(dias)}</Duration>
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
