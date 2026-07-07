"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileBarChart2, Plus, Loader2, AlertCircle, RefreshCw, Inbox, FileDown, Trash2, X, Camera, CheckCircle2,
} from "lucide-react";
import { useStore } from "@/lib/store";

const fmt = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtOP = (n) => { if (!n) return null; const s = String(n).trim(); return /^\d+$/.test(s) ? `OP-${s.padStart(3, "0")}` : `OP ${s}`; };
const ST = { RASCUNHO: "bg-amber-100 text-amber-700", EMITIDO: "bg-green-100 text-green-700" };

export default function RelatoriosClient() {
  const { showToast } = useStore();
  const router = useRouter();
  const [relatorios, setRelatorios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroOp, setFiltroOp] = useState("todas");

  const [novo, setNovo] = useState(false);
  const [ops, setOps] = useState([]);
  const [carregandoOps, setCarregandoOps] = useState(false);
  const [buscaOp, setBuscaOp] = useState("");
  const [titulo, setTitulo] = useState("");
  const [opSel, setOpSel] = useState(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/relatorios");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao carregar");
      setRelatorios(d.relatorios || []);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = async () => {
    setNovo(true); setTitulo(""); setOpSel(null); setBuscaOp(""); setCarregandoOps(true);
    try { const r = await fetch("/api/relatorios/ops"); const d = await r.json(); if (r.ok) setOps(d.ops || []); } catch {}
    finally { setCarregandoOps(false); }
  };

  const criar = async () => {
    if (titulo.trim().length < 2) { showToast("Dê um título ao relatório", "error"); return; }
    setCriando(true);
    try {
      const body = { titulo, opId: opSel?.id || null, opNumero: opSel?.numero || null, cliente: opSel?.cliente || null, obra: opSel?.obra || null };
      const r = await fetch("/api/relatorios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao criar");
      router.push(`/relatorios/${d.id}`);
    } catch (e) { showToast(e.message, "error"); setCriando(false); }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este relatório?")) return;
    try {
      const r = await fetch(`/api/relatorios/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha");
      setRelatorios((p) => p.filter((x) => x.id !== id));
      showToast("Relatório excluído", "success");
    } catch (e) { showToast(e.message, "error"); }
  };

  const opsFiltradas = ops.filter((o) => {
    const q = buscaOp.trim().toLowerCase();
    if (!q) return true;
    return [o.numero, o.cliente, o.obra].filter(Boolean).some((s) => s.toLowerCase().includes(q));
  }).slice(0, 100);

  // OPs distintas presentes nos relatórios (p/ o filtro) + lista filtrada.
  const opsFiltro = [];
  const vistosOp = new Set();
  for (const r of relatorios) {
    const key = r.opNumero || "__sem__";
    if (vistosOp.has(key)) continue;
    vistosOp.add(key);
    opsFiltro.push({ key, label: r.opNumero ? `${fmtOP(r.opNumero)}${r.cliente ? " · " + r.cliente : ""}` : "Sem OP" });
  }
  const relatoriosFiltrados = filtroOp === "todas" ? relatorios : relatorios.filter((r) => (r.opNumero || "__sem__") === filtroOp);

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-2">
            <FileBarChart2 className="text-torg-blue" /> Relatórios
          </h2>
          <p className="text-sm text-torg-gray mt-1">Gere relatórios de status com fotos para apresentar ao cliente, no layout padrão Torg.</p>
        </div>
        <button onClick={abrirNovo} className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2">
          <Plus size={16} /> Novo relatório de status
        </button>
      </div>

      {carregando ? (
        <div className="py-16 text-center text-torg-gray"><Loader2 size={28} className="mx-auto animate-spin mb-2" /> Carregando...</div>
      ) : erro ? (
        <div className="py-16 text-center">
          <AlertCircle size={28} className="mx-auto text-red-400 mb-2" />
          <p className="text-sm text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="px-3 py-1.5 text-sm bg-torg-blue text-white rounded-lg inline-flex items-center gap-2"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : relatorios.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-xl border border-gray-100">
          <FileBarChart2 size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-torg-gray">Nenhum relatório ainda.</p>
          <p className="text-sm text-torg-gray mt-1">Clique em “Novo relatório de status” para começar.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-sm text-torg-gray">Filtrar por OP:</label>
            <select value={filtroOp} onChange={(e) => setFiltroOp(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-torg-blue">
              <option value="todas">Todas as OPs</option>
              {opsFiltro.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <span className="text-xs text-torg-gray">{relatoriosFiltrados.length} de {relatorios.length}</span>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3">Nº</th>
                    <th className="px-4 py-3">Relatório</th>
                    <th className="px-4 py-3">OP / Cliente</th>
                    <th className="px-4 py-3 text-center">Fotos</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Aceite</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {relatoriosFiltrados.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-torg-gray">Nenhum relatório para esta OP.</td></tr>
                  ) : relatoriosFiltrados.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono text-torg-blue font-semibold whitespace-nowrap">{r.numero ? `REL-${String(r.numero).padStart(3, "0")}` : "—"}</td>
                      <td className="px-4 py-3">
                        <Link href={`/relatorios/${r.id}`} className="font-medium text-torg-dark hover:text-torg-blue">{r.titulo}</Link>
                        <div className="text-[11px] text-torg-gray">{r.nBlocos} bloco{r.nBlocos === 1 ? "" : "s"} · {fmt(r.createdAt)}{r.criadoPorNome ? ` · ${r.criadoPorNome}` : ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-torg-dark">{r.cliente || "—"}</div>
                        <div className="text-[11px] text-torg-gray">{[fmtOP(r.opNumero), r.obra].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-center text-torg-gray whitespace-nowrap"><span className="inline-flex items-center gap-1"><Camera size={12} /> {r.nFotos}</span></td>
                      <td className="px-4 py-3 text-center"><span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ST[r.status] || "bg-gray-100 text-gray-600"}`}>{r.status}</span></td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.aceitoEm ? <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium"><CheckCircle2 size={13} /> Aceito</span>
                          : r.nEnvios > 0 ? <span className="text-xs text-amber-600">Aguardando</span>
                          : <span className="text-xs text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/relatorios/${r.id}`} className="text-xs text-torg-blue hover:underline">Abrir</Link>
                          <a href={`/api/relatorios/${r.id}/pdf`} target="_blank" rel="noreferrer" className="text-xs text-torg-dark hover:underline inline-flex items-center gap-1"><FileDown size={12} /> PDF</a>
                          <button onClick={() => excluir(r.id)} className="text-red-400 hover:text-red-600" title="Excluir"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {novo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !criando && setNovo(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-torg-dark">Novo relatório de status</h3>
              <button onClick={() => setNovo(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <label className="text-xs text-torg-gray">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="Ex.: Status de fabricação — Julho/2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 mt-1 focus:ring-2 focus:ring-torg-blue" />
            <label className="text-xs text-torg-gray">Selecionar a OP <span className="text-gray-400">(ativas — preenche cliente/obra)</span></label>
            {opSel ? (
              <div className="flex items-center justify-between border border-torg-blue-200 bg-torg-blue-50/40 rounded-lg px-3 py-2 mt-1 text-sm">
                <span className="text-torg-dark">{fmtOP(opSel.numero)} · {opSel.cliente}{opSel.obra ? " · " + opSel.obra : ""}</span>
                <button onClick={() => setOpSel(null)} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
              </div>
            ) : (
              <>
                <input value={buscaOp} onChange={(e) => setBuscaOp(e.target.value)} placeholder="Buscar OP ativa por número, cliente ou obra…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-torg-blue" />
                <div className="border border-gray-100 rounded-lg mt-1 max-h-56 overflow-y-auto divide-y divide-gray-50">
                  {carregandoOps ? (
                    <div className="px-3 py-3 text-xs text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Carregando OPs ativas…</div>
                  ) : opsFiltradas.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-torg-gray">{ops.length === 0 ? "Nenhuma OP ativa encontrada" : "Nenhuma OP bate com a busca"}</div>
                  ) : (
                    opsFiltradas.map((o) => (
                      <button key={o.id} onClick={() => { setOpSel(o); if (!titulo.trim()) setTitulo(`Status — ${o.obra || o.cliente}`); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50">
                        <span className="font-medium text-torg-dark">{fmtOP(o.numero)}</span> · {o.cliente}{o.obra ? " · " + o.obra : ""}
                      </button>
                    ))
                  )}
                </div>
                {!carregandoOps && ops.length > 0 && <p className="text-[11px] text-torg-gray mt-1">{ops.length} OP{ops.length === 1 ? "" : "s"} ativa{ops.length === 1 ? "" : "s"}.</p>}
              </>
            )}
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setNovo(false)} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
              <button onClick={criar} disabled={criando || titulo.trim().length < 2}
                className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-2 disabled:opacity-50">
                {criando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar e montar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
