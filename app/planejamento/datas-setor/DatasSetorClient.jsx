"use client";
import { useState, useEffect, useCallback } from "react";
import { CalendarClock, Loader2, AlertCircle, RefreshCw, Check, Wand2 } from "lucide-react";

const fmtDia = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");

export default function DatasSetorClient() {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [opSel, setOpSel] = useState("");
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

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

  // Ao trocar de OP (ou recarregar), preenche o form com as datas já informadas.
  useEffect(() => { setForm(op ? { ...op.datasSetor } : {}); setSalvo(false); }, [opSel, dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const setData = (key, v) => { setForm((f) => ({ ...f, [key]: v })); setSalvo(false); };
  const usarCronograma = () => { if (op) { setForm({ ...op.datasSetorCrono }); setSalvo(false); } };

  const salvar = async () => {
    if (!op) return;
    setSalvando(true); setErro("");
    try {
      const res = await fetch("/api/planejamento/datas-setor", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: op.opNumero, opId: op.opId, datasSetor: form }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao salvar");
      setSalvo(true);
      await carregar();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-torg-blue-50 p-2.5 rounded-xl"><CalendarClock size={24} className="text-torg-blue" /></div>
          <div>
            <h1 className="text-2xl font-bold text-torg-dark">Datas por setor</h1>
            <p className="text-sm text-torg-gray">Informe quando cada setor precisa entregar em cada obra · essas datas mandam na TV de Prioridades (sobrepõem o cronograma)</p>
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
              {op && (
                <button onClick={usarCronograma} className="px-3 py-2 rounded-lg bg-torg-blue-50 text-torg-blue text-sm font-medium inline-flex items-center gap-1.5 hover:bg-torg-blue-100" title="Preencher com as datas que o cronograma sugere">
                  <Wand2 size={15} /> Usar sugestão do cronograma
                </button>
              )}
            </div>

            {!op ? (
              <p className="text-sm text-torg-gray py-6 text-center">Escolha uma OP acima (ou clique numa linha da tabela) para informar as datas de cada setor.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {setores.map((s) => {
                    const sugestao = op.datasSetorCrono?.[s.key];
                    return (
                      <div key={s.key}>
                        <label className="block text-xs font-semibold text-torg-dark mb-1">{s.label}</label>
                        <input type="date" value={form[s.key] || ""} onChange={(e) => setData(s.key, e.target.value)}
                          className="w-full border border-torg-blue-100 rounded-lg px-2 py-1.5 text-sm tabular-nums focus:border-torg-blue outline-none" />
                        <p className="text-[10px] text-torg-gray-light mt-1 h-3">{sugestao && sugestao !== form[s.key] ? `cronograma: ${fmtDia(sugestao)}` : ""}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <button onClick={salvar} disabled={salvando} className="px-5 py-2 bg-torg-blue text-white text-sm font-semibold rounded-lg disabled:opacity-50 inline-flex items-center gap-2">
                    {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar datas
                  </button>
                  {salvo && <span className="text-sm text-emerald-600 inline-flex items-center gap-1"><Check size={15} /> salvo — já vale na TV</span>}
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
