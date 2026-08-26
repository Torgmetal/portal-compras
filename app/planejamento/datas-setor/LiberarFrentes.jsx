"use client";
// LIBERAR PARA O PCP — o Planejamento diz o que desce, por frente.
//
// Vitor (25/08/2026): "o planejamento cria a demanda para o pcp indicando as prioridades e fases
// das obras... a data seria o marco para iniciar, mas podemos começar antes ou depois e isso deve
// ser medido do porquê não foi iniciado naquela data".
//
// ⚠⚠ A DATA NÃO LIBERA SOZINHA. Ela é o marco; alguém confirma. Se o cronograma liberasse por
// conta própria, todo recálculo jogaria obra na fábrica sem decisão de ninguém — e o desvio não
// teria dono. Liberar depois do marco exige motivo; adiantar, não (adiantar não custa prazo).
import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle, Send, Check, X, Flag, CalendarClock } from "lucide-react";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }) : "—");
// classes escritas por extenso: Tailwind não gera classe montada em runtime
const PRIO = {
  ALTA:  { rot: "Alta",  chip: "bg-red-50 text-red-700 border-red-200" },
  MEDIA: { rot: "Média", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  BAIXA: { rot: "Baixa", chip: "bg-gray-100 text-torg-gray border-gray-200" },
};

export default function LiberarFrentes({ opId, opNumero, onMudou }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [sel, setSel] = useState(null); // frente sendo liberada
  const [setores, setSetores] = useState([]);
  const [prioridade, setPrioridade] = useState("MEDIA");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!opId) { setD(null); return; }
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/planejamento/liberacao?opId=${opId}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar as frentes");
      setD(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [opId]);
  useEffect(() => { carregar(); }, [carregar]);

  // o marco da frente é a data do PRIMEIRO setor escolhido — é quando aquele trabalho devia começar
  const marcoDe = (keys) => {
    const datas = keys.map((k) => d?.datasSetor?.[k]).filter(Boolean).sort();
    return datas[0] || null;
  };
  const marco = sel ? marcoDe(setores) : null;
  const desvio = marco ? Math.round((new Date().setUTCHours(12,0,0,0) - new Date(`${marco}T12:00:00Z`)) / 86400000) : null;

  function abrir(f) {
    setSel(f.frente); setMotivo("");
    setSetores(f.liberacao?.setores?.length ? f.liberacao.setores : (d.setores[0] ? [d.setores[0].key] : []));
    setPrioridade(f.liberacao?.prioridade || "MEDIA");
  }

  async function liberar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/planejamento/liberacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, frente: sel, setores, prioridade, dataMarco: marco, desvioMotivo: motivo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao liberar");
      setSel(null); await carregar(); onMudou?.();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function mudar(id, patch) {
    setErro("");
    try {
      const r = await fetch("/api/planejamento/liberacao", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao alterar");
      await carregar(); onMudou?.();
    } catch (e) { setErro(e.message); }
  }

  if (!opId) return null;
  if (carregando) return <div className="text-sm text-torg-gray inline-flex items-center gap-2 py-4"><Loader2 size={15} className="animate-spin" /> carregando as frentes…</div>;
  if (!d) return null;

  // ⚠ SEM LPC NÃO SE LIBERA — e a tela precisa DIZER isso. Vitor (25/08/2026): "no caso da OP-105
  // sem lista não tem como programar, precisa ter ao menos a LPC". Sumir em silêncio faria parecer
  // que a obra não tem frente, e não que falta a lista.
  if (!d.temLpc) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800 flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <span>
          A <b>OP-{opNumero}</b> não tem LPC importada. Sem a lista da Engenharia não há o que liberar —
          o PCP não teria peça para imprimir nem para baixar.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[13px] text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {erro}
        </div>
      )}

      <div className="overflow-x-auto border border-gray-100 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase text-torg-gray">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Frente</th>
              <th className="px-3 py-2 text-right font-semibold">Peso</th>
              <th className="px-3 py-2 text-right font-semibold">Peças</th>
              <th className="px-3 py-2 text-right font-semibold">Conjuntos</th>
              <th className="px-3 py-2 text-left font-semibold">Situação</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {d.frentes.map((f) => {
              const l = f.liberacao;
              const p = l ? PRIO[l.prioridade] : null;
              return (
                <tr key={f.frente} className={l && l.status !== "CANCELADA" ? "bg-emerald-50/30" : ""}>
                  <td className="px-3 py-2 font-mono text-[12px] font-semibold text-torg-dark">{f.frente}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px]">{fmtKg(f.kg)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px] text-torg-gray">{fmtN(f.pecas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[12px] text-torg-gray">{fmtN(f.conjuntos)}</td>
                  <td className="px-3 py-2">
                    {!l || l.status === "CANCELADA" ? (
                      <span className="text-[12px] text-torg-gray-light">não liberada</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${p.chip}`}>{p.rot}</span>
                        <span className="text-[11px] text-torg-gray">{(l.setores || []).map((k) => d.setores.find((s) => s.key === k)?.label || k).join(" · ")}</span>
                        {/* ⚠ o desvio aparece SEMPRE que existe: é a medida que o Vitor pediu. */}
                        {l.desvioDias != null && l.desvioDias !== 0 && (
                          <span className={`text-[10px] ${l.desvioDias > 0 ? "text-red-600" : "text-emerald-700"}`} title={l.desvioMotivo || ""}>
                            {l.desvioDias > 0 ? `${l.desvioDias}d após o marco` : `${-l.desvioDias}d adiantada`}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!l || l.status === "CANCELADA" ? (
                      <button onClick={() => abrir(f)} className="text-[12px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
                        <Send size={12} /> liberar
                      </button>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => abrir(f)} className="text-[11px] text-torg-gray hover:underline">ajustar</button>
                        <button onClick={() => { const m = window.prompt("Motivo do cancelamento:"); if (m) mudar(l.id, { status: "CANCELADA", motivo: m }); }}
                          className="text-[11px] text-torg-gray hover:text-red-600">cancelar</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel && (
        <div className="bg-white border border-torg-blue-100 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-torg-dark inline-flex items-center gap-2"><Flag size={15} className="text-torg-blue" /> Liberar a frente {sel}</p>

          <div>
            <p className="text-[11px] uppercase text-torg-gray-light mb-1.5">Setores que descem agora</p>
            <div className="flex flex-wrap gap-1.5">
              {d.setores.map((s) => {
                const on = setores.includes(s.key);
                return (
                  <button key={s.key} onClick={() => setSetores((v) => (on ? v.filter((k) => k !== s.key) : [...v, s.key]))}
                    className={`text-[12px] px-2.5 py-1 rounded-lg border ${on ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"}`}>
                    {s.label}
                    {d.datasSetor?.[s.key] && <span className={`ml-1.5 text-[10px] ${on ? "text-white/70" : "text-torg-gray-light"}`}>{fmtD(d.datasSetor[s.key])}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase text-torg-gray-light">Prioridade</span>
            {["ALTA", "MEDIA", "BAIXA"].map((k) => (
              <button key={k} onClick={() => setPrioridade(k)}
                className={`text-[12px] px-2.5 py-1 rounded-lg border ${prioridade === k ? PRIO[k].chip + " font-semibold" : "bg-white text-torg-gray border-gray-200"}`}>
                {PRIO[k].rot}
              </button>
            ))}
          </div>

          {/* ⚠ o marco vem da data do PRIMEIRO setor escolhido — é quando aquele trabalho devia começar */}
          <div className="text-[12px] text-torg-gray inline-flex items-center gap-2">
            <CalendarClock size={14} />
            {marco
              ? <>Marco: <b className="text-torg-dark">{fmtD(marco)}</b>{desvio === 0 ? " — liberando no dia" : desvio > 0 ? <span className="text-red-600"> — {desvio} dia(s) depois</span> : <span className="text-emerald-700"> — {-desvio} dia(s) antes</span>}</>
              : <span className="text-torg-gray-light">Sem data por setor informada — a liberação fica sem marco e sem desvio para medir.</span>}
          </div>

          {desvio > 0 && (
            <div>
              <label className="block text-[11px] uppercase text-torg-gray-light mb-1">Por que não começou no marco?</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus
                placeholder="ex.: material não chegou, desenho em revisão, fábrica na OP-083"
                className="w-full text-[13px] border border-gray-200 rounded-lg px-3 py-2 focus:border-torg-blue outline-none" />
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={liberar} disabled={salvando || !setores.length || (desvio > 0 && !motivo.trim())}
              className="px-4 py-2 bg-torg-blue text-white text-sm font-semibold rounded-lg disabled:opacity-40 inline-flex items-center gap-2">
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Liberar para o PCP
            </button>
            <button onClick={() => setSel(null)} className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1"><X size={14} /> cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
