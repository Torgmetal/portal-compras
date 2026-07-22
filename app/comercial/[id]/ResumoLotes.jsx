"use client";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Truck, Upload, Loader2, X, AlertCircle, CheckCircle2, ChevronRight, ChevronDown, Download } from "lucide-react";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const _norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// ── parse da lista do Tekla (no navegador) ───────────────────────────────────
function detectCols(keys) {
  const find = (tests) => keys.find((k) => { const x = _norm(k); return tests.some((t) => (t instanceof RegExp ? t.test(x) : x.includes(t))); });
  const pesoUnit = find([/peso\s*un/, /peso\s*\/\s*un/, "peso unit"]);
  const pesoTot = find([/peso\s*tot/, /tot\w*\s*kg/]);
  const pesoGen = find(["peso", "kg"]);
  return {
    lote: find(["lote", "pacote", "embarque", "remessa"]),
    marca: find(["marca", "peca", "posi", "tag", "item"]),
    descricao: find(["descri", "perfil", "material"]),
    qtd: find(["qtd", "quant"]),
    pesoUnit: pesoUnit || null,
    pesoTotal: pesoTot || (pesoUnit ? null : pesoGen) || null,
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
async function parseLista(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const objs = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null, blankrows: false });
  if (!objs.length) return { cols: null, pecas: [] };
  const cols = detectCols(Object.keys(objs[0]));
  const pecas = [];
  for (const o of objs) {
    const marca = cols.marca && o[cols.marca] != null ? String(o[cols.marca]).trim() : "";
    if (!marca) continue;
    const qtd = cols.qtd ? parseNum(o[cols.qtd]) : null;
    const pesoUnitKg = cols.pesoUnit ? parseNum(o[cols.pesoUnit]) : null;
    let pesoTotalKg = cols.pesoTotal ? parseNum(o[cols.pesoTotal]) : null;
    if (pesoTotalKg == null && pesoUnitKg != null) pesoTotalKg = qtd != null ? pesoUnitKg * qtd : pesoUnitKg;
    pecas.push({
      lote: cols.lote && o[cols.lote] != null ? String(o[cols.lote]).trim() : null,
      marca: marca.slice(0, 120),
      descricao: cols.descricao && o[cols.descricao] != null ? String(o[cols.descricao]).trim().slice(0, 300) : null,
      qtd, pesoUnitKg, pesoTotalKg,
    });
  }
  return { cols, pecas };
}
function baixarModelo() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Lote", "Marca", "Descrição", "Qtd", "Peso unit. (kg)", "Peso total (kg)"],
    ["Lote 1 — Pilares", "P1", "W 310x38,7", 4, 250, 1000],
    ["Lote 1 — Pilares", "P2", "W 310x38,7", 2, 250, 500],
    ["Lote 2 — Vigas", "V1", "W 200x22,5", 6, 120, 720],
  ]);
  ws["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 8 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lista Tekla");
  XLSX.writeFile(wb, "modelo-lista-tekla-lotes.xlsx");
}

export default function ResumoLotes({ opId, lotes = [], onChange }) {
  const [importOpen, setImportOpen] = useState(false);
  const [abertos, setAbertos] = useState({});
  const [pecas, setPecas] = useState({});
  const [salvandoData, setSalvandoData] = useState({});

  const pesoTotal = lotes.reduce((s, l) => s + (l.pesoKg || 0), 0);
  const semPeso = lotes.filter((l) => l.pesoKg == null).length;
  const totDesenhos = lotes.reduce((s, l) => s + (l._count?.desenhos || 0), 0);
  const totPecas = lotes.reduce((s, l) => s + (l._count?.pecas || 0), 0);

  async function alternar(l) {
    const aberto = !abertos[l.id];
    setAbertos((a) => ({ ...a, [l.id]: aberto }));
    if (aberto && !pecas[l.id]) {
      const j = await fetch(`/api/comercial/op/${opId}/lotes-expedicao/pecas?loteId=${l.id}`).then((r) => r.json()).catch(() => null);
      setPecas((p) => ({ ...p, [l.id]: j?.pecas || [] }));
    }
  }
  async function mudarData(l, valor) {
    setSalvandoData((s) => ({ ...s, [l.id]: true }));
    await fetch(`/api/comercial/op/${opId}/lotes-expedicao/${l.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataPrevista: valor || null }),
    }).catch(() => {});
    setSalvandoData((s) => ({ ...s, [l.id]: false }));
    onChange?.();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-1.5"><Truck size={15} className="text-torg-blue" /> Lotes de entrega <span className="text-torg-gray font-normal">· resumo</span></h3>
        <div className="flex items-center gap-2">
          <button onClick={baixarModelo} className="text-[11px] text-torg-gray hover:text-torg-blue inline-flex items-center gap-1"><Download size={12} /> Modelo</button>
          <button onClick={() => setImportOpen(true)} className="text-xs bg-torg-blue text-white rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-torg-dark"><Upload size={13} /> Subir lista do Tekla</button>
        </div>
      </div>
      <p className="text-[11px] text-torg-gray mb-3">Suba a lista de peças (Tekla) para registrar o que vai em cada lote — o <strong>peso do lote passa a ser a soma das peças</strong>. A <strong>data de entrega</strong> é definida aqui, conforme o cronograma.</p>

      {lotes.length === 0 ? (
        <p className="text-sm text-torg-gray py-6 text-center">Nenhum lote de entrega ainda — crie na aba <strong>Engenharia</strong> (Projetos e desenhos) ou suba a lista do Tekla, que os lotes são criados a partir dela.</p>
      ) : (<>
        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-gray-50">
              <tr className="text-[11px] text-torg-gray uppercase">
                <th className="text-left px-2 py-2 font-medium w-16">Prior.</th>
                <th className="text-left px-3 py-2 font-medium">Lote</th>
                <th className="text-left px-3 py-2 font-medium">Local de entrega</th>
                <th className="text-left px-3 py-2 font-medium w-36">Data de entrega</th>
                <th className="text-right px-3 py-2 font-medium w-20">Peças</th>
                <th className="text-right px-3 py-2 font-medium w-20">Des.</th>
                <th className="text-right px-3 py-2 font-medium w-28">Peso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lotes.map((l) => {
                const aberto = !!abertos[l.id];
                const lista = pecas[l.id];
                return (
                  <>
                    <tr key={l.id} className="hover:bg-gray-50/60">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => alternar(l)} className="text-torg-gray hover:text-torg-dark" title="Ver peças">{aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
                          <span className="text-[11px] font-mono font-bold text-white bg-torg-blue rounded px-1.5 py-0.5">{l.ordem}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-torg-dark font-medium">{l.nome}</td>
                      <td className="px-3 py-2 text-torg-gray">{l.local || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <input type="date" value={l.dataPrevista ? String(l.dataPrevista).slice(0, 10) : ""} onChange={(e) => mudarData(l, e.target.value)} className="text-[12px] border border-gray-200 rounded px-1.5 py-1 focus:border-torg-blue outline-none w-[130px]" title="Data de entrega (Planejamento)" />
                          {salvandoData[l.id] && <Loader2 size={11} className="animate-spin text-torg-gray" />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-torg-gray tabular-nums">{l._count?.pecas ?? 0}</td>
                      <td className="px-3 py-2 text-right text-torg-gray tabular-nums">{l._count?.desenhos ?? 0}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{l.pesoKg != null ? <span className="text-torg-dark tabular-nums font-medium">{fmtKg(l.pesoKg)}</span> : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">a definir</span>}</td>
                    </tr>
                    {aberto && (
                      <tr key={`${l.id}-pecas`}>
                        <td colSpan={7} className="px-3 py-2 bg-gray-50/60">
                          {lista === undefined ? (
                            <p className="text-[11px] text-torg-gray inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> carregando peças…</p>
                          ) : !lista.length ? (
                            <p className="text-[11px] text-torg-gray">Nenhuma peça registrada neste lote — suba a lista do Tekla.</p>
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
                                  {lista.map((p) => (
                                    <tr key={p.id}>
                                      <td className="px-2 py-1 font-mono text-torg-dark">{p.marca}</td>
                                      <td className="px-2 py-1 text-torg-gray">{p.descricao || "—"}</td>
                                      <td className="px-2 py-1 text-right text-torg-gray tabular-nums">{p.qtd ?? "—"}</td>
                                      <td className="px-2 py-1 text-right text-torg-gray tabular-nums whitespace-nowrap">{p.pesoTotalKg != null ? fmtKg(p.pesoTotalKg) : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            {lotes.length > 1 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold text-torg-dark">
                  <td className="px-2 py-2" colSpan={4}>Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totPecas}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totDesenhos}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtKg(pesoTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {semPeso > 0 && <p className="text-[11px] text-torg-gray mt-2">{semPeso} lote{semPeso === 1 ? "" : "s"} sem peso — o peso entra quando a lista do Tekla daquele lote for subida.</p>}
      </>)}

      {importOpen && <ImportarPecasModal opId={opId} temPecas={totPecas > 0} onClose={() => setImportOpen(false)} onImportado={() => { setImportOpen(false); setPecas({}); onChange?.(); }} />}
    </div>
  );
}

function ImportarPecasModal({ opId, temPecas, onClose, onImportado }) {
  const [dados, setDados] = useState(null); // {cols, pecas}
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
      const r = await parseLista(file);
      if (!r.pecas.length) throw new Error("Não achei peças na planilha. A 1ª linha precisa ter os títulos das colunas (ex.: Lote, Marca, Qtd, Peso).");
      setDados(r);
    } catch (e) { setErro(e.message); setDados(null); } finally { setParsing(false); }
  }
  async function importar() {
    setImportando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/lotes-expedicao/pecas`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pecas: dados.pecas, substituir }),
      });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onImportado();
    } catch (e) { setErro(e.message); setImportando(false); }
  }

  const lotesDistintos = dados ? [...new Set(dados.pecas.map((p) => (p.lote || "").trim()).filter(Boolean))] : [];
  const semLote = dados ? dados.pecas.filter((p) => !p.lote).length : 0;
  const pesoSoma = dados ? dados.pecas.reduce((s, p) => s + (p.pesoTotalKg || 0), 0) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><Upload size={15} className="text-torg-blue" /> Subir lista de peças (Tekla)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()} disabled={parsing} className="text-sm border border-torg-blue text-torg-blue rounded-lg px-3 py-1.5 font-medium inline-flex items-center gap-1.5 hover:bg-torg-blue-50 disabled:opacity-50">{parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Escolher arquivo</button>
            {arquivo && <span className="text-xs text-torg-gray truncate">{arquivo}</span>}
            <button onClick={baixarModelo} className="text-xs text-torg-gray hover:text-torg-blue inline-flex items-center gap-1 ml-auto"><Download size={13} /> Modelo</button>
          </div>
          <p className="text-[11px] text-torg-gray">Colunas reconhecidas: <strong>Lote</strong>, <strong>Marca</strong>, Descrição, Qtd, Peso unit. (kg), Peso total (kg). Sem peso total, calculo <em>unit. × qtd</em>. Lote que não existir é criado.</p>

          {dados && (<>
            <div className="border border-gray-100 rounded-lg">
              <div className="bg-gray-50 px-3 py-1.5 text-[11px] text-torg-gray font-medium flex items-center gap-1 flex-wrap">
                <CheckCircle2 size={13} className="text-emerald-600" />
                {dados.pecas.length} peça(s) · {lotesDistintos.length} lote(s) · {fmtKg(pesoSoma)}{semLote > 0 ? ` · ${semLote} sem lote` : ""}
              </div>
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white sticky top-0 text-torg-gray"><tr>
                    <th className="text-left px-3 py-1.5 font-medium">Lote</th>
                    <th className="text-left px-3 py-1.5 font-medium">Marca</th>
                    <th className="text-left px-3 py-1.5 font-medium">Descrição</th>
                    <th className="text-right px-3 py-1.5 font-medium">Qtd</th>
                    <th className="text-right px-3 py-1.5 font-medium">Peso</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {dados.pecas.slice(0, 200).map((p, i) => (
                      <tr key={i}>
                        <td className={`px-3 py-1 ${p.lote ? "text-torg-dark" : "text-amber-700"}`}>{p.lote || "— sem lote —"}</td>
                        <td className="px-3 py-1 font-mono text-torg-dark">{p.marca}</td>
                        <td className="px-3 py-1 text-torg-gray">{p.descricao || "—"}</td>
                        <td className="px-3 py-1 text-right text-torg-gray tabular-nums">{p.qtd ?? "—"}</td>
                        <td className="px-3 py-1 text-right text-torg-gray tabular-nums whitespace-nowrap">{p.pesoTotalKg != null ? fmtKg(p.pesoTotalKg) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dados.pecas.length > 200 && <p className="px-3 py-1.5 text-[11px] text-torg-gray border-t border-gray-100">mostrando 200 de {dados.pecas.length} — todas serão importadas.</p>}
            </div>
            {lotesDistintos.length > 0 && <p className="text-[11px] text-torg-gray">Lotes na planilha: {lotesDistintos.join(" · ")}</p>}
            {temPecas && (
              <label className="flex items-center gap-2 text-xs text-torg-dark">
                <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} className="accent-torg-blue" />
                Substituir as peças já registradas nesta OP (sobe a lista do zero)
              </label>
            )}
          </>)}
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={importar} disabled={!dados || importando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Registrar {dados ? `${dados.pecas.length} peça(s)` : ""}</button>
        </div>
      </div>
    </div>
  );
}
