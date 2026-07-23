"use client";
import { useState, useEffect, useMemo } from "react";
import { PackageSearch, Search, Loader2, FileSpreadsheet, CheckCircle2, Clock, AlertCircle, X } from "lucide-react";
import { exportarListaExpedicao } from "@/lib/export-lista-expedicao";

const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const LIMITE = 300; // quantas linhas desenhar de uma vez (a busca estreita o resto)

export default function ConsultaExpedicao({ opId }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("todas"); // todas | expedidas | pendentes
  const [frente, setFrente] = useState("");
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/lista-expedicao/marcas`).then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else setErro(j.error || "Erro ao carregar"); })
      .catch(() => setErro("Não foi possível carregar a lista."));
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

  const inp = "text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white";

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><PackageSearch size={15} className="text-torg-blue" /> Lista de expedição <span className="text-torg-gray font-normal">· consulta por peça</span></h3>
        <button onClick={exportar} disabled={exportando || !todas.length} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-40">{exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Exportar</button>
      </div>
      <p className="text-[11px] text-torg-gray mb-3">Procure uma peça pela marca e veja se já foi expedida, em qual romaneio e quando. O “Expedido” vem dos romaneios emitidos.</p>

      {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      {dados === null && !erro ? (
        <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : !todas.length ? (
        <p className="text-sm text-torg-gray py-8 text-center">Nenhuma lista de expedição importada para esta OP ainda — importe na aba <strong>Engenharia</strong>.</p>
      ) : (<>
        {/* resumo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-3">
          <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Marcas</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{todas.length}</p></div>
          <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Expedidas</p><p className="text-lg font-extrabold text-emerald-700 tabular-nums">{nExp}</p></div>
          <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Pendentes</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{todas.length - nExp}</p></div>
          <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Peso expedido</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtKg(expedido)}</p><p className="text-[10px] text-torg-gray">de {fmtKg(contratado)}</p></div>
        </div>

        {/* filtros */}
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

        {/* tabela */}
        <div className="overflow-x-auto border border-gray-100 rounded-lg max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-[11px] text-torg-gray uppercase">
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
              {filtradas.slice(0, LIMITE).map((m, i) => (
                <tr key={`${m.frente}-${m.marca}-${i}`} className={m.expedido === true ? "bg-emerald-50/40" : ""}>
                  <td className="px-3 py-1.5 font-mono text-torg-dark whitespace-nowrap">{m.marca}</td>
                  <td className="px-3 py-1.5 text-torg-gray truncate max-w-[260px]" title={m.descricao}>{m.descricao || "—"}</td>
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
              ))}
              {!filtradas.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-torg-gray">Nenhuma peça encontrada com esse filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        {filtradas.length > LIMITE && (
          <p className="text-[11px] text-torg-gray mt-1.5">Mostrando as {LIMITE} primeiras de {filtradas.length} — refine a busca, ou use <strong>Exportar</strong> para levar todas (o export respeita o filtro).</p>
        )}
      </>)}
    </div>
  );
}
