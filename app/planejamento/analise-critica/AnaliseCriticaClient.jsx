"use client";
import { useState, useEffect, useCallback, Fragment } from "react";
import { fmtOP } from "@/lib/utils";
import { SETOR_LABEL_SOLIC } from "@/lib/solicitacao-producao-const";
import {
  Loader2, AlertCircle, RefreshCw, Sparkles, AlertTriangle, CheckCircle2, Clock, Brain,
} from "lucide-react";

const fmtKg = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (iso) => (iso ? new Date((typeof iso === "string" && iso.length === 10 ? iso + "T12:00:00Z" : iso)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }) : "—");

// Render markdown enxuto (## títulos, - bullets, **negrito**)
function Markdown({ texto }) {
  const linhas = (texto || "").split("\n");
  const inline = (s) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
      p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>
    );
  return (
    <div className="space-y-1.5 text-sm text-torg-dark leading-relaxed">
      {linhas.map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        if (t.startsWith("## ")) return <h4 key={i} className="text-sm font-bold text-torg-blue mt-3 first:mt-0">{inline(t.slice(3))}</h4>;
        if (t.startsWith("# ")) return <h3 key={i} className="text-base font-bold text-torg-dark mt-3">{inline(t.slice(2))}</h3>;
        if (/^[-*]\s/.test(t)) return <div key={i} className="flex gap-2 pl-1"><span className="text-torg-gray">•</span><span className="flex-1">{inline(t.replace(/^[-*]\s/, ""))}</span></div>;
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}

export default function AnaliseCriticaClient() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [sel, setSel] = useState(null);
  const [analise, setAnalise] = useState({}); // opNumero → { plano, situacao }
  const [gerando, setGerando] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const res = await fetch("/api/planejamento/obras-producao");
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const d = await res.json();
      const lista = (d.obras || []).sort((a, b) => (a.aderente === b.aderente ? 0 : a.aderente ? 1 : -1));
      setObras(lista);
      if (!sel && lista.length) setSel(lista[0].opNumero);
    } catch (e) { setErro(e.message); } finally { setLoading(false); }
  }, [sel]);

  useEffect(() => { carregar(); }, []); // eslint-disable-line

  async function gerar(op) {
    setGerando(op);
    try {
      const res = await fetch("/api/planejamento/analise-critica", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero: op }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro na análise");
      setAnalise((prev) => ({ ...prev, [op]: d }));
    } catch (e) {
      setAnalise((prev) => ({ ...prev, [op]: { erro: e.message } }));
    } finally { setGerando(null); }
  }

  const obra = obras.find((o) => o.opNumero === sel);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-torg-gray"><Loader2 className="animate-spin mr-3" size={28} /> Carregando obras…</div>;
  }
  if (erro) {
    return (
      <div className="text-center py-16">
        <AlertCircle size={40} className="mx-auto text-red-400 mb-3" />
        <p className="text-red-600 font-medium">{erro}</p>
        <button onClick={carregar} className="mt-3 px-4 py-2 bg-torg-blue text-white rounded-lg text-sm">Tentar novamente</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <Brain size={24} className="text-torg-blue" /> Análise Crítica
          </h2>
          <p className="text-xs text-torg-gray mt-0.5 max-w-2xl">
            Para obras em risco, a IA monta um plano de ação (jornada, terceirização, repriorização…). Quando há erro de
            apontamento, ele é sinalizado primeiro — confira antes de decidir.
          </p>
        </div>
        <button onClick={carregar} className="px-3 py-1.5 bg-white border border-torg-blue-200 text-torg-blue text-xs rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-1.5">
          <RefreshCw size={13} /> Atualizar
        </button>
      </div>

      {obras.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-torg-gray">
          Nenhuma obra em produção. Envie solicitações no Início de Produção.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* Lista de obras */}
          <div className="space-y-2">
            {obras.map((o) => (
              <button key={o.opNumero} onClick={() => setSel(o.opNumero)}
                className={`w-full text-left rounded-xl border p-3 transition-colors ${
                  sel === o.opNumero ? "border-torg-blue bg-torg-blue-50/40" : "border-gray-100 bg-white hover:bg-gray-50"
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-torg-blue">{fmtOP(o.opNumero)}</span>
                  {o.aderente
                    ? <span className="text-[10px] font-semibold text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={11} /> no prazo</span>
                    : <span className="text-[10px] font-semibold text-red-600 inline-flex items-center gap-1"><AlertTriangle size={11} /> em risco</span>}
                </div>
                <p className="text-[11px] text-torg-gray mt-0.5 truncate">{o.cliente || o.obra || "—"}</p>
                <p className="text-[10px] text-torg-gray mt-0.5">entrega {fmtData(o.dataEntrega)}{o.atrasados?.length ? ` · ${o.atrasados.length} setor(es) atrasado(s)` : ""}</p>
              </button>
            ))}
          </div>

          {/* Detalhe + análise */}
          <div className="space-y-3">
            {obra && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-bold text-torg-dark">{fmtOP(obra.opNumero)} · {obra.cliente || "—"}</h3>
                    <button onClick={() => gerar(obra.opNumero)} disabled={gerando === obra.opNumero}
                      className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-1.5 disabled:opacity-50">
                      {gerando === obra.opNumero ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {analise[obra.opNumero] ? "Refazer análise (IA)" : "Gerar análise crítica (IA)"}
                    </button>
                  </div>
                  {/* Setores atrasados resumo */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {obra.setores.filter((s) => s.situacao === "ATRASADO").map((s) => (
                      <span key={s.setor} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700">
                        {SETOR_LABEL_SOLIC[s.setor]} atrasado{s.data ? ` (${fmtData(s.data)})` : ""}
                      </span>
                    ))}
                    {obra.aderente && <span className="text-[11px] text-torg-gray">Sem setores atrasados — análise opcional.</span>}
                  </div>
                </div>

                {/* Resultado da análise */}
                {gerando === obra.opNumero && (
                  <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-center gap-3 text-sm text-torg-gray">
                    <Loader2 className="animate-spin text-torg-blue" size={20} /> A IA está montando o plano de ação…
                  </div>
                )}
                {analise[obra.opNumero]?.erro && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{analise[obra.opNumero].erro}</div>
                )}
                {analise[obra.opNumero]?.plano && (
                  <>
                    {analise[obra.opNumero].situacao?.furoApontamento?.tem && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-red-800 flex items-center gap-2"><AlertTriangle size={15} /> Erro de apontamento detectado — confira antes</p>
                        <div className="mt-1 space-y-0.5 text-xs text-red-800">
                          {analise[obra.opNumero].situacao.furoApontamento.detalhes.map((d, i) => <p key={i} className="tabular-nums">{d}</p>)}
                        </div>
                        <p className="text-[11px] text-red-600 mt-1">As quantidades que faltam podem estar erradas — valide os lançamentos no Syneco antes de decidir.</p>
                      </div>
                    )}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                      <Markdown texto={analise[obra.opNumero].plano} />
                      <p className="text-[10px] text-torg-gray mt-3 flex items-center gap-1"><Clock size={11} /> Gerado por IA a partir da situação atual — revise antes de executar.</p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
