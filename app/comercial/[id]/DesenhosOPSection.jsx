"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { upload as blobUpload } from "@vercel/blob/client";
import { FileText, PenTool, Upload, FolderDown, Eye, Download, Trash2, ChevronUp, ChevronDown, ChevronRight, Loader2, X, ExternalLink, AlertCircle, CheckCircle2, Plus, FileSpreadsheet, MapPin, CalendarDays } from "lucide-react";

const fmtTam = (n) => (n == null ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);
const iconFor = (ext) => (ext === "pdf" ? { I: FileText, c: "text-red-500" } : ext === "dwg" || ext === "dxf" ? { I: PenTool, c: "text-torg-blue" } : { I: FileText, c: "text-torg-gray" });

export default function DesenhosOPSection({ opId, opNumero, obra }) {
  const [desenhos, setDesenhos] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [loteDestino, setLoteDestino] = useState("");
  const [novoLoteAlvo, setNovoLoteAlvo] = useState(null);
  const [sel, setSel] = useState({});
  const [fechados, setFechados] = useState({});
  const [erro, setErro] = useState("");
  const [subindo, setSubindo] = useState(false);
  const [pastaOpen, setPastaOpen] = useState(false);
  const [exportando, setExportando] = useState(false);
  const fileRef = useRef(null);

  const carregar = () => fetch(`/api/comercial/op/${opId}/desenhos`).then((r) => r.json())
    .then((j) => { if (j.success) setDesenhos(j.desenhos); else setErro(j.error || "Erro"); }).catch(() => setErro("Erro ao carregar"));
  const carregarLotes = () => fetch(`/api/comercial/op/${opId}/lotes-expedicao`).then((r) => r.json())
    .then((j) => { if (j.success) setLotes(j.lotes || []); }).catch(() => {});
  useEffect(() => { carregar(); carregarLotes(); }, [opId]);

  // agrupa por lote (ordem do lote = prioridade); "sem lote" por último
  const grupos = useMemo(() => {
    const ord = (arr) => [...arr].sort((a, b) => (a.ordem - b.ordem) || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    const porLote = new Map(lotes.map((l) => [l.id, { lote: l, itens: [] }]));
    const semLote = [];
    for (const d of desenhos || []) (d.loteId && porLote.has(d.loteId) ? porLote.get(d.loteId).itens : semLote).push(d);
    const gs = [...porLote.values()].sort((a, b) => a.lote.ordem - b.lote.ordem).map((g) => ({ ...g, itens: ord(g.itens) }));
    if (semLote.length) gs.push({ lote: null, itens: ord(semLote) });
    return gs;
  }, [desenhos, lotes]);

  const marcados = Object.keys(sel).filter((k) => sel[k]);
  const nSel = marcados.length;
  const limparSel = () => setSel({});

  async function enviar(files) {
    if (!files?.length) return;
    setSubindo(true); setErro("");
    try {
      for (const file of files) {
        const safe = String(file.name || "desenho").replace(/[^\w\d.\- ]/g, "_").slice(0, 120);
        const blob = await blobUpload(`desenhos-op/${opId}/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: `/api/comercial/op/${opId}/desenhos/upload-token` });
        const r = await fetch(`/api/comercial/op/${opId}/desenhos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: file.name, url: blob.url, tamanho: file.size, loteId: loteDestino || null }) });
        const j = await r.json(); if (!j.success) throw new Error(j.error);
      }
      carregar();
    } catch (e) { setErro(`Falha ao enviar: ${e.message}`); } finally { setSubindo(false); }
  }
  async function excluir(d) {
    if (!confirm(`Remover "${d.nome}"? ${d.origem === "SHAREPOINT" ? "(o arquivo continua na pasta da obra)" : "(apaga o arquivo enviado)"}`)) return;
    await fetch(`/api/comercial/op/${opId}/desenhos/${d.id}`, { method: "DELETE" }).catch(() => {});
    carregar();
  }
  async function excluirSelecionados() {
    if (!confirm(`Remover ${nSel} desenho(s) da lista?`)) return;
    for (const id of marcados) await fetch(`/api/comercial/op/${opId}/desenhos/${id}`, { method: "DELETE" }).catch(() => {});
    limparSel(); carregar();
  }
  async function moverSelecionados(loteId) {
    for (const id of marcados) {
      await fetch(`/api/comercial/op/${opId}/desenhos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loteId: loteId || null }) }).catch(() => {});
    }
    limparSel(); carregar();
  }
  async function moverLoteOrdem(idx, dir) {
    const comLote = grupos.filter((g) => g.lote).map((g) => g.lote);
    const j = idx + dir; if (j < 0 || j >= comLote.length) return;
    const novo = [...comLote]; [novo[idx], novo[j]] = [novo[j], novo[idx]];
    setLotes(novo.map((l, i) => ({ ...l, ordem: i + 1 })));
    await fetch(`/api/comercial/op/${opId}/lotes-expedicao/reordenar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem: novo.map((l) => l.id) }) }).catch(() => {});
    carregarLotes();
  }

  async function exportar() {
    setExportando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, downloadWorkbook } = await import("@/lib/excel-relatorio");
      const total = (desenhos || []).length;
      const semLote = (desenhos || []).filter((d) => !d.loteId).length;
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Projetos e Desenhos — OP-${String(opNumero || "").padStart(3, "0")}`,
        subtitulo: [obra, `${total} desenho${total === 1 ? "" : "s"}`, `${lotes.length} lote${lotes.length === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
        kpis: [semLote > 0 ? `⚠ ${semLote} desenho(s) ainda sem lote de entrega` : "✓ Todos os desenhos estão vinculados a um lote"],
        totalColunas: 7,
        nomePlanilha: "Projetos e Desenhos",
        codigoDoc: "REL-ENG-001",
      });
      ws.columns = [{ width: 8 }, { width: 26 }, { width: 30 }, { width: 13 }, { width: 46 }, { width: 8 }, { width: 16 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, ["Prior.", "Lote", "Local de entrega", "Data prev.", "Desenho", "Tipo", "Origem"]);
      row++;
      for (const g of grupos) {
        const prior = g.lote ? g.lote.ordem : "";
        const nomeLote = g.lote ? g.lote.nome : "— sem lote —";
        const local = g.lote?.local || "";
        const data = g.lote?.dataPrevista ? fmtD(g.lote.dataPrevista) : "";
        if (!g.itens.length) {
          adicionarLinhaTabela(ws, row, [prior, nomeLote, local, data, "(sem desenhos)", "", ""], { fillColor: "F0F4F8", alinhamento: { 0: "center", 3: "center", 5: "center" } });
          row++; continue;
        }
        for (const d of g.itens) {
          adicionarLinhaTabela(ws, row, [
            prior, nomeLote, local, data, d.nome, (d.ext || "").toUpperCase(),
            d.origem === "SHAREPOINT" ? `Pasta da obra${d.area ? ` (${d.area})` : ""}` : "Enviado",
          ], { fillColor: g.lote ? undefined : "FFF3E8", alinhamento: { 0: "center", 3: "center", 5: "center" } });
          row++;
        }
      }
      await downloadWorkbook(workbook, `Projetos_Desenhos_OP-${String(opNumero || "").padStart(3, "0")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { alert("Erro ao exportar: " + e.message); } finally { setExportando(false); }
  }

  const btn = "text-xs rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-lg font-semibold text-torg-dark flex items-center gap-2"><PenTool size={18} className="text-torg-blue" /> Projetos e desenhos</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportar} disabled={exportando || !(desenhos || []).length} className={`${btn} text-torg-gray border border-gray-300 hover:bg-gray-50 disabled:opacity-40`}>{exportando ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Exportar</button>
          <button onClick={() => setNovoLoteAlvo({ tipo: "destino" })} className={`${btn} text-torg-blue border border-torg-blue-200 hover:bg-torg-blue-50`}><Plus size={13} /> Novo lote</button>
          <button onClick={() => setPastaOpen(true)} className={`${btn} text-torg-blue border border-torg-blue hover:bg-torg-blue-50`}><FolderDown size={13} /> Trazer da pasta</button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.dwg,.dxf,application/pdf,application/acad,image/vnd.dwg,application/octet-stream" className="hidden" onChange={(e) => { enviar(Array.from(e.target.files || [])); e.target.value = ""; }} />
          <button onClick={() => fileRef.current?.click()} disabled={subindo} className={`${btn} bg-torg-blue text-white hover:bg-torg-dark disabled:opacity-50`}>{subindo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Importar DWG/PDF</button>
        </div>
      </div>
      <p className="text-sm text-torg-gray mb-3">Desenhos agrupados pelo <strong>lote de entrega</strong> — a ordem dos lotes é a prioridade de fabricação. Os lotes criados aqui já aparecem na aba <strong>Expedição</strong>.</p>

      {/* destino dos próximos imports */}
      <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
        <span className="text-torg-gray">Importar para o lote:</span>
        <select value={loteDestino} onChange={(e) => setLoteDestino(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 bg-white max-w-[220px]">
          <option value="">— nenhum (definir depois) —</option>
          {lotes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      </div>

      {erro && <p className="text-xs text-red-600 mb-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}

      {/* barra de seleção */}
      {nSel > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3 bg-torg-blue-50/60 border border-torg-blue-200 rounded-lg px-3 py-2 text-xs">
          <span className="font-semibold text-torg-dark">{nSel} selecionado{nSel === 1 ? "" : "s"}</span>
          <span className="text-torg-gray">→ mover para</span>
          <select defaultValue="" onChange={(e) => { if (e.target.value !== "") moverSelecionados(e.target.value === "__sem__" ? null : e.target.value); }} className="border border-gray-300 rounded-lg px-2 py-1 bg-white">
            <option value="">escolher lote…</option>
            {lotes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            <option value="__sem__">— sem lote —</option>
          </select>
          <button onClick={excluirSelecionados} className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 font-medium"><Trash2 size={12} /> Remover</button>
          <button onClick={limparSel} className="text-torg-gray hover:text-torg-dark ml-auto">limpar seleção</button>
        </div>
      )}

      {desenhos === null ? (
        <div className="py-8 text-center text-torg-gray"><Loader2 size={22} className="mx-auto animate-spin" /></div>
      ) : !desenhos.length && !lotes.length ? (
        <div className="border border-dashed border-gray-200 rounded-lg py-8 text-center">
          <PenTool size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-torg-dark">Nenhum desenho ainda</p>
          <p className="text-xs text-torg-gray mt-1 max-w-md mx-auto">Crie um <strong>lote</strong>, importe os DWG/PDF ou puxe os projetos da pasta da obra.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map((g, gi) => {
            const idLote = g.lote?.id || "__sem__";
            const aberto = !fechados[idLote];
            const idxLote = g.lote ? grupos.filter((x) => x.lote).findIndex((x) => x.lote.id === g.lote.id) : -1;
            const nComLote = grupos.filter((x) => x.lote).length;
            const todosMarcados = g.itens.length > 0 && g.itens.every((d) => sel[d.id]);
            return (
              <div key={idLote} className={`border rounded-lg overflow-hidden ${g.lote ? "border-gray-200" : "border-amber-200"}`}>
                {/* cabeçalho do lote */}
                <div className={`flex items-center gap-2 px-3 py-2 ${g.lote ? "bg-gray-50" : "bg-amber-50"}`}>
                  <button onClick={() => setFechados((f) => ({ ...f, [idLote]: aberto }))} className="text-torg-gray hover:text-torg-dark shrink-0">{aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
                  {g.itens.length > 0 && (
                    <input type="checkbox" checked={todosMarcados} onChange={() => setSel((s) => { const n = { ...s }; for (const d of g.itens) { if (todosMarcados) delete n[d.id]; else n[d.id] = true; } return n; })} className="accent-torg-blue" title="Selecionar todos do lote" />
                  )}
                  {g.lote ? <span className="text-[11px] font-mono font-bold text-white bg-torg-blue rounded px-1.5 py-0.5 shrink-0">{g.lote.ordem}</span> : <span className="text-[11px] font-semibold text-amber-700 shrink-0">!</span>}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${g.lote ? "text-torg-dark" : "text-amber-800"}`}>{g.lote ? g.lote.nome : "Sem lote definido"}</p>
                    <div className="flex items-center gap-2.5 text-[11px] text-torg-gray flex-wrap">
                      {g.lote?.local && <span className="inline-flex items-center gap-0.5"><MapPin size={10} /> {g.lote.local}</span>}
                      {g.lote?.dataPrevista && <span className="inline-flex items-center gap-0.5"><CalendarDays size={10} /> {fmtD(g.lote.dataPrevista)}</span>}
                      <span>{g.itens.length} desenho{g.itens.length === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  {g.lote && (
                    <div className="flex flex-col shrink-0">
                      <button onClick={() => moverLoteOrdem(idxLote, -1)} disabled={idxLote === 0} className="text-gray-300 hover:text-torg-blue disabled:opacity-30 leading-none" title="Subir prioridade"><ChevronUp size={13} /></button>
                      <button onClick={() => moverLoteOrdem(idxLote, 1)} disabled={idxLote === nComLote - 1} className="text-gray-300 hover:text-torg-blue disabled:opacity-30 leading-none" title="Descer prioridade"><ChevronDown size={13} /></button>
                    </div>
                  )}
                </div>
                {/* desenhos do lote */}
                {aberto && (g.itens.length === 0 ? (
                  <p className="px-3 py-2.5 text-[11px] text-torg-gray">Nenhum desenho neste lote — selecione desenhos e use “mover para”, ou importe com este lote escolhido acima.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {g.itens.map((d) => {
                      const { I, c } = iconFor(d.ext);
                      const isPdf = d.ext === "pdf";
                      return (
                        <div key={d.id} className={`flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50/70 ${sel[d.id] ? "bg-torg-blue-50/40" : ""}`}>
                          <input type="checkbox" checked={!!sel[d.id]} onChange={() => setSel((s) => { const n = { ...s }; if (n[d.id]) delete n[d.id]; else n[d.id] = true; return n; })} className="accent-torg-blue shrink-0" />
                          <I size={15} className={`${c} shrink-0`} />
                          <span className="text-[13px] text-torg-dark truncate flex-1 min-w-0" title={d.nome}>{d.nome}</span>
                          <span className="text-[11px] text-torg-gray shrink-0 hidden sm:inline">{d.origem === "SHAREPOINT" ? `pasta${d.area ? ` · ${d.area}` : ""}` : fmtTam(d.tamanho)}</span>
                          <a href={`/api/comercial/op/${opId}/desenhos/${d.id}/arquivo`} target="_blank" rel="noopener noreferrer" className="text-torg-blue hover:text-torg-dark shrink-0" title={isPdf ? "Visualizar" : "Baixar"}>{isPdf ? <Eye size={15} /> : <Download size={15} />}</a>
                          {d.origem === "SHAREPOINT" && d.webUrl && <a href={d.webUrl} target="_blank" rel="noopener noreferrer" className="text-torg-gray hover:text-torg-blue shrink-0" title="Abrir no SharePoint"><ExternalLink size={13} /></a>}
                          <button onClick={() => excluir(d)} className="text-torg-gray hover:text-red-600 shrink-0" title="Remover"><Trash2 size={13} /></button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {pastaOpen && <PastaModal opId={opId} lotes={lotes} loteInicial={loteDestino} onClose={() => setPastaOpen(false)} onImportado={() => { setPastaOpen(false); carregar(); }} />}
      {novoLoteAlvo && <NovoLoteModal opId={opId} onClose={() => setNovoLoteAlvo(null)} onCriado={(lote) => {
        setLotes((ls) => (ls.some((x) => x.id === lote.id) ? ls : [...ls, lote]));
        carregarLotes();
        if (novoLoteAlvo.tipo === "destino") setLoteDestino(lote.id);
        setNovoLoteAlvo(null);
      }} />}
    </div>
  );
}

function NovoLoteModal({ opId, onClose, onCriado }) {
  const [f, setF] = useState({ nome: "", local: "", dataPrevista: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const inp = "w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-torg-blue outline-none";

  async function salvar() {
    if (!f.nome.trim()) return setErro("Informe o nome do lote.");
    setErro(""); setSalvando(true);
    try {
      const r = await fetch(`/api/comercial/op/${opId}/lotes-expedicao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: f.nome.trim(), local: f.local.trim() || null, dataPrevista: f.dataPrevista || null }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onCriado(j.lote);
    } catch (e) { setErro(e.message); setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm my-10">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-torg-dark">Novo lote de entrega</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Lote / identificação *</label>
            <input value={f.nome} onChange={(e) => setF((v) => ({ ...v, nome: e.target.value }))} placeholder="Ex: Lote 1 — Pilares" className={inp} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Local de entrega</label>
            <input value={f.local} onChange={(e) => setF((v) => ({ ...v, local: e.target.value }))} placeholder="Ex: Obra SP — Galpão A" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Data prevista <span className="text-torg-gray font-normal">— opcional</span></label>
            <input type="date" value={f.dataPrevista} onChange={(e) => setF((v) => ({ ...v, dataPrevista: e.target.value }))} className={inp} />
          </div>
          <p className="text-[11px] text-torg-gray">O peso do lote entra depois, com a lista final — na aba Expedição.</p>
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{salvando && <Loader2 size={14} className="animate-spin" />} Criar lote</button>
        </div>
      </div>
    </div>
  );
}

function PastaModal({ opId, lotes = [], loteInicial = "", onClose, onImportado }) {
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState({});
  const [loteId, setLoteId] = useState(loteInicial || "");
  const [carregando, setCarregando] = useState(true);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/desenhos/pasta`).then((r) => r.json())
      .then((j) => {
        if (!j.success) { setErro(j.error || "Erro"); return; }
        setDados(j);
        const pre = {}; for (const d of j.desenhos || []) if (!d.jaImportado) pre[d.itemId] = true; setSel(pre);
      })
      .catch(() => setErro("Não foi possível ler a pasta da obra.")).finally(() => setCarregando(false));
  }, [opId]);

  const lista = dados?.desenhos || [];
  const marcados = lista.filter((d) => sel[d.itemId] && !d.jaImportado);
  const toggle = (id) => setSel((s) => ({ ...s, [id]: !s[id] }));

  async function importar() {
    if (!marcados.length) return;
    setImportando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${opId}/desenhos/pasta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ desenhos: marcados, loteId: loteId || null }) });
      const j = await r.json(); if (!j.success) throw new Error(j.error);
      onImportado();
    } catch (e) { setErro(e.message); setImportando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2"><FolderDown size={15} className="text-torg-blue" /> Desenhos da pasta da obra</h3>
            {dados?.opFolder && <p className="text-[11px] text-torg-gray mt-0.5 truncate">{dados.opFolder} · Engenharia / Projetos</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">
          {carregando ? (
            <div className="py-10 text-center text-torg-gray text-sm"><Loader2 size={22} className="mx-auto animate-spin mb-2" /> Lendo a pasta da obra no servidor…</div>
          ) : erro && !lista.length ? (
            <p className="py-8 text-center text-sm text-red-600">{erro}</p>
          ) : !lista.length ? (
            <p className="py-8 text-center text-sm text-torg-gray">{dados?.erro || "Nenhum PDF de projeto (Montagem/Conjunto) encontrado na pasta da obra."}</p>
          ) : (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-80 overflow-y-auto">
              {lista.map((d) => (
                <label key={d.itemId} className={`flex items-center gap-2.5 px-3 py-2 text-[13px] ${d.jaImportado ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}>
                  <input type="checkbox" disabled={d.jaImportado} checked={d.jaImportado || !!sel[d.itemId]} onChange={() => toggle(d.itemId)} className="accent-torg-blue" />
                  <FileText size={15} className="text-red-500 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-torg-dark" title={d.nome}>{d.nome}</span>
                  {d.area && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-torg-blue-50 text-torg-blue">{d.area}</span>}
                  {d.jaImportado && <span className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5"><CheckCircle2 size={11} /> importado</span>}
                </label>
              ))}
            </div>
          )}
          {lista.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-torg-gray whitespace-nowrap">Adicionar ao lote:</span>
              <select value={loteId} onChange={(e) => setLoteId(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1 bg-white flex-1 min-w-0">
                <option value="">— sem lote —</option>
                {lotes.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          )}
          {erro && lista.length > 0 && <p className="text-xs text-red-600 mt-2 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 rounded-b-xl">
          <span className="text-[11px] text-torg-gray">{marcados.length} selecionado{marcados.length === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100">Cancelar</button>
            <button onClick={importar} disabled={importando || !marcados.length} className="px-4 py-1.5 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">{importando ? <Loader2 size={14} className="animate-spin" /> : <FolderDown size={14} />} Trazer {marcados.length || ""}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
