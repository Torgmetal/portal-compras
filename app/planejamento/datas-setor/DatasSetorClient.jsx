"use client";
import { useState, useEffect, useCallback } from "react";
import { CalendarClock, Loader2, AlertCircle, RefreshCw, Send } from "lucide-react";
import LiberarFrentes from "./LiberarFrentes";

const fmtDia = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

export default function DatasSetorClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [opSel, setOpSel] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const res = await fetch("/api/planejamento/datas-setor", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const setores = dados?.setores || [];
  const ops = dados?.ops || [];
  const op = ops.find((o) => o.opNumero === opSel) || null;

  // ⚠ o dia de hoje em ISO, para dizer qual marco já venceu
  const hojeISO = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-torg-blue-50 p-2.5 rounded-xl"><CalendarClock size={24} className="text-torg-blue" /></div>
          <div>
            <h1 className="text-2xl font-bold text-torg-dark">Datas por setor</h1>
            <p className="text-sm text-torg-gray">O marco de cada setor vem do cronograma da obra · escolha a OP para liberar o que desce para o PCP</p>
          </div>
        </div>
        <button onClick={carregar} className="p-2.5 rounded-xl bg-white border border-torg-blue-100 hover:border-torg-blue-300 text-torg-dark"><RefreshCw size={18} className={loading ? "animate-spin" : ""} /></button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-torg-gray"><Loader2 size={40} className="animate-spin mb-3 text-torg-blue" /> <p>Carregando…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-24 text-center"><AlertCircle size={40} className="text-red-500 mb-3" /><p className="text-red-600 mb-3">{erro}</p><button onClick={carregar} className="text-sm bg-white border border-torg-blue-100 px-4 py-2 rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar de novo</button></div>
      ) : (
        <div className="space-y-6">
          {/* Seletor + formulário */}
          <div className="bg-white rounded-xl border border-torg-blue-100 p-5">
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-medium text-torg-gray mb-1">Obra (OP)</label>
                <select value={opSel} onChange={(e) => setOpSel(e.target.value)} className="w-full border border-torg-blue-100 rounded-lg px-3 py-2 text-sm">
                  <option value="">Selecione uma OP…</option>
                  {ops.map((o) => <option key={o.opNumero} value={o.opNumero}>OP-{o.opNumero} — {o.obra}</option>)}
                </select>
              </div>
            </div>

            {!op ? (
              <p className="text-sm text-torg-gray py-6 text-center">Escolha uma OP acima (ou clique numa linha da tabela) para ver os marcos e liberar para o PCP.</p>
            ) : (
              <>
                {/* ⚠⚠ NÃO SE DIGITA MAIS DATA AQUI. Vitor (26/08/2026): "quando seleciono a obra
                    não quero que traga mais esse campo para preencher as datas daquela maneira, a
                    partir da OP que eu selecionar vc já traz a data informada no cronograma".

                    O cronograma já é a data acordada da obra; redigitá-la criava uma segunda
                    verdade que envelhecia sozinha. Aqui ela é MARCO: serve para medir o desvio da
                    liberação, não para ser preenchida.

                    ⚠ A data digitada à mão continua existindo no banco e continua mandando na TV
                    de Prioridades — por isso aparece quando difere. Escondê-la faria dela uma
                    regra invisível. */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {setores.map((s) => {
                    const crono = op.datasSetorCrono?.[s.key] || null;
                    const manual = op.datasSetor?.[s.key] || null;
                    const venceu = crono && crono < hojeISO;
                    return (
                      <div key={s.key} className={`rounded-lg border px-2.5 py-2 ${venceu ? "border-red-200 bg-red-50" : crono ? "border-torg-blue-100 bg-white" : "border-gray-100 bg-gray-50"}`}>
                        <p className="text-[11px] font-semibold text-torg-dark truncate">{s.label}</p>
                        <p className={`text-sm font-bold tabular-nums ${venceu ? "text-red-600" : crono ? "text-torg-dark" : "text-torg-gray-light"}`}>
                          {crono ? fmtDia(crono) : "—"}
                        </p>
                        <p className="text-[10px] mt-0.5 h-3 truncate">
                          {venceu ? <span className="text-red-500">venceu</span>
                            : manual && manual !== crono ? <span className="text-torg-gray-light" title="data informada à mão — é ela que manda na TV de Prioridades">TV: {fmtDia(manual)}</span>
                            : <span className="text-torg-gray-light">{crono ? "cronograma" : "sem tarefa"}</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* ── liberar para o PCP, por frente ── */}
                {/* ⚠ a data acima é MARCO, não gatilho: quem libera é alguém, aqui, e o desvio
                    entre o marco e o dia da liberação fica gravado com o motivo. */}
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
                    <h3 className="font-bold text-torg-dark inline-flex items-center gap-2"><Send size={16} className="text-torg-blue" /> Liberar para o PCP</h3>
                    <p className="text-[12px] text-torg-gray">
                      As datas acima são o <b>marco</b> de início. Liberar é decisão — pode ser antes ou
                      depois, e o desvio fica registrado.
                    </p>
                  </div>
                  <LiberarFrentes opId={op.opId} opNumero={op.opNumero} onMudou={carregar} />
                </div>
              </>
            )}
          </div>

          {/* Visão geral */}
          <div className="bg-white rounded-xl border border-torg-blue-100 overflow-hidden">
            <div className="flex items-center justify-between p-5 pb-3">
              <h2 className="font-bold text-torg-dark">Visão geral das obras</h2>
              <span className="text-[11px] text-torg-gray"><b className="text-torg-dark">negrito</b> = informado · <span className="text-torg-gray-light italic">cinza</span> = sugerido pelo cronograma</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-xs text-torg-gray uppercase border-y border-torg-blue-50 bg-torg-blue-50/40">
                    <th className="px-5 py-2 text-left font-medium">OP / Obra</th>
                    {setores.map((s) => <th key={s.key} className="px-2 py-2 text-center font-medium">{s.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-torg-blue-50">
                  {ops.map((o) => (
                    <tr key={o.opNumero} onClick={() => setOpSel(o.opNumero)} className={`cursor-pointer hover:bg-torg-blue-50/40 ${o.opNumero === opSel ? "bg-torg-blue-50/60" : ""}`}>
                      <td className="px-5 py-2 whitespace-nowrap"><span className="font-semibold text-torg-dark tabular-nums">OP-{o.opNumero}</span> <span className="text-torg-gray">{o.obra}</span></td>
                      {setores.map((s) => {
                        const manual = o.datasSetor?.[s.key];
                        const crono = o.datasSetorCrono?.[s.key];
                        return (
                          <td key={s.key} className="px-2 py-2 text-center tabular-nums whitespace-nowrap">
                            {manual ? <span className="font-bold text-torg-dark">{fmtDia(manual)}</span>
                              : crono ? <span className="text-torg-gray-light italic">{fmtDia(crono)}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
