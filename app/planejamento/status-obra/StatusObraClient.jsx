"use client";
import { useEffect, useState } from "react";
import { Loader2, AlertCircle, RefreshCw, Search, X, PackageCheck, Download, CloudDownload, Building2, FileSpreadsheet } from "lucide-react";

const fmtKg = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtDataHora = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const pct = (e, t) => (t > 0 ? Math.min(100, Math.round((e / t) * 100)) : 0);

export default function StatusObraClient() {
  const [listas, setListas] = useState(null);
  const [erro, setErro] = useState("");
  const [opInput, setOpInput] = useState("");
  const [importando, setImportando] = useState("");
  const [msg, setMsg] = useState("");
  const [descobertas, setDescobertas] = useState(null);
  const [descobrindo, setDescobrindo] = useState(false);
  const [detalhe, setDetalhe] = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setErro("");
    try {
      const r = await fetch("/api/planejamento/status-obra");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setListas(j.listas || []);
    } catch (e) { setErro(e.message); }
  }

  async function importar(op) {
    const numero = String(op || "").replace(/\D/g, "");
    if (!numero) { setErro("Informe o número da OP."); return; }
    setImportando(numero); setErro(""); setMsg("");
    try {
      const r = await fetch("/api/planejamento/status-obra/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: numero }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || "Erro ao importar");
      const oks = (j.resultados || []).filter((x) => x.ok);
      setMsg(`OP-${numero}: ${oks.length} frente(s) importada(s) — ${oks.map((x) => `${x.frente} (${x.marcas} marcas)`).join(", ")}`);
      await carregar();
    } catch (e) { setErro(e.message); } finally { setImportando(""); }
  }

  async function descobrir() {
    setDescobrindo(true); setErro("");
    try {
      const r = await fetch("/api/planejamento/status-obra?descobrir=1");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao varrer SharePoint");
      setDescobertas(j.opsComLista || []);
    } catch (e) { setErro(e.message); } finally { setDescobrindo(false); }
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2"><PackageCheck size={20} className="text-torg-blue" /> Status da obra — Listas de Expedição</h1>
        <p className="text-[12px] text-torg-gray mt-0.5">Importa a "Lista Avançada Expedição" da pasta da OP no SharePoint e mostra previsto × expedido × faltante por frente.</p>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-torg-gray">Importar OP:</span>
        <input value={opInput} onChange={(e) => setOpInput(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") importar(opInput); }} placeholder="ex: 67" className="w-24 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:border-torg-blue outline-none" />
        <button onClick={() => importar(opInput)} disabled={!!importando} className="text-sm font-semibold text-white bg-torg-blue rounded-lg px-4 py-1.5 hover:bg-torg-dark disabled:opacity-50 inline-flex items-center gap-1.5">
          {importando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Importar
        </button>
        <button onClick={descobrir} disabled={descobrindo} className="ml-auto text-sm text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5 border border-torg-blue/30 rounded-lg px-3 py-1.5 disabled:opacity-50">
          {descobrindo ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />} Descobrir listas no SharePoint
        </button>
        <button onClick={carregar} className="p-1.5 text-torg-gray hover:text-torg-blue rounded-lg hover:bg-gray-100" title="Atualizar"><RefreshCw size={15} /></button>
      </div>

      {erro && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm"><AlertCircle size={18} /> {erro}<button onClick={() => setErro("")} className="ml-auto"><X size={14} /></button></div>}
      {msg && <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-[13px]"><PackageCheck size={16} /> {msg}<button onClick={() => setMsg("")} className="ml-auto"><X size={14} /></button></div>}

      {/* Catálogo descoberto no SharePoint */}
      {descobertas && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-torg-dark">Listas encontradas no SharePoint ({descobertas.length} OP)</h2>
            <button onClick={() => setDescobertas(null)} className="text-[12px] text-torg-gray hover:text-torg-dark">fechar</button>
          </div>
          {descobertas.length === 0 ? (
            <p className="text-[12px] text-torg-gray italic">Nenhuma "Lista Avançada Expedição" encontrada nas pastas 4. Expedição.</p>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {descobertas.map((o) => (
                <div key={o.folder} className="flex items-center gap-2 text-[12px] border border-gray-100 rounded-lg px-3 py-2">
                  <span className="font-semibold text-torg-dark">OP-{o.op}</span>
                  {o.finalizada && <span className="text-[9px] bg-gray-100 text-torg-gray rounded px-1.5 py-0.5">finalizada</span>}
                  <span className="text-torg-gray truncate flex-1" title={o.folder}>{o.arquivos.map((a) => a.frente || a.name).join(", ")}</span>
                  <button onClick={() => importar(o.op)} disabled={!!importando} className="text-[11px] font-semibold text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 disabled:opacity-50">
                    {importando === String(o.op).replace(/^0+/, "") ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} importar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Listas importadas */}
      {listas === null ? (
        <div className="text-center py-12 text-torg-gray text-sm"><Loader2 size={20} className="animate-spin mx-auto mb-2" /> Carregando…</div>
      ) : listas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <FileSpreadsheet size={30} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-torg-gray">Nenhuma lista importada ainda. Informe uma OP acima ou use "Descobrir listas".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {listas.map((l) => {
            const p = pct(l.pesoExpedido, l.pesoContratado);
            return (
              <button key={l.id} onClick={() => setDetalhe(l.id)} className="text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-torg-blue/40 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-torg-dark flex items-center gap-1.5"><Building2 size={14} className="text-torg-blue" /> {l.frente}</span>
                  <span className="text-[10px] text-torg-gray">{l.marcas} marcas · {l.qtdItens} itens</span>
                </div>
                <p className="text-[11px] text-torg-gray mt-0.5 truncate" title={l.arquivo}>{l.arquivo}{l.revisao ? ` · rev ${l.revisao}` : ""}</p>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${p}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px]">
                  <span className="text-emerald-700 font-semibold">{p}% expedido</span>
                  <span className="text-torg-gray">{fmtKg(l.pesoExpedido)} / {fmtKg(l.pesoContratado)}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-[10px] text-torg-gray">
                  <span>Faltam <b className="text-torg-orange">{fmtKg(l.pesoFaltante)}</b></span>
                  <span>importada {fmtDataHora(l.importadoEm)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detalhe && <DetalheLista id={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

function DetalheLista({ id, onClose }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`/api/planejamento/status-obra/${id}`).then((r) => r.json()).then((j) => { if (j.lista) setLista(j.lista); else setErro(j.error || "Erro"); }).catch((e) => setErro(e.message));
  }, [id]);

  const marcas = lista?.marcasJson || [];
  const termo = q.trim().toLowerCase();
  const filtradas = termo ? marcas.filter((m) => String(m.marca).toLowerCase().includes(termo) || String(m.descricao || "").toLowerCase().includes(termo)) : marcas;
  const mostradas = filtradas.slice(0, 800);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-torg-dark flex items-center gap-2"><Building2 size={16} className="text-torg-blue" /> {lista?.frente || "…"}</h3>
            {lista && <p className="text-[11px] text-torg-gray mt-0.5">{lista.arquivo} · {lista.marcas} marcas · contratado {fmtKg(lista.pesoContratado)} · expedido {fmtKg(lista.pesoExpedido)} · falta {fmtKg(lista.pesoFaltante)}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {erro ? (
          <div className="p-6 text-sm text-red-600">{erro}</div>
        ) : !lista ? (
          <div className="p-10 text-center text-torg-gray text-sm"><Loader2 size={18} className="animate-spin mx-auto mb-2" /> Carregando marcas…</div>
        ) : (
          <>
            <div className="px-5 py-2 border-b border-gray-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-torg-gray" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="filtrar por marca ou descrição…" className="w-full text-[13px] border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 focus:border-torg-blue outline-none" />
              </div>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold text-torg-gray uppercase">Marca</th>
                    <th className="px-3 py-2 text-left text-[10px] font-semibold text-torg-gray uppercase">Descrição</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Qte</th>
                    <th className="px-3 py-2 text-right text-[10px] font-semibold text-torg-gray uppercase">Peso</th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold text-torg-gray uppercase">Exp.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mostradas.map((m, i) => (
                    <tr key={i} className={m.expedidoArquivo ? "bg-emerald-50/30" : ""}>
                      <td className="px-4 py-1.5 font-mono text-[12px] text-torg-dark">{m.marca}</td>
                      <td className="px-3 py-1.5 text-[12px] text-torg-gray truncate max-w-[260px]" title={m.descricao}>{(m.descricao || "").trim()}</td>
                      <td className="px-3 py-1.5 text-center text-[12px]">{m.qte}</td>
                      <td className="px-3 py-1.5 text-right text-[12px] tabular-nums">{fmtKg(m.pesoTotal)}</td>
                      <td className="px-3 py-1.5 text-center">{m.expedidoArquivo ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length > 800 && <p className="text-[11px] text-torg-gray text-center py-2">mostrando 800 de {filtradas.length} — refine o filtro</p>}
              {filtradas.length === 0 && <p className="text-[12px] text-torg-gray text-center py-6">nenhuma marca encontrada</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
