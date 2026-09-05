"use client";
import { AlertCircle, AlertTriangle, Calendar, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { DEPT_LABEL } from "../_lib/rotulos";

// Previa e aplicacao das datas geradas automaticamente.
export function ModalGerarDatas({
  apenasSemData,
  detail,
  encadearSetor,
  gerando,
  gerarDatas,
  gerarInicio,
  gerarPreview,
  setApenasSemData,
  setEncadearSetor,
  setGerarInicio,
  setGerarPreview,
  setShowGerar,
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => { if (!gerando) setShowGerar(false); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-torg-blue" />
            <h3 className="font-semibold text-torg-dark text-sm">Gerar datas automaticamente</h3>
          </div>
          <button onClick={() => setShowGerar(false)} disabled={gerando} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-torg-gray">
            Calcula início e fim de cada tarefa a partir da data de início do projeto + a <strong>duração</strong> de cada uma,
            seguindo as <strong>antecessoras</strong> (inclusive de outros setores). Revise a prévia e clique em <strong>Aplicar</strong>.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-[11px] text-torg-gray mb-1">
                Início do projeto ({(detail.tipoDias || "DU") === "DU" ? "dias úteis" : "dias corridos"})
              </label>
              <input type="date" value={gerarInicio} onChange={(e) => setGerarInicio(e.target.value)} className="text-xs px-2 py-1.5 border border-gray-200 rounded focus:ring-1 focus:ring-torg-blue" />
            </div>
            <button
              onClick={() => gerarDatas(false)}
              disabled={gerando || !gerarInicio}
              className="px-3 py-1.5 text-xs font-medium text-white bg-torg-blue rounded-lg hover:bg-torg-blue-700 flex items-center gap-1.5 disabled:opacity-50"
            >
              {gerando ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Calcular prévia
            </button>
          </div>

          {/* ⚠ a opção que protege o que já foi acordado — ver o comentário no estado. */}
          <label className={`flex items-start gap-2 text-[11px] cursor-pointer select-none border rounded-lg px-2.5 py-1.5 ${apenasSemData ? "text-torg-dark bg-emerald-50/60 border-emerald-200" : "text-amber-900 bg-amber-50 border-amber-300"}`}>
            <input type="checkbox" checked={apenasSemData} onChange={(e) => { setApenasSemData(e.target.checked); setGerarPreview(null); }} className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            <span>
              Preencher <b>só as tarefas sem data</b>, usando as que já têm como âncora.
              {!apenasSemData && <b className="block mt-0.5">⚠ Desmarcado, o cálculo REFAZ o cronograma inteiro a partir da data de início — as datas já acordadas mudam.</b>}
            </span>
          </label>

          <label className="flex items-start gap-2 text-[11px] text-torg-dark cursor-pointer select-none bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg px-2.5 py-1.5">
            <input type="checkbox" checked={encadearSetor} onChange={(e) => { setEncadearSetor(e.target.checked); setGerarPreview(null); }} className="mt-0.5 rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
            <span>Encadear as tarefas do <b>mesmo setor</b> em sequência quando não têm antecessora — assim basta a <b>duração</b> de cada uma pra montar o cronograma (não precisa amarrar antecessora em tudo).</span>
          </label>

          {gerarPreview?.erro && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-1.5">
              <AlertCircle size={12} /> {gerarPreview.erro}
            </div>
          )}

          {Array.isArray(gerarPreview) && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              {gerarPreview.some((p) => p.semDuracao) && (
                <div className="px-3 py-2 bg-amber-50 text-amber-700 text-[11px] flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  <span>{gerarPreview.filter((p) => p.semDuracao).length} tarefa(s) <strong>sem duração</strong> ficaram com início = fim. Preencha a duração delas (coluna DU/DC na tarefa) pra estenderem o prazo, depois gere de novo.</span>
                </div>
              )}
              <div className="max-h-[45vh] overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Setor</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Tarefa</th>
                      <th className="px-2 py-1.5 text-center font-medium text-gray-500">Início</th>
                      <th className="px-2 py-1.5 text-center font-medium text-gray-500">Fim</th>
                      <th className="px-2 py-1.5 text-center font-medium text-gray-500">Dur.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {gerarPreview.map((p) => (
                      <tr key={p.id} className={p.semDuracao ? "bg-amber-50/40" : ""}>
                        <td className="px-2 py-1 text-torg-gray whitespace-nowrap">{DEPT_LABEL[p.departamento] || p.departamento || "—"}</td>
                        <td className="px-2 py-1 text-torg-dark">{p.nome}</td>
                        <td className="px-2 py-1 text-center tabular-nums whitespace-nowrap">{new Date(p.inicio).toLocaleDateString("pt-BR")}</td>
                        <td className="px-2 py-1 text-center tabular-nums whitespace-nowrap">{new Date(p.fim).toLocaleDateString("pt-BR")}</td>
                        <td className={`px-2 py-1 text-center tabular-nums ${p.semDuracao ? "text-amber-600 font-semibold" : ""}`}>{p.duracaoDias}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <span className="text-[11px] text-torg-gray">
            {Array.isArray(gerarPreview) && gerarPreview.length > 0
              ? `${gerarPreview.length} tarefas · término previsto ${new Date(Math.max(...gerarPreview.map((p) => new Date(p.fim).getTime()))).toLocaleDateString("pt-BR")}`
              : "Calcule a prévia primeiro."}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowGerar(false)} disabled={gerando} className="px-3 py-1.5 text-xs text-torg-gray hover:text-torg-dark disabled:opacity-50">Cancelar</button>
            <button
              onClick={() => gerarDatas(true)}
              disabled={gerando || !Array.isArray(gerarPreview) || gerarPreview.length === 0}
              className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50"
            >
              {gerando ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Aplicar ao cronograma
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
