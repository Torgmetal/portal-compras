"use client";
import { useState, useEffect, useMemo } from "react";
import { PackageSearch, Search, Loader2, FileSpreadsheet, CheckCircle2, Clock, AlertCircle, X, Truck, Trash2, Copy, CalendarDays, MapPin } from "lucide-react";
import { exportarListaExpedicao } from "@/lib/export-lista-expedicao";

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const LIMITE = 300;
const chave = (m) => `${m.frente}|${String(m.marca).toUpperCase()}`;

export default function ConsultaExpedicao({ opId }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const [frente, setFrente] = useState("");
  const [exportando, setExportando] = useState(false);
  const [sel, setSel] = useState({});
  const [previos, setPrevios] = useState([]);
  const [proximo, setProximo] = useState(null);
  const [modal, setModal] = useState(false);
  const [abertoPrevio, setAbertoPrevio] = useState({});

  const carregarPrevios = () => fetch(`/api/comercial/op/${opId}/romaneios-previos`).then((r) => r.json())
    .then((j) => { if (j.success) { setPrevios(j.previos || []); setProximo(j.proximoNumero); } }).catch(() => {});

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/lista-expedicao/marcas`).then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
      .catch(() => setErro("Não foi possível carregar a lista."));
    carregarPrevios();
  }, [opId]);

  const frentes = dados?.frentes || [];
  const todas = useMemo(() => frentes.flatMap((f) => f.marcas.map((m) => ({ ...m, frente: f.frente }))), [frentes]);

  const filtradas = useMemo(() => {
    const b = norm(busca);
    return todas.filter((m) => {
      if (frente && m.frente !== frente) return false;
      if (situacao === "expedidas" && m.expedido !== true) return false;
      if (situacao === "pendentes" && m.expedido === true) return false;
      if (!b) return true;
      return norm(m.marca).includes(b) || norm(m.descricao).includes(b) || norm(m.romaneio).includes(b);
    });
  }, [todas, busca, situacao, frente]);

  const contratado = frentes.reduce((s, f) => s + (f.pesoContratado || 0), 0);
  const expedido = frentes.reduce((s, f) => s + (f.pesoExpedido || 0), 0);
  const nExp = todas.filter((m) => m.expedido === true).length;
  const pesoFiltrado = filtradas.reduce((s, m) => s + (m.pesoTotal || 0), 0);
  const marcadas = useMemo(() => todas.filter((m) => sel[chave(m)]), [todas, sel]);
  const pesoSel = marcadas.reduce((s, m) => s + (m.pesoTotal || 0), 0);

  async function exportar() {
    setExportando(true); setErro("");
    try {
      const filtrando = busca.trim() || situacao !== "todas" || frente;
      await exportarListaExpedicao({
        op: dados.op, frentes,
        marcasFiltradas: filtrando ? filtradas : null,
        sufixo: filtrando ? `filtro: ${[frente, situacao !== "todas" ? situacao : null, busca.trim() ? `"${busca.trim()}"` : null].filter(Boolean).join(" / ")}` : null,
      });
    } catch (e) { setErro(e.message); } finally { setExportando(false); }
  }
  async function excluirPrevio(p) {
    if (!confirm(`Excluir o romaneio prévio ${String(p.numero).padStart(2, "0")}?`)) return;
    await fetch(`/api/comercial/op/${opId}/romaneios-previos/${p.id}`, { method: "DELETE" }).catch(() => {});
    carregarPrevios();
  }
  function copiarCronograma(p) {
    const linha = `Entrega — Romaneio prévio ${String(p.numero).padStart(2, "0")} · ${(p.itens || []).length} peças · ${fmtKg(p.pesoKg)}${p.dataPrevista ? ` · previsto ${fmtD(p.dataPrevista)}` : ""}${p.local ? ` · ${p.local}` : ""}`;
    navigator.clipboard?.writeText(linha);
  }

  const inp = "text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white";

  return (
    <div className="space-y-4">
      {/* ── consulta ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><PackageSearch size={15} className="text-torg-blue" /> Lista de expedição <span className="text-torg-gray font-normal">· consulta por peça</span></h3>
          <button onClick={exportar} disabled={exportando || !todas.length} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-40">{exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Exportar</button>
        </div>
        <p className="text-[11px] text-torg-gray mb-3">Procure uma peça pela marca e veja se já foi expedida, em qual romaneio e quando. Marque as pendentes para montar um <strong>romaneio prévio</strong>.</p>

        {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

        {dados === null && !erro ? (
          <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
        ) : !todas.length ? (
          <p className="text-sm text-torg-gray py-8 text-center">Nenhuma lista de expedição importada para esta OP ainda — importe na aba <strong>Engenharia</strong>.</p>
        ) : (<>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-3">
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Marcas</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{todas.length}</p></div>
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Expedidas</p><p className="text-lg font-extrabold text-emerald-700 tabular-nums">{nExp}</p></div>
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Pendentes</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{todas.length - nExp}</p></div>
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Peso expedido</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtKg(expedido)}</p><p className="text-[10px] text-torg-gray">de {fmtKg(contratado)}</p></div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-torg-gray" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca, descrição ou romaneio…" className={`${inp} w-full pl-7 pr-7`} />
              {busca && <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-torg-gray hover:text-torg-dark"><X size={13} /></button>}
            </div>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={inp}>
              <option value="todas">Todas</option>
              <option value="expedidas">Só expedidas</option>
              <option value="pendentes">Só pendentes</option>
            </select>
            {frentes.length > 1 && (
              <select value={frente} onChange={(e) => setFrente(e.target.value)} className={`${inp} max-w-[160px]`}>
                <option value="">Todas as frentes</option>
                {frentes.map((f) => <option key={f.frente} value={f.frente}>{f.frente}</option>)}
              </select>
            )}
            <span className="text-[11px] text-torg-gray whitespace-nowrap">{filtradas.length} de {todas.length} · {fmtKg(pesoFiltrado)}</span>
          </div>

          {/* barra de seleção */}
          {marcadas.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-2 bg-torg-blue-50/60 border border-torg-blue-200 rounded-lg px-3 py-2 text-xs">
              <span className="font-semibold text-torg-dark">{marcadas.length} peça(s) · {fmtKg(pesoSel)}</span>
              <button onClick={() => setModal(true)} className="bg-torg-blue text-white rounded-lg px-2.5 py-1 font-medium inline-flex items-center gap-1 hover:bg-torg-dark"><Truck size={12} /> Gerar romaneio prévio{proximo ? ` ${String(proximo).padStart(2, "0")}` : ""}</button>
              <button onClick={() => setSel({})} className="text-torg-gray hover:text-torg-dark ml-auto">limpar seleção</button>
            </div>
          )}

          <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[520px] overflow-y-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="text-[11px] text-torg-gray uppercase">
                  <th className="px-2 py-2 w-8"></th>
                  <th className="text-left px-3 py-2 font-medium">Marca</th>
                  <th className="text-left px-3 py-2 font-medium">Descrição</th>
                  <th className="text-right px-3 py-2 font-medium w-16">Qtd</th>
                  <th className="text-right px-3 py-2 font-medium w-24">Peso</th>
                  <th className="text-left px-3 py-2 font-medium w-28">Situação</th>
                  <th className="text-left px-3 py-2 font-medium w-24">Romaneio</th>
                  <th className="text-left px-3 py-2 font-medium w-28">Expedida em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.slice(0, LIMITE).map((m, i) => {
                  const k = chave(m);
                  return (
                    <tr key={`${k}-${i}`} className={sel[k] ? "bg-torg-blue-50/50" : m.expedido === true ? "bg-emerald-50/40" : ""}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={!!sel[k]} onChange={() => setSel((s) => { const n = { ...s }; if (n[k]) delete n[k]; else n[k] = true; return n; })} className="accent-torg-blue" />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-torg-dark whitespace-nowrap">{m.marca}</td>
                      <td className="px-3 py-1.5 text-torg-gray truncate max-w-[240px]" title={m.descricao}>{m.descricao || "—"}</td>
                      <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">{m.qte ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right text-torg-dark tabular-nums whitespace-nowrap">{fmtKg(m.pesoTotal)}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {m.expedido === true
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium inline-flex items-center gap-1"><CheckCircle2 size={10} /> expedida</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-torg-gray font-medium inline-flex items-center gap-1"><Clock size={10} /> pendente</span>}
                      </td>
                      <td className="px-3 py-1.5 text-torg-gray whitespace-nowrap">{m.romaneio || "—"}</td>
                      <td className="px-3 py-1.5 text-torg-gray whitespace-nowrap">{m.dataExpedicao ? fmtD(m.dataExpedicao) : "—"}</td>
                    </tr>
                  );
                })}
                {!filtradas.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-torg-gray">Nenhuma peça encontrada com esse filtro.</td></tr>}
              </tbody>
            </table>
          </div>
          {filtradas.length > LIMITE && (
            <p className="text-[11px] text-torg-gray mt-1.5">Mostrando as {LIMITE} primeiras de {filtradas.length} — refine a busca, ou use <strong>Exportar</strong> para levar todas (o export respeita o filtro).</p>
          )}
        </>)}
      </div>

      {/* ── romaneios prévios ── */}
      {(previos.length > 0 || todas.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5 mb-1"><Truck size={15} className="text-torg-blue" /> Romaneios prévios <span className="text-torg-gray font-normal">· prioridade de entrega</span></h3>
          <p className="text-[11px] text-torg-gray mb-3">Cargas montadas pelo Planejamento antes de a Expedição emitir o romaneio. A numeração segue a sequência do último romaneio emitido desta OP{proximo ? ` — o próximo é o ${String(proximo).padStart(2, "0")}` : ""}.</p>

          {previos.length === 0 ? (
            <p className="text-sm text-torg-gray py-4 text-center">Nenhum romaneio prévio ainda — marque as peças na lista acima e clique em <strong>Gerar romaneio prévio</strong>.</p>
          ) : (
            <div className="space-y-2">
              {previos.map((p) => {
                const ab = !!abertoPrevio[p.id];
                return (
                  <div key={p.id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono font-bold text-white bg-torg-blue rounded px-1.5 py-0.5">{String(p.numero).padStart(2, "0")}</span>
                      <span className="text-[13px] font-semibold text-torg-dark">{(p.itens || []).length} peça(s) · {fmtKg(p.pesoKg)}</span>
                      {p.dataPrevista && <span className="text-[11px] text-torg-gray inline-flex items-center gap-0.5"><CalendarDays size={11} /> {fmtD(p.dataPrevista)}</span>}
                      {p.local && <span className="text-[11px] text-torg-gray inline-flex items-center gap-0.5"><MapPin size={11} /> {p.local}</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-torg-gray font-medium">{p.status}</span>
                      <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => setAbertoPrevio((a) => ({ ...a, [p.id]: !ab }))} className="text-[12px] text-torg-blue hover:text-torg-dark font-medium">{ab ? "ocultar" : "ver"} peças</button>
                        <button onClick={() => copiarCronograma(p)} className="text-torg-gray hover:text-torg-blue" title="Copiar a linha para o cronograma"><Copy size={13} /></button>
                        <button onClick={() => excluirPrevio(p)} className="text-torg-gray hover:text-red-600" title="Excluir"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {/* prévia do que iria pro cronograma — ainda NÃO escreve lá */}
                    <div className="px-3 py-2 bg-amber-50/50 border-t border-amber-100">
                      <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide mb-0.5">Para o cronograma (ainda não lançado)</p>
                      <p className="text-[12px] text-torg-dark font-mono">Entrega — Romaneio prévio {String(p.numero).padStart(2, "0")} · {(p.itens || []).length} peças · {fmtKg(p.pesoKg)}{p.dataPrevista ? ` · previsto ${fmtD(p.dataPrevista)}` : ""}{p.local ? ` · ${p.local}` : ""}</p>
                    </div>
                    {ab && (
                      <div className="max-h-56 overflow-y-auto border-t border-gray-100">
                        <table className="w-full text-[12px]">
                          <thead className="bg-white sticky top-0 text-torg-gray"><tr>
                            <th className="text-left px-3 py-1 font-medium">Marca</th>
                            <th className="text-left px-3 py-1 font-medium">Descrição</th>
                            <th className="text-right px-3 py-1 font-medium w-16">Qtd</th>
                            <th className="text-right px-3 py-1 font-medium w-24">Peso</th>
                          </tr></thead>
                          <tbody className="divide-y divide-gray-50">
                            {(p.itens || []).map((it, i) => (
                              <tr key={i}>
                                <td className="px-3 py-1 font-mono text-torg-dark">{it.marca}</td>
                                <td className="px-3 py-1 text-torg-gray truncate max-w-[240px]">{it.descricao || "—"}</td>
                                <td className="px-3 py-1 text-right text-torg-gray tabular-nums">{it.qte ?? "—"}</td>
                                <td className="px-3 py-1 text-right text-torg-gray tabular-nums whitespace-nowrap">{fmtKg(it.pesoTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modal && (
        <NovoPrevioModal
          opId={opId} numero={proximo} itens={marcadas} peso={pesoSel}
          onClose={() => setModal(false)}
          onCriado={() => { setModal(false); setSel({}); carregarPrevios(); }}
        />
      )}
    </div>
  );
}

function NovoPrevioModal({ opId, numero, itens, peso, onClose, onCriado }) {
  const [f, setF] = useState({ dataPrevista: "", local: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/romaneios-previos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: itens.map((m) => ({ frente: m.frente, marca: m.marca, descricao: m.descricao, qte: m.qte, pesoTotal: m.pesoTotal })),
          dataPrevista: f.dataPrevista || null, local: f.local.trim() || null, observacao: f.observacao.trim() || null,
        }),
      });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onCriado();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><Truck size={15} className="text-torg-blue" /> Romaneio prévio {numero ? String(numero).padStart(2, "0") : ""}</h3>
            <p className="text-[11px] text-torg-gray mt-0.5">{itens.length} peça(s) · {fmtKg(peso)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data prevista de entrega</label>
            <input type="date" value={f.dataPrevista} onChange={(e) => setF((v) => ({ ...v, dataPrevista: e.target.value }))} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Local de entrega</label>
            <input value={f.local} onChange={(e) => setF((v) => ({ ...v, local: e.target.value }))} placeholder="Ex: Obra SP — Galpão A" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <input value={f.observacao} onChange={(e) => setF((v) => ({ ...v, observacao: e.target.value }))} placeholder="Opcional" className={inp} />
          </div>
          <p className="text-[11px] text-torg-gray">A numeração continua a sequência do último romaneio emitido desta OP. Nada é lançado no cronograma — a linha fica disponível para você copiar e avaliar.</p>
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando && <Loader2 size={14} className="animate-spin" />} Gerar</button>
        </div>
      </div>
    </div>
  );
}
