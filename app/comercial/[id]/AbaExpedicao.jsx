"use client";
import { useState, useEffect, useRef, Fragment } from "react";
import * as XLSX from "xlsx";
import { Truck, Plus, Pencil, Trash2, ChevronUp, ChevronDown, ChevronRight, Loader2, X, Upload, Download, AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";

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
export default function AbaExpedicao({ opId, proposta = null, podeEditarLotes = true }) {
  const [lotes, setLotes] = useState(null);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(null); // { lote } (novo = {})
  const [importOpen, setImportOpen] = useState(false);
  const [abertos, setAbertos] = useState({});   // lotes expandidos (ver marcas)
  const [pecasLote, setPecasLote] = useState({}); // marcas por lote
  const [exportar, setExportar] = useState(null); // { lote } sendo exportado

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
  // Expande o lote e busca as marcas (PecaLote ou, se vazio, as do romaneio prévio).
  async function verMarcas(l) {
    const aberto = !abertos[l.id];
    setAbertos((a) => ({ ...a, [l.id]: aberto }));
    if (aberto && pecasLote[l.id] === undefined) {
      const j = await fetch(`/api/comercial/op/${opId}/lotes-expedicao/pecas?loteId=${l.id}`).then((r) => r.json()).catch(() => null);
      setPecasLote((p) => ({ ...p, [l.id]: j?.pecas || [] }));
    }
  }

  // Peso REAL do lote = o do romaneio emitido (o que de fato saiu); só cai no
  // lote.pesoKg (planejado) enquanto não há romaneio — assim o total bate com a realidade.
  const pesoLote = (l) => (l.romaneios?.[0]?.pesoKg != null ? l.romaneios[0].pesoKg : l.pesoKg);
  const totalPeso = (lotes || []).reduce((s, l) => s + (pesoLote(l) || 0), 0);
  const semPeso = (lotes || []).filter((l) => pesoLote(l) == null).length;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><Truck size={18} className="text-torg-blue" /> Lotes de entrega</h3>
          {podeEditarLotes && (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={baixarModelo} className="text-xs text-torg-gray hover:text-torg-blue inline-flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-50"><Download size={13} /> Modelo</button>
              <button onClick={() => setImportOpen(true)} className="text-xs border border-torg-blue text-torg-blue rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-blue-50"><Upload size={13} /> Importar planilha</button>
              <button onClick={() => setModal({})} className="text-xs bg-torg-blue text-white rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-dark"><Plus size={13} /> Adicionar lote</button>
            </div>
          )}
        </div>
        <p className="text-sm text-torg-gray mb-4">Prioridades e locais de entrega da obra. Os <strong>pesos entram depois</strong>, quando a Engenharia gera a lista final de expedição.</p>
        {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

        {lotes === null ? (
          <div className="py-10 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
        ) : lotes.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-lg py-10 text-center">
            <Truck size={26} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-torg-dark">Nenhum lote de entrega ainda</p>
            <p className="text-xs text-torg-gray mt-1 max-w-md mx-auto">{podeEditarLotes ? "Importe uma planilha (prioridade, local e — se já tiver — peso) ou adicione os lotes manualmente. Dá pra refinar depois." : "Os lotes de entrega são criados no módulo OPs (Comercial/Planejamento). Aqui a Expedição vê os lotes e emite os romaneios."}</p>
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
                {lotes.map((l, i) => {
                  const aberto = !!abertos[l.id];
                  const marcas = pecasLote[l.id];
                  const rom = l.romaneios?.[0];
                  const emitido = !!rom?.emitidoEm;
                  const revLabel = emitido ? `R${String(rom.revisao ?? 0).padStart(2, "0")}` : null;
                  return (
                  <Fragment key={l.id}>
                  <tr className="hover:bg-gray-50/60 align-middle">
                    <td className="px-2 py-2">
                      <span className="text-xs font-mono font-semibold text-torg-blue tabular-nums w-5 text-center inline-block">{i + 1}</span>
                    </td>
                    <td className="px-3 py-2 text-torg-dark font-medium">
                      <button onClick={() => verMarcas(l)} className="text-torg-gray hover:text-torg-blue mr-1 align-middle" title="Ver marcas">{aberto ? <ChevronDown size={14} className="inline" /> : <ChevronRight size={14} className="inline" />}</button>
                      {l.nome}
                      {emitido
                        ? <span className="ml-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 align-middle">emitido {revLabel}</span>
                        : <span className="ml-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 align-middle">não emitido</span>}
                      {emitido && rom?.nfNumero && <span className="ml-1.5 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 align-middle" title="NF vinculada pelo Fiscal">NF {rom.nfNumero}{rom.nfTipo ? ` · ${rom.nfTipo}` : ""}</span>}
                      {l.observacao && <span className="block text-[11px] text-torg-gray font-normal">{l.observacao}</span>}
                    </td>
                    <td className="px-3 py-2 text-torg-gray">{l.local || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-torg-gray whitespace-nowrap">{l.dataPrevista ? fmtD(l.dataPrevista) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{pesoLote(l) != null ? <span className="text-torg-dark tabular-nums">{fmtKg(pesoLote(l))}</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">a definir</span>}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setExportar({ lote: l, emitido })} className="text-xs font-semibold text-white bg-torg-blue hover:bg-torg-dark px-2.5 py-1 rounded-lg inline-flex items-center gap-1 whitespace-nowrap" title={emitido ? "Gerar uma revisão do romaneio" : "Emitir o romaneio (FORM 22)"}>
                          <FileSpreadsheet size={12} /> {emitido ? "Revisar" : "Emitir"}
                        </button>
                        {podeEditarLotes && <button onClick={() => setModal({ lote: l })} className="text-torg-gray hover:text-torg-blue" title="Editar"><Pencil size={14} /></button>}
                        {podeEditarLotes && <button onClick={() => excluir(l)} className="text-torg-gray hover:text-red-600" title="Excluir"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                  {aberto && (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 bg-gray-50/60">
                        {(l.transportadora || l.motorista || l.placaVeiculo || l.contatoTransporte) && (
                          <p className="text-[11px] text-torg-gray mb-1.5 inline-flex items-center gap-1"><Truck size={11} /> {[l.transportadora, l.motorista, l.placaVeiculo, l.contatoTransporte].filter(Boolean).join(" · ")}</p>
                        )}
                        {marcas === undefined ? (
                          <p className="text-[11px] text-torg-gray inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> carregando marcas…</p>
                        ) : !marcas.length ? (
                          <p className="text-[11px] text-torg-gray">Nenhuma marca neste lote ainda — entram com o romaneio prévio (Lista de Expedição) ou a lista do Tekla.</p>
                        ) : (
                          <div className="max-h-56 overflow-y-auto border border-gray-100 rounded bg-white">
                            <table className="w-full text-[12px]">
                              <thead className="bg-white sticky top-0 text-torg-gray"><tr>
                                <th className="text-left px-2 py-1 font-medium">Marca</th>
                                <th className="text-left px-2 py-1 font-medium">Descrição</th>
                                <th className="text-right px-2 py-1 font-medium w-16">Qtd</th>
                                <th className="text-right px-2 py-1 font-medium w-24">Peso</th>
                              </tr></thead>
                              <tbody className="divide-y divide-gray-50">
                                {marcas.map((pc) => (
                                  <tr key={pc.id}>
                                    <td className="px-2 py-1 font-mono text-torg-dark">{pc.marca}</td>
                                    <td className="px-2 py-1 text-torg-gray">{pc.descricao || "—"}</td>
                                    <td className="px-2 py-1 text-right text-torg-gray tabular-nums">{pc.qtd ?? "—"}</td>
                                    <td className="px-2 py-1 text-right text-torg-gray tabular-nums whitespace-nowrap">{pc.pesoTotalKg != null ? fmtKg(pc.pesoTotalKg) : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
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
      {exportar && <EmitirRomaneioWizard opId={opId} lote={exportar.lote} emitido={exportar.emitido} onClose={() => setExportar(null)} onEmitido={() => { setExportar(null); carregar(); }} />}
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
    transportadora: lote?.transportadora || "",
    motorista: lote?.motorista || "",
    placaVeiculo: lote?.placaVeiculo || "",
    placaCarreta: lote?.placaCarreta || "",
    contatoTransporte: lote?.contatoTransporte || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

  // Transportadoras do Vendor List (categoria "Transporte") — puxa e auto-preenche.
  const [transps, setTransps] = useState([]);
  useEffect(() => {
    fetch(`/api/fornecedores?categoria=TRANSPORTE&ativos=1`).then((r) => r.json())
      .then((j) => setTransps(Array.isArray(j) ? j : (j.fornecedores || j.data || [])))
      .catch(() => {});
  }, []);
  const escolherTransp = (id) => {
    const t = transps.find((x) => x.id === id);
    if (!t) return;
    setF((v) => ({
      ...v,
      transportadora: t.nomeFantasia || t.razaoSocial || v.transportadora,
      contatoTransporte: t.telefone || t.contato || v.contatoTransporte,
    }));
  };

  async function salvar() {
    if (!f.nome.trim()) return setErro("Informe o nome/identificação do lote.");
    setErro(""); setSalvando(true);
    const pesoNum = f.pesoKg.trim() === "" ? null : parseFloat(String(f.pesoKg).replace(",", "."));
    const payload = {
      nome: f.nome.trim(), local: f.local.trim() || null,
      dataPrevista: f.dataPrevista || null,
      pesoKg: pesoNum != null && !isNaN(pesoNum) ? pesoNum : null,
      observacao: f.observacao.trim() || null,
      transportadora: f.transportadora.trim() || null,
      motorista: f.motorista.trim() || null,
      placaVeiculo: f.placaVeiculo.trim() || null,
      placaCarreta: f.placaCarreta.trim() || null,
      contatoTransporte: f.contatoTransporte.trim() || null,
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
          <div className="pt-2 border-t border-gray-100">
            <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-2">Transportador <span className="font-normal normal-case">— sai no romaneio; salvo aqui pra não redigitar</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-torg-dark mb-1">Puxar do Vendor List <span className="text-torg-gray font-normal">— categoria Transporte</span></label>
                {transps.length > 0 ? (
                  <select onChange={(e) => escolherTransp(e.target.value)} defaultValue="" className={inp}>
                    <option value="">— selecionar transportadora cadastrada —</option>
                    {transps.map((t) => <option key={t.id} value={t.id}>{t.nomeFantasia || t.razaoSocial}{t.cidade ? ` — ${t.cidade}${t.uf ? "/" + t.uf : ""}` : ""}</option>)}
                  </select>
                ) : (
                  <p className="text-[11px] text-torg-gray bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">Cadastre as transportadoras no <strong>Vendor List</strong> (categoria <strong>Transporte</strong>) que elas aparecem aqui pra puxar os dados automaticamente.</p>
                )}
              </div>
              <div className="col-span-2"><label className="block text-xs font-medium text-torg-dark mb-1">Transportadora</label><input value={f.transportadora} onChange={(e) => setF((v) => ({ ...v, transportadora: e.target.value }))} placeholder="Transportadora" className={inp} /></div>
              <div><label className="block text-xs font-medium text-torg-dark mb-1">Motorista</label><input value={f.motorista} onChange={(e) => setF((v) => ({ ...v, motorista: e.target.value }))} className={inp} /></div>
              <div><label className="block text-xs font-medium text-torg-dark mb-1">Contato / Fone</label><input value={f.contatoTransporte} onChange={(e) => setF((v) => ({ ...v, contatoTransporte: e.target.value }))} placeholder="Telefone" className={inp} /></div>
              <div><label className="block text-xs font-medium text-torg-dark mb-1">Placa (caminhão)</label><input value={f.placaVeiculo} onChange={(e) => setF((v) => ({ ...v, placaVeiculo: e.target.value }))} placeholder="ABC1D23" className={inp} /></div>
              <div><label className="block text-xs font-medium text-torg-dark mb-1">Placa carreta <span className="text-torg-gray font-normal">— se houver</span></label><input value={f.placaCarreta} onChange={(e) => setF((v) => ({ ...v, placaCarreta: e.target.value }))} placeholder="XYZ4E56" className={inp} /></div>
            </div>
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

// ── wizard emitir romaneio (FORM 22) — 3 passos ───────────────────────────────
function EmitirRomaneioWizard({ opId, lote, emitido, onClose, onEmitido }) {
  const [passo, setPasso] = useState(1);
  const [f, setF] = useState({
    transportadora: lote?.transportadora || "", motorista: lote?.motorista || "",
    placa: lote?.placaVeiculo || "", placaCarreta: lote?.placaCarreta || "",
    contato: lote?.contatoTransporte || "",
    data: lote?.dataPrevista ? String(lote.dataPrevista).slice(0, 10) : "",
    mudanca: "",
  });
  const [marcas, setMarcas] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [qtds, setQtds] = useState({}); // marca -> quantidade escolhida
  const [gerando, setGerando] = useState(false);
  const [gerandoPrevia, setGerandoPrevia] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(null);
  const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

  // Transportadoras do Vendor List (categoria "Transporte") — puxa e auto-preenche.
  const [transps, setTransps] = useState([]);
  useEffect(() => {
    fetch(`/api/fornecedores?categoria=TRANSPORTE&ativos=1`).then((r) => r.json())
      .then((j) => setTransps(Array.isArray(j) ? j : (j.fornecedores || [])))
      .catch(() => {});
  }, []);
  const escolherTransp = (id) => {
    const t = transps.find((x) => x.id === id);
    if (!t) return;
    setF((v) => ({ ...v, transportadora: t.nomeFantasia || t.razaoSocial || v.transportadora, contato: t.telefone || t.contato || v.contato }));
  };

  // Todas as marcas da OP (pra INCLUIR peça que não está no romaneio). pendente = total − expedido.
  const [opMarcas, setOpMarcas] = useState([]);
  const [buscaAdd, setBuscaAdd] = useState("");
  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/lista-expedicao/marcas`).then((r) => r.json())
      .then((j) => setOpMarcas((j.frentes || []).flatMap((fr) => (fr.marcas || []).map((m) => ({
        marca: m.marca, descricao: m.descricao || "", qtd: m.qte ?? null, pesoTotalKg: m.pesoTotal ?? null,
        pendente: Math.max(0, (Number(m.qte) || 0) - Math.max(0, Number(m.expedidoQtd) || 0)),
      })))))
      .catch(() => {});
  }, [opId]);
  const sugestoesAdd = (() => {
    const q = buscaAdd.trim().toLowerCase();
    if (!q) return [];
    const jaTem = new Set((marcas || []).map((m) => String(m.marca).toUpperCase()));
    return opMarcas.filter((m) => !jaTem.has(String(m.marca).toUpperCase()) && (String(m.marca).toLowerCase().includes(q) || String(m.descricao).toLowerCase().includes(q))).slice(0, 8);
  })();
  const adicionarMarca = (m) => {
    setMarcas((cur) => [...(cur || []), { marca: m.marca, descricao: m.descricao, qtd: m.qtd, pesoTotalKg: m.pesoTotalKg }]);
    setSel((s) => new Set(s).add(m.marca));
    setQtds((q) => ({ ...q, [m.marca]: m.pendente > 0 ? m.pendente : (m.qtd || 1) }));
    setBuscaAdd("");
  };
  const removerMarca = (marca) => {
    setMarcas((cur) => (cur || []).filter((x) => x.marca !== marca));
    setSel((s) => { const n = new Set(s); n.delete(marca); return n; });
    setQtds((q) => { const n = { ...q }; delete n[marca]; return n; });
  };

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/lotes-expedicao/pecas?loteId=${lote.id}`)
      .then((r) => r.json())
      .then((j) => {
        const ms = j?.pecas || [];
        setMarcas(ms); setSel(new Set(ms.map((m) => m.marca)));
        setQtds(Object.fromEntries(ms.map((m) => [m.marca, m.qtd ?? 1])));
      })
      .catch(() => { setMarcas([]); });
  }, [opId, lote.id]);

  const toggle = (m) => setSel((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
  // Peso proporcional à quantidade escolhida (o prévio traz o peso da qtd cheia).
  const pesoAjustado = (m) => {
    const q = Number(qtds[m.marca]);
    if (!q || !m.qtd) return Number(m.pesoTotalKg) || 0;
    return (Number(m.pesoTotalKg) || 0) * (q / m.qtd);
  };
  const selecionadas = marcas ? marcas.filter((m) => sel.has(m.marca)) : [];
  const pesoSel = selecionadas.reduce((s, m) => s + pesoAjustado(m), 0);

  async function emitir() {
    if (!selecionadas.length) { setErro("Selecione ao menos uma marca."); setPasso(1); return; }
    if (emitido && !f.mudanca.trim()) { setErro("Descreva o que mudou nesta revisão."); return; }
    setErro(""); setGerando(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/lotes-expedicao/${lote.id}/romaneio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transportadora: f.transportadora.trim() || null, motorista: f.motorista.trim() || null,
          placa: f.placa.trim() || null, placaCarreta: f.placaCarreta.trim() || null, contato: f.contato.trim() || null, data: f.data || null,
          itensSel: selecionadas.map((m) => ({ marca: m.marca, qtd: Number(qtds[m.marca]) || 0 })),
          mudanca: emitido ? f.mudanca.trim() : undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Erro ao emitir o romaneio");
      const bin = atob(j.arquivo);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = j.nome; a.click(); URL.revokeObjectURL(url);
      setOk(j);
    } catch (e) { setErro(e.message); setGerando(false); }
  }

  // Prévia: gera o FORM 22 só pra conferir/imprimir — não salva no servidor, não emite.
  async function gerarPrevia() {
    if (!selecionadas.length) { setErro("Selecione ao menos uma marca."); setPasso(1); return; }
    setErro(""); setGerandoPrevia(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/lotes-expedicao/${lote.id}/romaneio`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transportadora: f.transportadora.trim() || null, motorista: f.motorista.trim() || null,
          placa: f.placa.trim() || null, placaCarreta: f.placaCarreta.trim() || null, contato: f.contato.trim() || null, data: f.data || null,
          itensSel: selecionadas.map((m) => ({ marca: m.marca, qtd: Number(qtds[m.marca]) || 0 })),
          previa: true,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || "Erro ao gerar a prévia");
      const bin = atob(j.arquivo); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a"); a.href = url; a.download = j.nome; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErro(e.message); } finally { setGerandoPrevia(false); }
  }

  const PASSOS = [[1, "Marcas"], [2, "Transportador"], [3, emitido ? "Revisão" : "Emitir"]];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && !gerando && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><FileSpreadsheet size={15} className="text-torg-blue" /> {emitido ? "Revisar romaneio" : "Emitir romaneio"} — {lote?.nome}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {!ok && (
          <div className="px-5 pt-3 flex items-center gap-2">
            {PASSOS.map(([n, label], i) => (
              <div key={n} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${passo >= n ? "bg-torg-blue text-white" : "bg-gray-100 text-gray-400"}`}>{n}</span>
                <span className={`text-[12px] ${passo === n ? "text-torg-dark font-semibold" : "text-torg-gray"}`}>{label}</span>
                {i < PASSOS.length - 1 && <span className="w-6 h-px bg-gray-200" />}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-4 space-y-3 min-h-[210px]">
          {ok ? (
            <div className="py-8 text-center">
              <CheckCircle2 size={32} className="mx-auto text-emerald-600 mb-2" />
              <p className="text-sm font-semibold text-torg-dark">Romaneio {ok.numero}{ok.revisao > 0 ? ` — revisão R${String(ok.revisao).padStart(2, "0")}` : ""} emitido</p>
              <p className="text-xs text-torg-gray mt-1">{ok.sharepoint?.ok ? "Salvo no servidor (4.2 Romaneios) e baixado." : ok.sharepoint ? `Baixado — mas não salvou no SharePoint: ${ok.sharepoint.erro}` : "Baixado."}</p>
            </div>
          ) : passo === 1 ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Marcas do romaneio</span>
                {marcas && <span className="text-[11px] text-torg-gray tabular-nums">{selecionadas.length}/{marcas.length} · {fmtKg(pesoSel)}</span>}
              </div>
              {marcas === null ? (
                <p className="text-[11px] text-torg-gray inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> carregando marcas…</p>
              ) : !marcas.length ? (
                <p className="text-[11px] text-torg-gray">Sem marcas neste lote.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto border border-gray-100 rounded">
                  <div className="flex items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-wide text-torg-gray bg-gray-50 border-b border-gray-100 sticky top-0">
                    <span className="w-4" /><span className="w-20 shrink-0">Marca</span><span className="flex-1">Descrição</span><span className="w-16 text-right">Qtd</span><span className="w-16 text-right">Peso</span>
                  </div>
                  {marcas.map((m) => (
                    <div key={m.marca} className="flex items-center gap-2 px-2 py-1 text-[12px] hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <input type="checkbox" checked={sel.has(m.marca)} onChange={() => toggle(m.marca)} className="accent-torg-blue" />
                      <span className="font-mono text-torg-dark w-20 shrink-0 truncate">{m.marca}</span>
                      <span className="text-torg-gray truncate flex-1">{m.descricao || ""}</span>
                      <input type="number" min="0" value={qtds[m.marca] ?? ""} onChange={(e) => setQtds((q) => ({ ...q, [m.marca]: e.target.value === "" ? "" : Number(e.target.value) }))} disabled={!sel.has(m.marca)} title="Quantidade" className="w-16 text-right text-[12px] border border-gray-300 rounded px-1.5 py-0.5 disabled:bg-gray-100 disabled:text-gray-400 outline-none focus:border-torg-blue" />
                      <span className="text-torg-gray tabular-nums whitespace-nowrap w-16 text-right">{m.pesoTotalKg != null ? fmtKg(pesoAjustado(m)) : ""}</span>
                      <button onClick={() => removerMarca(m.marca)} className="text-gray-300 hover:text-red-600 shrink-0 ml-0.5" title="Tirar esta peça do romaneio"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-torg-gray">Ajuste a <strong>quantidade</strong>, ou clique no <strong>X</strong> pra tirar a peça do romaneio (volta pro pendente) — o peso acompanha.</p>

              <div className="border-t border-gray-100 pt-2">
                <span className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide">Incluir peça</span>
                <input value={buscaAdd} onChange={(e) => setBuscaAdd(e.target.value)} placeholder="Digite a marca ou descrição da peça a acrescentar…" className={`${inp} mt-1`} />
                {sugestoesAdd.length > 0 && (
                  <div className="mt-1 border border-gray-100 rounded max-h-40 overflow-y-auto">
                    {sugestoesAdd.map((m) => (
                      <button key={m.marca} onClick={() => adicionarMarca(m)} className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-left hover:bg-torg-blue-50 border-b border-gray-50 last:border-0">
                        <Plus size={12} className="text-torg-blue shrink-0" />
                        <span className="font-mono text-torg-dark w-20 shrink-0 truncate">{m.marca}</span>
                        <span className="text-torg-gray truncate flex-1">{m.descricao || ""}</span>
                        <span className="text-torg-gray tabular-nums whitespace-nowrap">{m.pendente > 0 ? `${m.pendente} pend.` : "0 pend."}</span>
                      </button>
                    ))}
                  </div>
                )}
                {buscaAdd.trim() && sugestoesAdd.length === 0 && <p className="text-[11px] text-torg-gray mt-1">Nenhuma marca com esse termo (ou já está na lista acima).</p>}
              </div>
            </>
          ) : passo === 2 ? (
            <>
              <p className="text-xs text-torg-gray">Dados do transportador — salvos no lote pra não redigitar.</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block col-span-2">
                  <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Puxar do Vendor List <span className="normal-case font-normal">— categoria Transporte</span></span>
                  {transps.length > 0 ? (
                    <select onChange={(e) => escolherTransp(e.target.value)} defaultValue="" className={inp}>
                      <option value="">— selecionar transportadora cadastrada —</option>
                      {transps.map((t) => <option key={t.id} value={t.id}>{t.nomeFantasia || t.razaoSocial}{t.cidade ? ` — ${t.cidade}${t.uf ? "/" + t.uf : ""}` : ""}</option>)}
                    </select>
                  ) : (
                    <p className="text-[11px] text-torg-gray bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mt-0.5">Cadastre as transportadoras no <strong>Vendor List</strong> (categoria <strong>Transporte</strong>) que elas aparecem aqui pra puxar os dados.</p>
                  )}
                </label>
                <label className="block col-span-2"><span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Transportadora</span><input value={f.transportadora} onChange={(e) => setF({ ...f, transportadora: e.target.value })} className={inp} placeholder="Transportadora" /></label>
                <label className="block"><span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Motorista</span><input value={f.motorista} onChange={(e) => setF({ ...f, motorista: e.target.value })} className={inp} /></label>
                <label className="block"><span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Placa (caminhão)</span><input value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value })} className={inp} placeholder="ABC1D23" /></label>
                <label className="block"><span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Placa carreta</span><input value={f.placaCarreta} onChange={(e) => setF({ ...f, placaCarreta: e.target.value })} className={inp} placeholder="se houver" /></label>
                <label className="block"><span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Contato / Fone</span><input value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} className={inp} placeholder="Telefone" /></label>
                <label className="block"><span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">Data de saída</span><input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} className={inp} /></label>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-[13px] text-torg-dark space-y-1">
                <p><b>{selecionadas.length}</b> marca(s) · <b>{fmtKg(pesoSel)}</b></p>
                <p className="text-torg-gray text-[12px]">{[f.transportadora, f.motorista, f.placa].filter(Boolean).join(" · ") || "Sem transportador"}</p>
              </div>
              {emitido ? (
                <label className="block">
                  <span className="text-[11px] font-medium text-torg-gray uppercase tracking-wide">O que mudou nesta revisão? *</span>
                  <textarea value={f.mudanca} onChange={(e) => setF({ ...f, mudanca: e.target.value })} rows={3} placeholder="Descreva a alteração — vai pra aba Histórico do Excel" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue outline-none" />
                  <span className="text-[11px] text-torg-gray">A versão anterior vai pra pasta Obsoleto; o novo Excel ganha a aba Histórico.</span>
                </label>
              ) : (
                <p className="text-xs text-torg-gray"><strong>Baixar prévia</strong>: confere/imprime sem emitir (não salva no servidor). <strong>Emitir</strong>: gera o FORM 22, salva na pasta <strong>4.2 Romaneios</strong> e baixa — a partir daí, novas gerações viram <strong>revisão</strong>.</p>
              )}
            </>
          )}
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between gap-2 rounded-b-xl">
          {ok ? (
            <button onClick={onEmitido} className="ml-auto px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium">Concluir</button>
          ) : (<>
            <button onClick={() => (passo > 1 ? setPasso(passo - 1) : onClose())} disabled={gerando} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50">{passo > 1 ? "Voltar" : "Cancelar"}</button>
            {passo < 3 ? (
              <button onClick={() => setPasso(passo + 1)} disabled={passo === 1 && !selecionadas.length} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium disabled:opacity-50">Avançar</button>
            ) : (
              <div className="flex items-center gap-2">
                <button onClick={gerarPrevia} disabled={gerando || gerandoPrevia} title="Baixa o romaneio pra conferir/imprimir, sem emitir" className="px-3 py-1.5 text-sm text-torg-blue border border-torg-blue/40 rounded-lg hover:bg-torg-blue-50 font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{gerandoPrevia ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Baixar prévia</button>
                <button onClick={emitir} disabled={gerando || gerandoPrevia} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{gerando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} {emitido ? "Emitir revisão" : "Emitir romaneio"}</button>
              </div>
            )}
          </>)}
        </div>
      </div>
    </div>
  );
}
