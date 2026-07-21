"use client";
// Gantt read-only extraído do CronogramasClient (reaproveitado na aba Planejamento
// da OP no comercial). Só precisa de `tarefas` (o `detail` é ignorado). Barras por
// data prevista, baseline, linha do hoje, setas de antecessora, cores por dept.
import { GanttChart, CheckCircle2, Lock, AlertTriangle, Link2 } from "lucide-react";

const DEPT_LABEL = { COMERCIAL: "Comercial", ENGENHARIA: "Engenharia", SUPRIMENTOS: "Suprimentos", FABRICACAO: "Fabricação", EXPEDICAO: "Expedição", MONTAGEM: "Montagem" };
const DEPT_ORDER = ["COMERCIAL", "ENGENHARIA", "SUPRIMENTOS", "FABRICACAO", "EXPEDICAO", "MONTAGEM"];

export default function GanttInline({ tarefas, detail }) {
  // Ordena por DEPT_ORDER (Comercial primeiro) e dentro do dept por uidMpp
  const allTasks = tarefas
    .filter((t) => t.outlineLevel > 0 && t.departamento && !t.isSummary)
    .sort((a, b) => {
      const ia = DEPT_ORDER.indexOf(a.departamento);
      const ib = DEPT_ORDER.indexOf(b.departamento);
      const oa = ia >= 0 ? ia : 99;
      const ob = ib >= 0 ? ib : 99;
      if (oa !== ob) return oa - ob;
      return (a.uidMpp || 0) - (b.uidMpp || 0);
    });
  if (allTasks.length === 0) {
    return (
      <div className="py-8 text-center">
        <GanttChart size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma tarefa com datas para exibir.</p>
      </div>
    );
  }

  // Range de datas
  let minDate = Infinity, maxDate = -Infinity;
  for (const t of allTasks) {
    if (t.dataInicioPrevista) minDate = Math.min(minDate, new Date(t.dataInicioPrevista).getTime());
    if (t.dataFimPrevista) maxDate = Math.max(maxDate, new Date(t.dataFimPrevista).getTime());
    if (t.dataInicioBase) minDate = Math.min(minDate, new Date(t.dataInicioBase).getTime());
    if (t.dataFimBase) maxDate = Math.max(maxDate, new Date(t.dataFimBase).getTime());
  }
  if (!isFinite(minDate) || !isFinite(maxDate)) {
    return <div className="py-6 text-center text-xs text-torg-gray">Tarefas sem datas definidas.</div>;
  }

  // Padding 7 dias
  minDate -= 7 * 86400000;
  maxDate += 7 * 86400000;
  const totalDays = Math.ceil((maxDate - minDate) / 86400000);
  const dayWidth = Math.max(2, Math.min(10, 700 / totalDays));
  const chartWidth = totalDays * dayWidth;
  const rowH = 32;
  const nameColW = 220;

  const now = Date.now();
  const todayPos = ((now - minDate) / 86400000) * dayWidth;

  // Meses
  const months = [];
  const d0 = new Date(minDate);
  let cur = new Date(d0.getFullYear(), d0.getMonth(), 1);
  while (cur.getTime() < maxDate) {
    const start = Math.max(0, (cur.getTime() - minDate) / 86400000);
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const end = Math.min(totalDays, (next.getTime() - minDate) / 86400000);
    months.push({
      label: cur.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      left: start * dayWidth,
      width: (end - start) * dayWidth,
    });
    cur = next;
  }

  // Mapa de task index pra desenhar setas
  const taskIdx = new Map(allTasks.map((t, i) => [t.id, i]));

  const deptColors = {
    COMERCIAL: "#2563eb",
    ENGENHARIA: "#7c3aed",
    SUPRIMENTOS: "#d97706",
    FABRICACAO: "#059669",
    EXPEDICAO: "#0d9488",
    MONTAGEM: "#ea580c",
  };

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: nameColW + chartWidth + 40 }} className="relative">
        {/* Header meses */}
        <div className="flex" style={{ height: 24 }}>
          <div style={{ width: nameColW, flexShrink: 0 }} className="bg-gray-50 border-b border-gray-200 px-2 flex items-center">
            <span className="text-[9px] font-semibold text-torg-gray uppercase">Tarefa</span>
          </div>
          <div className="relative flex-1 bg-gray-50 border-b border-gray-200" style={{ minWidth: chartWidth }}>
            {months.map((m, i) => (
              <div
                key={i}
                className="absolute text-[8px] font-semibold text-gray-500 border-l border-gray-200 flex items-center justify-center capitalize"
                style={{ left: m.left, width: m.width, height: 24 }}
              >
                {m.width > 30 ? m.label : ""}
              </div>
            ))}
          </div>
        </div>

        {/* Rows */}
        {allTasks.map((t, idx) => {
          const color = deptColors[t.departamento] || "#6b7280";
          const isLate = t.dataFimPrevista && new Date(t.dataFimPrevista) < new Date() && t.percentualRealizado < 100;
          const isDone = t.percentualRealizado >= 100;
          const hasAnt = t.antecessoraIds?.length > 0;

          // Bloqueada = tem antecessora nao concluida
          const isBlocked = hasAnt && !isDone && (t.antecessoraIds || []).some((aid) => {
            const ant = allTasks.find((x) => x.id === aid);
            return ant && ant.percentualRealizado < 100;
          });

          // Bloqueio externo = motivoBloqueio preenchido sem dataLiberacao
          const isExtBlocked = !!t.motivoBloqueio && !t.dataLiberacao && !isDone;
          const wasExtBlocked = !!t.motivoBloqueio && !!t.dataLiberacao;

          // Bar position
          let barLeft = 0, barWidth = 0;
          if (t.dataInicioPrevista && t.dataFimPrevista) {
            barLeft = ((new Date(t.dataInicioPrevista).getTime() - minDate) / 86400000) * dayWidth;
            barWidth = Math.max(4, ((new Date(t.dataFimPrevista).getTime() - new Date(t.dataInicioPrevista).getTime()) / 86400000) * dayWidth);
          }

          // Baseline bar
          let baseLeft = 0, baseWidth = 0;
          if (t.dataInicioBase && t.dataFimBase) {
            baseLeft = ((new Date(t.dataInicioBase).getTime() - minDate) / 86400000) * dayWidth;
            baseWidth = Math.max(4, ((new Date(t.dataFimBase).getTime() - new Date(t.dataInicioBase).getTime()) / 86400000) * dayWidth);
          }

          const fillWidth = barWidth * (t.percentualRealizado / 100);
          const barColor = isExtBlocked ? "#dc2626" : isBlocked ? "#d97706" : isLate ? "#dc2626" : color;

          return (
            <div
              key={t.id}
              className={`flex border-b ${isExtBlocked ? "bg-red-50/40" : isBlocked ? "bg-amber-50/30" : isLate ? "bg-red-50/30" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
              style={{ height: rowH }}
            >
              {/* Nome */}
              <div
                style={{ width: nameColW, flexShrink: 0 }}
                className="px-2 flex items-center gap-1.5 overflow-hidden"
              >
                {isDone ? (
                  <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                ) : isExtBlocked ? (
                  <Lock size={10} className="text-red-500 shrink-0" />
                ) : isBlocked ? (
                  <Lock size={10} className="text-amber-500 shrink-0" />
                ) : isLate ? (
                  <AlertTriangle size={10} className="text-red-500 shrink-0" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                )}
                <span className={`text-[10px] truncate ${isDone ? "text-torg-gray line-through" : isExtBlocked ? "text-red-700" : isBlocked ? "text-amber-700" : "text-torg-dark"}`} title={t.nome}>
                  {t.nome}
                </span>
                {isExtBlocked && <span className="text-[7px] text-white bg-red-500 px-1 py-px rounded font-bold shrink-0" title={t.motivoBloqueio}>BLOQ EXT</span>}
                {wasExtBlocked && !isDone && <span className="text-[7px] text-emerald-600 bg-emerald-50 px-1 py-px rounded font-bold shrink-0">LIBERADA</span>}
                {isBlocked && !isExtBlocked && <span className="text-[7px] text-amber-600 font-bold shrink-0">BLOQ</span>}
                {hasAnt && !isBlocked && !isExtBlocked && <Link2 size={8} className="text-purple-400 shrink-0" />}
                <span className={`text-[9px] font-bold ml-auto shrink-0 ${isDone ? "text-emerald-600" : isBlocked ? "text-amber-600" : isLate ? "text-red-600" : "text-torg-gray"}`}>
                  {t.percentualRealizado}%
                </span>
              </div>

              {/* Chart area */}
              <div className="relative flex-1" style={{ minWidth: chartWidth }}>
                {/* Month grid lines */}
                {months.map((m, mi) => (
                  <div key={mi} className="absolute top-0 bottom-0 border-l border-gray-100" style={{ left: m.left }} />
                ))}

                {/* Today line */}
                {todayPos > 0 && todayPos < chartWidth && (
                  <div className="absolute top-0 bottom-0 bg-orange-400 z-10" style={{ left: todayPos, width: 1.5, opacity: 0.5 }} />
                )}

                {/* Baseline bar */}
                {baseWidth > 0 && (
                  <div
                    className="absolute rounded-sm"
                    style={{
                      left: baseLeft, width: baseWidth,
                      top: 4, height: 6,
                      background: "#94a3b8", opacity: 0.3,
                    }}
                  />
                )}

                {/* Current bar */}
                {barWidth > 0 && (
                  <div
                    className={`absolute rounded overflow-hidden ${isExtBlocked ? "animate-pulse" : ""}`}
                    style={{
                      left: barLeft, width: barWidth,
                      top: baseWidth > 0 ? 12 : 8, height: 14,
                      background: isExtBlocked
                        ? `repeating-linear-gradient(45deg, #dc262620, #dc262620 3px, #dc262640 3px, #dc262640 6px)`
                        : isBlocked
                        ? `repeating-linear-gradient(45deg, ${barColor}10, ${barColor}10 3px, ${barColor}25 3px, ${barColor}25 6px)`
                        : `${barColor}15`,
                      border: `1.5px solid ${barColor}`,
                      borderStyle: isExtBlocked ? "dashed" : isBlocked ? "dashed" : "solid",
                    }}
                  >
                    <div
                      style={{ width: fillWidth, height: "100%", background: barColor, opacity: 0.7, borderRadius: "2px 0 0 2px" }}
                    />
                    {isExtBlocked && barWidth > 50 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[7px] text-red-700 font-bold bg-red-100/80 px-1 rounded">
                          ⏸ {t.motivoBloqueio?.length > 15 ? t.motivoBloqueio.slice(0, 15) + "…" : t.motivoBloqueio}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Dependency arrows — solid line from predecessor end to this task start */}
                {hasAnt && t.dataInicioPrevista && (t.antecessoraIds || []).map((antId) => {
                  const antIdx = taskIdx.get(antId);
                  if (antIdx === undefined) return null;
                  const ant = allTasks[antIdx];
                  if (!ant || !ant.dataFimPrevista) return null;
                  const antEnd = ((new Date(ant.dataFimPrevista).getTime() - minDate) / 86400000) * dayWidth;
                  const thisStart = barLeft;
                  const fromY = (antIdx - idx) * rowH;
                  const antDone = ant.percentualRealizado >= 100;
                  const lineColor = antDone ? "#10b981" : "#d97706";
                  return (
                    <svg
                      key={antId}
                      className="absolute pointer-events-none z-20"
                      style={{ left: 0, top: 0, width: chartWidth, height: rowH, overflow: "visible" }}
                    >
                      <path
                        d={`M ${antEnd} ${fromY + rowH / 2} L ${antEnd + 8} ${fromY + rowH / 2} L ${antEnd + 8} ${rowH / 2} L ${thisStart} ${rowH / 2}`}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth={antDone ? "1.2" : "1.8"}
                        strokeDasharray={antDone ? "none" : "4,3"}
                        opacity="0.7"
                      />
                      <polygon
                        points={`${thisStart},${rowH / 2} ${thisStart - 6},${rowH / 2 - 3.5} ${thisStart - 6},${rowH / 2 + 3.5}`}
                        fill={lineColor}
                        opacity="0.7"
                      />
                    </svg>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Legenda */}
        <div className="px-3 py-2 bg-gray-50/40 border-t border-gray-100 flex items-center gap-4 flex-wrap">
          {Object.entries(deptColors).filter(([d]) => allTasks.some((t) => t.departamento === d)).map(([d, c]) => (
            <span key={d} className="flex items-center gap-1 text-[9px] text-torg-gray">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
              {DEPT_LABEL[d]}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[9px] text-torg-gray">
            <div className="w-3 h-1.5 rounded-sm bg-gray-400 opacity-40" /> Baseline
          </span>
          <span className="flex items-center gap-1 text-[9px] text-orange-500">
            <div className="w-0.5 h-3 bg-orange-400" /> Hoje
          </span>
          <span className="flex items-center gap-1 text-[9px] text-red-600">
            <Lock size={8} /> Bloqueio externo
          </span>
          <span className="flex items-center gap-1 text-[9px] text-amber-600">
            <Lock size={8} /> Aguardando antecessora
          </span>
          <span className="flex items-center gap-1 text-[9px] text-emerald-500">
            <svg width="16" height="8"><line x1="0" y1="4" x2="12" y2="4" stroke="#10b981" strokeWidth="1.2" /><polygon points="12,4 8,2 8,6" fill="#10b981" /></svg>
            Concluída
          </span>
          <span className="flex items-center gap-1 text-[9px] text-amber-500">
            <svg width="16" height="8"><line x1="0" y1="4" x2="12" y2="4" stroke="#d97706" strokeWidth="1.5" strokeDasharray="3,2" /><polygon points="12,4 8,2 8,6" fill="#d97706" /></svg>
            Aguardando
          </span>
        </div>
      </div>
    </div>
  );
}
