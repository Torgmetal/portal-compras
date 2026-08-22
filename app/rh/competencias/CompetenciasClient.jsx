"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Award, Loader2, Search, ChevronRight, CheckCircle2, FileText, Circle, LayoutGrid } from "lucide-react";

const NIVEL_COR = {
  OPERACIONAL: "bg-slate-100 text-slate-600",
  TECNICO: "bg-sky-100 text-sky-700",
  SUPERVISAO: "bg-indigo-100 text-indigo-700",
  GERENCIA: "bg-amber-100 text-amber-700",
  DIRETORIA: "bg-rose-100 text-rose-700",
};

export default function CompetenciasClient() {
  const router = useRouter();
  const [cargos, setCargos] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/rh/competencias").then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!j) return setErro("Erro ao carregar"); setCargos(j.cargos || []); setResumo(j.resumo || null); })
      .catch(() => setErro("Erro ao carregar")).finally(() => setLoading(false));
  }, []);

  const grupos = useMemo(() => {
    const termo = q.trim().toLowerCase();
    const filtrados = termo ? cargos.filter((c) => `${c.nome} ${c.area} ${c.categoria || ""}`.toLowerCase().includes(termo)) : cargos;
    const map = new Map();
    for (const c of filtrados) {
      const k = c.area || "Sem área";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(c);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [cargos, q]);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2.5"><Award className="text-torg-blue" size={28} /> Matriz de Competências</h2>
          <p className="text-sm text-torg-gray mt-1">Competências e qualificações por cargo (FORM-11 · ISO 9001 item 7.2). Clique num cargo para ver e editar a matriz.</p>
        </div>
        {resumo && (
          <div className="flex gap-2.5">
            <Kpi n={resumo.total} l="Cargos" />
            <Kpi n={resumo.comMatriz} l="Com matriz" tone="blue" />
            <Kpi n={resumo.comDescricao} l="Com descrição" tone="green" />
          </div>
        )}
      </div>

      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-torg-gray" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cargo ou área…" className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />
      </div>

      {loading ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin mb-2" /> Carregando…</div>
      ) : erro ? (
        <div className="py-10 text-center text-red-600 text-sm">{erro}</div>
      ) : grupos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-torg-gray text-sm">Nenhum cargo encontrado.</div>
      ) : (
        <div className="space-y-6">
          {grupos.map(([area, lista]) => (
            <div key={area}>
              <div className="flex items-center gap-2 mb-2.5">
                <LayoutGrid size={14} className="text-torg-blue" />
                <h3 className="text-[13px] font-bold text-torg-dark uppercase tracking-wide">{area}</h3>
                <span className="text-[11px] text-torg-gray">· {lista.length}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {lista.map((c) => (
                  <button key={c.id} onClick={() => router.push(`/rh/competencias/${c.id}`)}
                    className="group text-left bg-white rounded-xl border border-gray-200 hover:border-torg-blue hover:shadow-md transition-all p-4 flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-torg-dark text-[14px] leading-snug">{c.nome}</span>
                      <ChevronRight size={16} className="text-gray-300 group-hover:text-torg-blue shrink-0 mt-0.5" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.nivel && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${NIVEL_COR[c.nivel] || "bg-gray-100 text-gray-600"}`}>{c.nivel}</span>}
                      {c.temMatriz
                        ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-torg-blue-50 text-torg-blue inline-flex items-center gap-1"><CheckCircle2 size={11} /> matriz {c.revisao ? `· rev ${c.revisao}` : ""}</span>
                        : c.temDescricao
                          ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 inline-flex items-center gap-1"><FileText size={11} /> descrição</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 inline-flex items-center gap-1"><Circle size={10} /> vazio</span>}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-torg-gray mt-0.5">
                      <span><b className="text-torg-dark font-bold tabular-nums">{c.nComp}</b> competências</span>
                      <span><b className="text-torg-dark font-bold tabular-nums">{c.nFunc}</b> funcionários</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ n, l, tone }) {
  const c = tone === "blue" ? "text-torg-blue" : tone === "green" ? "text-emerald-600" : "text-torg-dark";
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-center min-w-[86px]">
      <div className={`text-2xl font-extrabold tabular-nums leading-none ${c}`}>{n}</div>
      <div className="text-[10px] uppercase tracking-wide text-torg-gray mt-1 font-semibold">{l}</div>
    </div>
  );
}
