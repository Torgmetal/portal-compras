"use client";
// Prioridades de Produção — 3 blocos de setor (Preparação · Montagem+Solda · Acabamento/Jato/Pintura).
// Lista SÓ as peças marcadas como prioridade que estão naquele bloco AGORA (setor real), por OP,
// na ordem da prioridade. ↑/↓ reordena (troca a prioridade entre peças da mesma OP).
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle, Flag, ChevronUp, ChevronDown, Truck, RefreshCw, Inbox } from "lucide-react";

const BLOCOS = [
  { key: "preparacao", label: "Preparação" },
  { key: "montagem", label: "Montagem + Solda" },
  { key: "acabamento", label: "Acabamento, Jato e Pintura" },
];
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");

export default function PrioridadesProducaoClient({ podeEditar }) {
  const sp = useSearchParams();
  const inicial = BLOCOS.some((b) => b.key === sp.get("bloco")) ? sp.get("bloco") : "preparacao";
  const [aba, setAba] = useState(inicial);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [movendo, setMovendo] = useState("");

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/producao/prioridades", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j.blocos || []);
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Move a peça na posição i (do array ordenado da OP) uma casa pra cima/baixo,
  // trocando a prioridade com a vizinha (mesma OP).
  async function mover(pecas, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= pecas.length) return;
    const a = pecas[i], b = pecas[j];
    setMovendo(a.id);
    try {
      const r = await fetch("/api/producao/prioridades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId: a.id, bId: b.id }),
      });
      const jr = await r.json();
      if (!r.ok) throw new Error(jr.error || "Erro ao reordenar");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setMovendo(""); }
  }

  const blocoAtual = (dados || []).find((b) => b.key === aba);

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      <div className="bg-[#002945] text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/producao" className="p-2 rounded-lg hover:bg-white/10 text-white/80"><ArrowLeft size={18} /></Link>
          <div className="flex items-center gap-2">
            <Flag size={20} className="text-torg-orange" />
            <h1 className="text-xl sm:text-2xl font-extrabold">Prioridades de Produção</h1>
          </div>
          <button onClick={carregar} className="ml-auto p-2 rounded-lg hover:bg-white/10 text-white/80" title="Atualizar"><RefreshCw size={16} /></button>
        </div>
        {/* Abas dos 3 blocos */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {BLOCOS.map((b) => {
            const bd = (dados || []).find((x) => x.key === b.key);
            const n = bd ? bd.total : null;
            const on = aba === b.key;
            return (
              <button key={b.key} onClick={() => setAba(b.key)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition ${on ? "bg-[#F3F6F9] text-torg-dark" : "text-white/70 hover:text-white hover:bg-white/5"}`}>
                {b.label}{n != null && <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${on ? "bg-torg-orange/15 text-torg-orange" : "bg-white/15 text-white/80"}`}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {erro && <p className="mb-4 text-sm text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>}

        {dados === null ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin" /></div>
        ) : !blocoAtual || blocoAtual.ops.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl py-16 text-center bg-white">
            <Inbox size={30} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-torg-dark">Nenhuma peça prioritária neste bloco</p>
            <p className="text-xs text-torg-gray mt-1">Marque prioridades em <Link href="/planejamento/prioridades/marcar" className="text-torg-blue hover:underline">Planejamento › Marcar prioridades</Link>.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {blocoAtual.ops.map((op) => (
              <div key={op.opNumero} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-extrabold text-torg-dark tabular-nums">OP-{op.opNumero}</span>
                  <span className="text-sm text-torg-gray truncate max-w-[280px]" title={op.obra}>{op.obra}</span>
                  <span className="ml-auto text-xs text-torg-gray tabular-nums">{op.pecas.length} peça(s) · {fmtKg(op.pesoKg)}</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {op.pecas.map((p, i) => (
                    <li key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-7 h-7 shrink-0 rounded-full bg-torg-orange/10 text-torg-orange font-extrabold text-sm inline-flex items-center justify-center tabular-nums">{p.prioridade}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-semibold text-torg-dark text-sm truncate">{p.marca}</p>
                        {p.descricao && <p className="text-[11px] text-torg-gray truncate">{p.descricao}</p>}
                      </div>
                      {p.terceiro ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium inline-flex items-center gap-1 shrink-0"><Truck size={11} /> no terceiro{p.retornoPrevisto ? ` · volta ${fmtData(p.retornoPrevisto)}` : ""}</span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-torg-gray font-medium shrink-0">{p.setor}</span>
                      )}
                      <span className="text-xs text-torg-gray tabular-nums w-20 text-right shrink-0">{fmtKg(p.pesoTotalKg)}</span>
                      {podeEditar && (
                        <div className="flex flex-col shrink-0">
                          <button onClick={() => mover(op.pecas, i, -1)} disabled={i === 0 || movendo === p.id}
                            className="text-gray-400 hover:text-torg-blue disabled:opacity-25 disabled:hover:text-gray-400" title="Subir prioridade">
                            {movendo === p.id ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={16} />}
                          </button>
                          <button onClick={() => mover(op.pecas, i, 1)} disabled={i === op.pecas.length - 1 || movendo === p.id}
                            className="text-gray-400 hover:text-torg-blue disabled:opacity-25 disabled:hover:text-gray-400" title="Descer prioridade">
                            <ChevronDown size={16} />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
