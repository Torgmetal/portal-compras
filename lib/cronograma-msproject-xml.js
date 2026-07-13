import "server-only";

// Exporta um cronograma do portal para XML do MS Project (MSPDI —
// "http://schemas.microsoft.com/project"). O Project abre esse .xml nativamente
// (Arquivo → Abrir → Importar) e vira um cronograma nativo, com tarefas, datas,
// duração, dependências (finish-to-start), % concluído, baseline e hierarquia.
// O cronograma do portal veio originalmente do Project (guarda uidMpp), então é
// um round-trip: o cliente compara/valida contra o Project dele.

const HORAS_DIA = 8; // MinutesPerDay 480

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const fmt = (d, hora) => { if (!d) return null; const iso = new Date(d).toISOString().slice(0, 10); return `${iso}T${hora}`; };
const dur = (dias) => `PT${Math.max(0, Math.round(dias || 0)) * HORAS_DIA}H0M0S`;

export function gerarCronogramaMSProjectXML(cronograma, tarefas) {
  const du = (cronograma.tipoDias || "DU") === "DU"; // dias úteis x corridos
  const ts = [...(tarefas || [])].sort((a, b) => (a.uidMpp || 0) - (b.uidMpp || 0));
  const uidById = new Map(ts.map((t) => [t.id, t.uidMpp]));

  const startsAll = ts.map((t) => t.dataInicioPrevista).filter(Boolean).map((d) => +new Date(d));
  const finishesAll = ts.map((t) => t.dataFimPrevista).filter(Boolean).map((d) => +new Date(d));
  const projStart = cronograma.dataInicio ? new Date(cronograma.dataInicio) : (startsAll.length ? new Date(Math.min(...startsAll)) : new Date());
  const projFinish = cronograma.dataFim ? new Date(cronograma.dataFim) : (finishesAll.length ? new Date(Math.max(...finishesAll)) : projStart);

  const tasksXml = ts.map((t, i) => {
    const id = i + 1;
    const dias = Math.max(0, t.duracaoDias || 0);
    const marco = dias === 0;
    const start = fmt(t.dataInicioPrevista, "08:00:00");
    const finish = fmt(t.dataFimPrevista, "17:00:00");
    const preds = (t.antecessoraIds || [])
      .map((aid) => uidById.get(aid))
      .filter((u) => u != null)
      .map((u) => `<PredecessorLink><PredecessorUID>${u}</PredecessorUID><Type>1</Type></PredecessorLink>`)
      .join("");
    const baseline = (t.dataInicioBase && t.dataFimBase)
      ? `<Baseline><Number>0</Number><Start>${fmt(t.dataInicioBase, "08:00:00")}</Start><Finish>${fmt(t.dataFimBase, "17:00:00")}</Finish><Duration>${dur(dias)}</Duration><DurationFormat>7</DurationFormat></Baseline>`
      : "";
    return `    <Task>
      <UID>${t.uidMpp}</UID>
      <ID>${id}</ID>
      <Name>${esc(t.nome)}</Name>
      <Active>1</Active>
      <Manual>0</Manual>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <OutlineLevel>${Math.max(1, t.outlineLevel || 1)}</OutlineLevel>
      <Summary>${t.isSummary ? 1 : 0}</Summary>
      <Milestone>${marco ? 1 : 0}</Milestone>${start ? `\n      <Start>${start}</Start>` : ""}${finish ? `\n      <Finish>${finish}</Finish>` : ""}
      <Duration>${dur(dias)}</Duration>
      <DurationFormat>7</DurationFormat>
      <PercentComplete>${Math.min(100, Math.max(0, Math.round(t.percentualRealizado || 0)))}</PercentComplete>
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
