"use client";
import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Truck, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Loader2, X, Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";

const fmtKg = (n) => (n == null ? null : `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`);
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const _norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// ── parse da planilha (no navegador) ──────────────────────────────────────────
function detectCols(keys) {
  const find = (tests) => keys.find((k) => { const n = _norm(k); return tests.some((t) => n.includes(t)); });
  return {
    nome: find(["lote", "nome", "identif", "marca", "descri", "conjunto", "item", "frente", "pacote"]) || keys[0],
    local: find(["local", "destino", "endere", "cidade"]),
    ordem: find(["priorid", "ordem", "sequ", "seq"]),
    data: find(["data", "prazo", "previs"]),
    peso: find(["peso", "kg", "massa"]),
    obs: find(["observ", "obs", "nota", "coment"]),
  };
}
function parseNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isNaN(v) ? null : v;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function parseData(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : null;
}
async function parsePlanilha(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const objs = XLSX.utils.sheet_to_json(sheet, { defval: null, blankrows: false });
  if (!objs.length) return [];
  const col = detectCols(Object.keys(objs[0]));
  const out = [];
  for (const o of objs) {
    const nomeStr = col.nome && o[col.nome] != null ? String(o[col.nome]).trim() : "";
    if (!nomeStr) continue;
    out.push({
      nome: nomeStr.slice(0, 200),
      local: col.local && o[col.local] != null ? String(o[col.local]).trim().slice(0, 300) : null,
      dataPrevista: col.data ? parseData(o[col.data]) : null,
      pesoKg: col.peso ? parseNum(o[col.peso]) : null,
      observacao: col.obs && o[col.obs] != null ? String(o[col.obs]).trim().slice(0, 1000) : null,
      _ordem: col.ordem ? parseNum(o[col.ordem]) : null,
    });
  }
  if (out.some((r) => r._ordem != null)) out.sort((a, b) => (a._ordem ?? 9999) - (b._ordem ?? 9999));
  return out.map(({ _ordem, ...r }) => r);
}
function baixarModelo() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Lote", "Local de entrega", "Prioridade", "Data prevista", "Peso (kg)", "Observação"],
    ["Lote 1 — Pilares", "Obra SP — Galpão A", 1, "", "", "Pesos a definir pela Engenharia"],
    ["Lote 2 — Vigas", "Obra SP — Galpão B", 2, "", "", ""],
  ]);
  ws["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 11 }, { wch: 14 }, { wch: 11 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lotes de entrega");
  XLSX.writeFile(wb, "modelo-lotes-entrega.xlsx");
}

// ── componente ────────────────────────────────────────────────────────────────
export default function AbaExpedicao({ opId, proposta = null }) {
  const [lotes, setLotes] = useState(null);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(null); // { lote } (novo = {})
  const [importOpen, setImportOpen] = useState(false);

  const carregar = () => fetch(`/api/comercial/op/${opId}/lotes-expedicao`).then((r) => r.json())
    .then((j) => { if (j.success) setLotes(j.lotes); else setErro(j.error || "Erro"); }).catch(() => setErro("Erro ao carregar"));
  useEffect(() => { carregar(); }, [opId]);

  async function excluir(l) {
    if (!confirm(`Excluir o lote "${l.nome}"?`)) return;
    const r = await fetch(`/api/comercial/op/${opId}/lotes-expedicao/${l.id}`, { method: "DELETE" });
    const j = await r.json(); if (j.success) carregar(); else alert(j.error);
  }
  async function mover(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= lotes.length) return;
    const novo = [...lotes];
    [novo[idx], novo[j]] = [novo[j], novo[idx]];
    setLotes(novo);
    await fetch(`/api/comercial/op/${opId}/lotes-expedicao/reordenar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem: novo.map((l) => l.id) }) }).catch(() => {});
    carregar();
  }

  const totalPeso = (lotes || []).reduce((s, l) => s + (l.pesoKg || 0), 0);
  const semPeso = (lotes || []).filter((l) => l.pesoKg == null).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Truck size={18} className="text-torg-blue" /> Lotes de entrega</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={baixarModelo} className="text-xs text-torg-gray hover:text-torg-blue inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-50"><Download size={13} /> Modelo</button>
            <button onClick={() => setImportOpen(true)} className="text-xs border border-torg-blue text-torg-blue rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-blue-50"><Upload size={13} /> Importar planilha</button>
            <button onClick={() => setModal({})} className="text-xs bg-torg-blue text-white rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-dark"><Plus size={13} /> Adicionar lote</button>
          </div>
        </div>
        <p className="text-sm text-torg-gray mb-4">Prioridades e locais de entrega da obra. Os <strong>pesos entram depois</strong>, quando a Engenharia gera a lista final de expedição.</p>
        {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

        {lotes === null ? (
          <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
        ) : lotes.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg py-10 text-center">
            <Truck size={26} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-torg-dark">Nenhum lote de entrega ainda</p>
            <p className="text-xs text-torg-gray mt-1 max-w-md mx-auto">Importe uma planilha (prioridade, local e — se já tiver — peso) ou adicione os lotes manualmente. Dá pra refinar depois.</p>
          </div>
        ) : (<>
          <div className="grid grid-cols-3 gap-px bg-gray-100 border border-gray-100 rounded-lg overflow-hidden mb-3">
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Lotes</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{lotes.length}</p></div>
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Peso definido</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtKg(totalPeso) || "0 kg"}</p></div>
            <div className="bg-white p-3"><p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-0.5">Sem peso</p><p className="text-lg font-extrabold text-torg-dark tabular-nums">{semPeso}</p></div>
          </div>
          <div className="overflow-x-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-gray-50">
                <tr className="text-[11px] text-torg-gray uppercase">
                  <th className="text-left px-2 py-2 font-medium w-16">Prior.</th>
                  <th className="text-left px-3 py-2 font-medium">Lote</th>
                  <th className="text-left px-3 py-2 font-medium">Local de entrega</th>
                  <th className="text-left px-3 py-2 font-medium w-28">Data prev.</th>
                  <th className="text-right px-3 py-2 font-medium w-28">Peso</th>
                  <th className="px-2 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lotes.map((l, i) => (
                  <tr key={l.id} className="hover:bg-gray-50/60 align-middle">
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-mono font-semibold text-torg-blue tabular-nums w-5 text-center">{i + 1}</span>
                        <div className="flex flex-col">
                          <button onClick={() => mover(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-torg-blue disabled:opacity-30 leading-none"><ChevronUp size={13} /></button>
                          <button onClick={() => mover(i, 1)} disabled={i === lotes.length - 1} className="text-gray-300 hover:text-torg-blue disabled:opacity-30 leading-none"><ChevronDown size={13} /></button>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-torg-dark font-medium">{l.nome}{l.observacao && <span className="block text-[11px] text-torg-gray font-normal">{l.observacao}</span>}</td>
                    <td className="px-3 py-2 text-torg-gray">{l.local || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{l.dataPrevista ? fmtD(l.dataPrevista) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{l.pesoKg != null ? <span className="text-torg-dark tabular-nums">{fmtKg(l.pesoKg)}</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">a definir</span>}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setModal({ lote: l })} className="text-torg-gray hover:text-torg-blue" title="Editar"><Pencil size={14} /></button>
                        <button onClick={() => excluir(l)} className="text-torg-gray hover:text-red-600" title="Excluir"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {semPeso > 0 && <p className="text-[11px] text-torg-gray mt-2">{semPeso} lote{semPeso === 1 ? "" : "s"} ainda sem peso — normal nesta fase; entram com a lista final da Engenharia.</p>}
        </>)}
      </div>

      {/* Plano da proposta de serviço (referência, se houver) */}
      {proposta?.id && Array.isArray(proposta.lotes) && proposta.lotes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h4 className="text-sm font-semibold text-torg-dark flex items-center gap-2"><Truck size={15} className="text-torg-gray" /> Plano de entrega da proposta {proposta.numero ? `OS-${String(proposta.numero).padStart(3, "0")}` : ""} <span className="text-torg-gray font-normal">(referência)</span></h4>
            <a href={`/api/comercial/orcamento-servico/${proposta.id}/lotes-pdf`} className="px-3 py-1.5 bg-torg-blue text-white text-xs rounded-lg font-medium inline-flex items-center gap-1.5 hover:bg-torg-dark">Plano de Entregas (PDF)</a>
          </div>
          <div className="space-y-2">
            {proposta.lotes.map((lote, i) => (
              <div key={lote.id || i} className="border border-gray-100 rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium text-torg-dark">{lote.nome || `Lote ${i + 1}`}</span>
                <span className="text-xs text-torg-gray">{[lote.local && `Local: ${lote.local}`, lote.data && `Entrega: ${lote.data}`, `${(lote.itens || []).length} item(ns)`].filter(Boolean).join(" · ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && <LoteModal opId={opId} lote={modal.lote} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar(); }} />}
      {importOpen && <ImportarModal opId={opId} temLotes={(lotes || []).length > 0} onClose={() => setImportOpen(false)} onImportado={() => { setImportOpen(false); carregar(); }} />}
    </div>
  );
}

// ── modal add/editar ─────────────────────────────────────────────────────────
function LoteModal({ opId, lote, onClose, onSaved }) {
  const edit = !!lote?.id;
  const [f, setF] = useState({
    nome: lote?.nome || "",
    local: lote?.local || "",
    dataPrevista: lote?.dataPrevista ? String(lote.dataPrevista).slice(0, 10) : "",
    pesoKg: lote?.pesoKg != null ? String(lote.pesoKg) : "",
    observacao: lote?.observacao || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

  async function salvar() {
    if (!f.nome.trim()) return setErro("Informe o nome/identificação do lote.");
    setErro(""); setSalvando(true);
    const pesoNum = f.pesoKg.trim() === "" ? null : parseFloat(String(f.pesoKg).replace(",", "."));
    const payload = {
      nome: f.nome.trim(), local: f.local.trim() || null,
      dataPrevista: f.dataPrevista || null,
      pesoKg: pesoNum != null && !isNaN(pesoNum) ? pesoNum : null,
      observacao: f.observacao.trim() || null,
    };
    try {
      const url = edit ? `/api/comercial/op/${opId}/lotes-expedicao/${lote.id}` : `/api/comercial/op/${opId}/lotes-expedicao`;
      const r = await fetch(url, { method: edit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onSaved();
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark">{edit ? "Editar lote" : "Novo lote de entrega"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Lote / identificação *</label>
            <input value={f.nome} onChange={(e) => setF((v) => ({ ...v, nome: e.target.value }))} placeholder="Ex: Lote 1 — Pilares" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Local de entrega</label>
            <input value={f.local} onChange={(e) => setF((v) => ({ ...v, local: e.target.value }))} placeholder="Ex: Obra SP — Galpão A" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Data prevista</label>
              <input type="date" value={f.dataPrevista} onChange={(e) => setF((v) => ({ ...v, dataPrevista: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-torg-dark mb-1">Peso (kg) <span className="text-torg-gray font-normal">— opcional</span></label>
              <input value={f.pesoKg} onChange={(e) => setF((v) => ({ ...v, pesoKg: e.target.value }))} placeholder="a definir" inputMode="decimal" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <input value={f.observacao} onChange={(e) => setF((v) => ({ ...v, observacao: e.target.value }))} placeholder="Opcional" className={inp} />
          </div>
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando && <Loader2 size={14} className="animate-spin" />} Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ── modal importar (parse no navegador + prévia) ──────────────────────────────
function ImportarModal({ opId, temLotes, onClose, onImportado }) {
  const [linhas, setLinhas] = useState(null);
  const [arquivo, setArquivo] = useState("");
  const [parsing, setParsing] = useState(false);
  const [substituir, setSubstituir] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");
  const fileRef = useRef(null);

  async function escolher(file) {
    if (!file) return;
    setErro(""); setParsing(true); setArquivo(file.name);
    try {
      const rows = await parsePlanilha(file);
      if (!rows.length) throw new Error("Não achei lotes na planilha. Confira se a 1ª linha tem os títulos das colunas (ex.: Lote, Local, Prioridade…).");
      setLinhas(rows);
    } catch (e) { setErro(e.message); setLinhas(null); } finally { setParsing(false); }
  }
  async function importar() {
    setImportando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/lotes-expedicao/importar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotes: linhas, substituir }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onImportado();
    } catch (e) { setErro(e.message); setImportando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><Upload size={15} className="text-torg-blue" /> Importar lotes de planilha</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={parsing} className="text-sm border border-torg-blue text-torg-blue rounded-lg px-3 py-1.5 font-medium inline-flex items-center gap-1.5 hover:bg-torg-blue-50 disabled:opacity-50">{parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Escolher arquivo</button>
            {arquivo && <span className="text-xs text-torg-gray truncate">{arquivo}</span>}
            <button onClick={baixarModelo} className="text-xs text-torg-gray hover:text-torg-blue inline-flex items-center gap-1 ml-auto"><Download size={13} /> Baixar modelo</button>
          </div>
          <p className="text-[11px] text-torg-gray">Colunas reconhecidas (a 1ª linha da planilha): <strong>Lote</strong>, Local de entrega, Prioridade, Data prevista, Peso (kg), Observação. Peso pode ficar em branco.</p>

          {linhas && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-1.5 text-[11px] text-torg-gray font-medium flex items-center gap-1"><CheckCircle2 size={13} className="text-emerald-600" /> {linhas.length} lote{linhas.length === 1 ? "" : "s"} reconhecido{linhas.length === 1 ? "" : "s"} — confira antes de importar:</div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white sticky top-0 text-torg-gray"><tr>
                    <th className="text-left px-3 py-1.5 font-medium w-8">#</th>
                    <th className="text-left px-3 py-1.5 font-medium">Lote</th>
                    <th className="text-left px-3 py-1.5 font-medium">Local</th>
                    <th className="text-left px-3 py-1.5 font-medium">Data</th>
                    <th className="text-right px-3 py-1.5 font-medium">Peso</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {linhas.map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-torg-gray tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5 text-torg-dark">{l.nome}</td>
                        <td className="px-3 py-1.5 text-torg-gray">{l.local || "—"}</td>
                        <td className="px-3 py-1.5 text-torg-gray whitespace-nowrap">{l.dataPrevista ? fmtD(l.dataPrevista) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-torg-gray whitespace-nowrap">{l.pesoKg != null ? fmtKg(l.pesoKg) : "a definir"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {temLotes && linhas && (
            <label className="flex items-center gap-2 text-xs text-torg-dark">
              <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="accent-torg-blue" />
              Substituir os lotes atuais (apaga os que já existem antes de importar)
            </label>
          )}
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={importar} disabled={!linhas || importando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar {linhas ? `${linhas.length} lote${linhas.length === 1 ? "" : "s"}` : ""}</button>
        </div>
      </div>
    </div>
  );
}
