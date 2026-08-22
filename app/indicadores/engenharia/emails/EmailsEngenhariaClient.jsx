"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import { Mail, Loader2, AlertCircle, RefreshCw, Search, Paperclip, FileBox, Inbox, Send, ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react";

const fmtDT = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const caixaCurta = (c) => String(c || "").split("@")[0];

export default function EmailsEngenhariaClient() {
  const { showToast } = useStore();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);
  const [caixa, setCaixa] = useState("");
  const [direcao, setDirecao] = useState("");
  const [soIfc, setSoIfc] = useState(false);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(() => {
    setErro("");
    const p = new URLSearchParams();
    if (caixa) p.set("caixa", caixa);
    if (direcao) p.set("direcao", direcao);
    if (soIfc) p.set("ifc", "1");
    if (busca.trim()) p.set("busca", busca.trim());
    fetch(`/api/engenharia/emails?${p}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setDados(j); else { setDados({ eventos: [], syncs: [], total: 0 }); setErro(j.error || "Erro"); } })
      .catch(() => { setDados({ eventos: [], syncs: [], total: 0 }); setErro("Erro ao carregar"); });
  }, [caixa, direcao, soIfc, busca]);
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar]);

  async function sincronizar() {
    setSincronizando(true); setErro("");
    try {
      const res = await fetch("/api/engenharia/emails", { method: "POST" });
      const txt = await res.text();
      let j;
      try { j = JSON.parse(txt); } catch { throw new Error(res.status === 504 || /timeout/i.test(txt) ? "A sincronização demorou demais (timeout) — já puxou um bloco; clique de novo pra continuar." : `Resposta inesperada do servidor (${res.status}).`); }
      if (!j.success) throw new Error(j.error || "Erro");
      const msg = j.pendente
        ? `Bloco sincronizado — ${j.gravados} e-mail(s). Ainda há histórico: clique "Sincronizar agora" de novo pra continuar.`
        : `Sincronizado — ${j.gravados} e-mail(s) novo(s)/atualizado(s).`;
      showToast(msg, j.pendente ? "info" : "success");
      carregar();
    } catch (e) { setErro(e.message); showToast(e.message, "erro"); }
    finally { setSincronizando(false); }
  }

  async function reprocessar() {
    if (!confirm("Reprocessar TODO o histórico? Re-vincula os e-mails às OPs (regras novas + thread) e reclassifica as tags com IA. Pode levar 1–2 min.")) return;
    setReprocessando(true); setErro("");
    try {
      const res = await fetch("/api/engenharia/emails?reprocessar=1", { method: "POST" });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || "Erro");
      const rm = j.rematch || {}; const ia = j.ia || {};
      showToast(`Reprocessado — ${rm.recasados ?? 0} re-vinculados, ${rm.propagados ?? 0} pela thread, ${ia.marcos ?? 0} tags pela IA.`, "success");
      carregar();
    } catch (e) { setErro(e.message); showToast(e.message, "erro"); }
    finally { setReprocessando(false); }
  }

  const eventos = dados?.eventos || [];
  const syncs = dados?.syncs || [];
  const caixas = dados?.caixas || [];
  const resumoSync = useMemo(() => {
    const porCaixa = {};
    for (const s of syncs) {
      porCaixa[s.caixa] = porCaixa[s.caixa] || { total: 0, ultimo: null, erro: null };
      porCaixa[s.caixa].total += s.totalEventos || 0;
      const dt = s.ultimoEm ? new Date(s.ultimoEm) : null;
      if (dt && (!porCaixa[s.caixa].ultimo || dt > porCaixa[s.caixa].ultimo)) porCaixa[s.caixa].ultimo = dt;
      if (s.ultimoErro) porCaixa[s.caixa].erro = s.ultimoErro;
    }
    return porCaixa;
  }, [syncs]);

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 text-blue-700"><Mail size={22} /></span>
          <div>
            <h1 className="text-2xl font-bold text-torg-dark">E-mails da Engenharia <span className="text-[11px] align-middle font-semibold text-white bg-torg-orange rounded px-1.5 py-0.5">beta</span></h1>
            <p className="text-sm text-torg-gray">Fase 1 — leitura das 6 caixas da Engenharia (só validação; o vínculo com a OP e o SLA vêm depois).</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reprocessar} disabled={reprocessando || sincronizando}
            className="px-4 py-2 bg-white text-torg-blue border border-torg-blue-200 text-sm rounded-lg hover:bg-torg-blue-50 font-medium flex items-center gap-2 disabled:opacity-50" title="Re-vincula às OPs e reclassifica as tags com IA (histórico todo)">
            {reprocessando ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Reprocessar com IA
          </button>
          <button onClick={sincronizar} disabled={sincronizando || reprocessando}
            className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium flex items-center gap-2 disabled:opacity-50">
            {sincronizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sincronizar agora
          </button>
        </div>
      </div>

      {/* Status por caixa */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {caixas.map((c) => {
          const r = resumoSync[c];
          return (
            <button key={c} onClick={() => setCaixa(caixa === c ? "" : c)}
              className={`text-left bg-white rounded-xl border p-3 transition-colors ${caixa === c ? "border-torg-blue ring-1 ring-torg-blue" : "border-gray-100 hover:border-torg-blue-100"}`}>
              <p className="text-sm font-semibold text-torg-dark truncate">{caixaCurta(c)}</p>
              <p className="text-[11px] text-torg-gray truncate">{c}</p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                <span className="text-torg-dark font-semibold tabular-nums">{r?.total ?? 0}</span>
                <span className="text-torg-gray">e-mails</span>
                {r?.erro ? <span className="ml-auto text-red-600 inline-flex items-center gap-1"><AlertCircle size={11} /> erro</span>
                  : <span className="ml-auto text-torg-gray">{r?.ultimo ? fmtDT(r.ultimo) : "nunca sincronizado"}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          {[["", "Todas"], ["ENTRADA", "Entradas"], ["SAIDA", "Saídas"]].map(([v, l]) => (
            <button key={v} onClick={() => setDirecao(v)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${direcao === v ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"}`}>{l}</button>
          ))}
        </div>
        <button onClick={() => setSoIfc((s) => !s)}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium border inline-flex items-center gap-1 ${soIfc ? "bg-torg-orange text-white border-torg-orange" : "bg-white text-torg-gray border-gray-200 hover:border-torg-orange"}`}>
          <FileBox size={13} /> Só com IFC
        </button>
        {caixa && <button onClick={() => setCaixa("")} className="text-xs text-torg-blue hover:underline">limpar caixa: {caixaCurta(caixa)} ✕</button>}
        <div className="relative ml-auto min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar assunto ou remetente…" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {dados === null ? (
          <p className="px-6 py-10 text-sm text-torg-gray text-center inline-flex items-center gap-2 justify-center w-full"><Loader2 size={16} className="animate-spin" /> Carregando…</p>
        ) : erro ? (
          <div className="px-6 py-10 text-center"><AlertCircle size={22} className="mx-auto text-red-400 mb-2" /><p className="text-sm text-red-600 mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>
        ) : eventos.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Inbox size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-torg-dark">Nenhum e-mail lido ainda</p>
            <p className="text-xs text-torg-gray mt-1">Clique em <strong>“Sincronizar agora”</strong>. Se a permissão do Graph acabou de propagar, pode levar alguns minutos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50/60"><tr className="text-[11px] text-gray-500 uppercase">
                <th className="px-3 py-2 text-left font-medium">Dir.</th>
                <th className="px-3 py-2 text-left font-medium">Caixa</th>
                <th className="px-3 py-2 text-left font-medium">De / Para</th>
                <th className="px-3 py-2 text-left font-medium">Assunto</th>
                <th className="px-3 py-2 text-left font-medium">Data</th>
                <th className="px-3 py-2 text-center font-medium">Anexo</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {eventos.map((e) => {
                  const entrada = e.direcao === "ENTRADA";
                  const contraparte = entrada ? e.de : (Array.isArray(e.para) ? e.para[0] : null);
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/60 align-top">
                      <td className="px-3 py-2">
                        {entrada
                          ? <span title="Entrada" className="inline-flex items-center gap-1 text-[10px] text-emerald-700"><ArrowDownLeft size={13} /> ent</span>
                          : <span title="Saída" className="inline-flex items-center gap-1 text-[10px] text-torg-blue"><ArrowUpRight size={13} /> saí</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">{caixaCurta(e.caixa)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-torg-dark">{e.deNome || contraparte || "—"}</span>
                        {contraparte && <span className="block text-[11px] text-torg-gray truncate max-w-[200px]">{contraparte}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-torg-dark">{e.assunto || <span className="text-gray-400 italic">(sem assunto)</span>}</span>
                        {e.snippet && <span className="block text-[11px] text-torg-gray truncate max-w-[420px]">{e.snippet}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-torg-gray whitespace-nowrap">{fmtDT(e.recebidoEm || e.enviadoEm)}</td>
                      <td className="px-3 py-2 text-center">
                        {e.temAnexoIfc ? <span title="Tem anexo IFC" className="inline-flex items-center gap-1 text-[10px] font-semibold text-torg-orange"><FileBox size={13} /> IFC</span>
                          : e.temAnexo ? <Paperclip size={13} className="inline text-torg-gray" title="Tem anexo" />
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {eventos.length > 0 && <p className="px-4 py-2 text-[11px] text-torg-gray border-t border-gray-50">Mostrando {eventos.length} de {dados.total} · Fase 1 (validação). O vínculo automático com a OP + SLA vêm na Fase 2.</p>}
      </div>
    </div>
  );
}
