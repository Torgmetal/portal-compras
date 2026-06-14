"use client";
import { useState, useEffect, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import {
  Loader2, AlertCircle, RefreshCw, Plus, Search, ShieldCheck, ShieldAlert,
  AlertTriangle, FileText, Eye, Download, Pencil, Trash2, X, Check, CircleSlash, Clock,
  FileSpreadsheet, Upload,
} from "lucide-react";
import { CATEGORIAS_QUALIDADE, CATEGORIA_LABEL, STATUS_COR } from "@/lib/qualidade-status";

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const fmtTam = (b) => (!b ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const STATUS_FILTROS = [
  { key: "", label: "Todos" },
  { key: "VENCIDO", label: "Vencidos" },
  { key: "VENCENDO", label: "Vencendo" },
  { key: "VIGENTE", label: "Vigentes" },
  { key: "SEM_VALIDADE", label: "Sem validade" },
];

const VAZIO = {
  nome: "", categoria: "EQUIPAMENTOS", tipo: "", norma: "", vinculo: "", opNumero: "",
  numeroCorrida: "", dataEmissao: "", dataValidade: "", responsavel: "", observacao: "",
};

export default function QualidadeClient() {
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [validado, setValidado] = useState("");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState(null); // { ...doc } para editar, ou {} para novo
  const [importar, setImportar] = useState(false);
  const [acaoId, setAcaoId] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const p = new URLSearchParams();
      if (cat) p.set("categoria", cat);
      if (status) p.set("status", status);
      if (validado) p.set("validado", validado);
      if (busca.trim()) p.set("busca", busca.trim());
      const res = await fetch(`/api/qualidade/documentos?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao carregar");
      setDocs(json.data || []);
      setStats(json.stats || null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [cat, status, validado, busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 300 : 0); // debounce na busca
    return () => clearTimeout(t);
  }, [carregar, busca]);

  async function toggleValidado(doc) {
    setAcaoId(doc.id);
    try {
      const res = await fetch(`/api/qualidade/documentos/${doc.id}/validar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validado: !doc.validado }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, validado: !doc.validado } : d)));
      setStats((s) => s && { ...s, naoValidados: s.naoValidados + (doc.validado ? 1 : -1) });
    } catch (e) {
      alert("Erro: " + e.message);
    } finally {
      setAcaoId(null);
    }
  }

  async function excluir(doc) {
    if (!confirm(`Excluir o documento "${doc.nome}"? (a cópia no SharePoint é preservada)`)) return;
    setAcaoId(doc.id);
    try {
      const res = await fetch(`/api/qualidade/documentos/${doc.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro");
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (e) {
      alert("Erro: " + e.message);
    } finally {
      setAcaoId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-torg-dark flex items-center gap-2">
            <ShieldCheck size={20} className="text-violet-700" /> Controle de Documentos
          </h1>
          <p className="text-xs text-torg-gray mt-0.5">
            Documentos amarrados a norma + validade. O status (vigente / vencendo / vencido) é calculado automaticamente. <span className="text-torg-gray/80">Padrão NBR 16775.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setImportar(true)}
            className="text-sm font-semibold text-violet-700 border border-violet-300 hover:bg-violet-50 px-3 py-2 rounded-lg inline-flex items-center gap-2">
            <FileSpreadsheet size={15} /> Importar (CMR)
          </button>
          <button onClick={() => setModal({ ...VAZIO })}
            className="text-sm font-semibold text-white bg-violet-700 hover:bg-violet-800 px-4 py-2 rounded-lg inline-flex items-center gap-2">
            <Plus size={15} /> Novo documento
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <KpiCard label="Vencidos" valor={stats.vencidos} cor="text-red-700 bg-red-50" Icon={ShieldAlert} ativo={status === "VENCIDO"} onClick={() => setStatus(status === "VENCIDO" ? "" : "VENCIDO")} />
          <KpiCard label="Vencendo (≤30d)" valor={stats.vencendo} cor="text-amber-700 bg-amber-50" Icon={AlertTriangle} ativo={status === "VENCENDO"} onClick={() => setStatus(status === "VENCENDO" ? "" : "VENCENDO")} />
          <KpiCard label="A validar" valor={stats.naoValidados} cor="text-blue-700 bg-blue-50" Icon={Clock} ativo={validado === "false"} onClick={() => setValidado(validado === "false" ? "" : "false")} />
          <KpiCard label="Vigentes" valor={stats.vigentes} cor="text-emerald-700 bg-emerald-50" Icon={ShieldCheck} ativo={status === "VIGENTE"} onClick={() => setStatus(status === "VIGENTE" ? "" : "VIGENTE")} />
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 mb-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip ativo={!cat} onClick={() => setCat("")}>Todas</Chip>
          {CATEGORIAS_QUALIDADE.map((c) => (
            <Chip key={c.value} ativo={cat === c.value} onClick={() => setCat(cat === c.value ? "" : c.value)}>{c.label}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-2.5 top-2.5 text-torg-gray" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, norma, vínculo, corrida…"
              className="w-full pl-8 pr-2 py-1.5 text-[13px] border border-gray-200 rounded-lg focus:border-violet-500 focus:ring-1 focus:ring-violet-300" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5">
            {STATUS_FILTROS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={validado} onChange={(e) => setValidado(e.target.value)} className="text-[13px] border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="">Validação: todas</option>
            <option value="true">Validados</option>
            <option value="false">A validar</option>
          </select>
          <button onClick={carregar} disabled={loading} className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      </div>

      {/* Tabela / estados */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-torg-gray"><Loader2 size={26} className="animate-spin mb-3" /><p className="text-sm">Carregando documentos…</p></div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-16 text-center"><AlertCircle size={26} className="text-red-500 mb-3" /><p className="text-sm text-torg-dark mb-3">{erro}</p><button onClick={carregar} className="text-xs text-torg-blue hover:underline">Tentar novamente</button></div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center text-torg-gray">
          <FileText size={32} className="mb-3 opacity-40" />
          <p className="text-sm font-medium text-torg-dark">Nenhum documento</p>
          <p className="text-xs mt-1">Clique em “Novo documento” para subir o primeiro certificado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50/60">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-2 font-medium">Documento</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Vínculo</th>
                <th className="px-3 py-2 font-medium">Norma</th>
                <th className="px-3 py-2 font-medium">Validade</th>
                <th className="px-3 py-2 font-medium text-center">Status</th>
                <th className="px-3 py-2 font-medium text-center">Validado</th>
                <th className="px-3 py-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {docs.map((d) => (
                <tr key={d.id} className={`hover:bg-gray-50/50 ${d.status === "VENCIDO" ? "bg-red-50/40" : d.status === "VENCENDO" ? "bg-amber-50/30" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-torg-dark">{d.nome}</div>
                    <div className="text-[11px] text-torg-gray flex items-center gap-1.5">
                      {d.tipo || "—"}
                      {d.numeroCorrida && <span className="text-violet-700 font-mono">· corrida {d.numeroCorrida}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2"><span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-torg-gray">{CATEGORIA_LABEL[d.categoria] || d.categoria}</span></td>
                  <td className="px-3 py-2 text-torg-gray max-w-[160px] truncate" title={d.vinculo || d.opNumero || ""}>{d.vinculo || d.opNumero || "—"}</td>
                  <td className="px-3 py-2 text-torg-gray">{d.norma || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-torg-gray">{fmtData(d.dataValidade)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_COR[d.status]}`}>{d.statusLabel}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => toggleValidado(d)} disabled={acaoId === d.id}
                      title={d.validado ? "Validado — clique para desfazer" : "Marcar como validado"}
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 disabled:opacity-50 ${d.validado ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                      {acaoId === d.id ? <Loader2 size={10} className="animate-spin" /> : d.validado ? <Check size={10} /> : <CircleSlash size={10} />}
                      {d.validado ? "Validado" : "A validar"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {d.temArquivo && (
                        <>
                          <a href={`/api/qualidade/documentos/${d.id}/download?inline=1`} target="_blank" rel="noreferrer" title="Visualizar" className="p-1.5 text-torg-gray hover:text-torg-blue rounded hover:bg-gray-100"><Eye size={15} /></a>
                          <a href={`/api/qualidade/documentos/${d.id}/download`} title="Baixar" className="p-1.5 text-torg-gray hover:text-torg-blue rounded hover:bg-gray-100"><Download size={15} /></a>
                        </>
                      )}
                      <button onClick={() => setModal({ ...d, dataEmissao: d.dataEmissao?.slice(0, 10) || "", dataValidade: d.dataValidade?.slice(0, 10) || "" })} title="Editar" className="p-1.5 text-torg-gray hover:text-torg-blue rounded hover:bg-gray-100"><Pencil size={15} /></button>
                      <button onClick={() => excluir(d)} disabled={acaoId === d.id} title="Excluir" className="p-1.5 text-torg-gray hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <ModalDocumento doc={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); carregar(); }} />}
      {importar && <ModalImportar onClose={() => setImportar(false)} onImported={() => { setImportar(false); carregar(); }} />}
    </div>
  );
}

function ModalImportar({ onClose, onImported }) {
  const [url, setUrl] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [preview, setPreview] = useState(null);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function previsualizar() {
    setErro(""); setPreview(null); setResultado(null);
    if (!url.trim()) { setErro("Cole o link de compartilhamento do CMR."); return; }
    setCarregando(true);
    try {
      const res = await fetch(`/api/qualidade/documentos/importar?url=${encodeURIComponent(url.trim())}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao ler a planilha");
      setPreview(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmar() {
    setErro(""); setImportando(true);
    try {
      const res = await fetch("/api/qualidade/documentos/importar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Erro ao importar");
      setResultado(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-torg-dark flex items-center gap-1.5"><FileSpreadsheet size={15} className="text-violet-700" /> Importar do CMR (rastreabilidade)</p>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-4 py-3 overflow-y-auto space-y-3">
          {!resultado && (
            <>
              <label className="block">
                <span className="text-[10px] font-medium text-torg-gray uppercase">Link de compartilhamento do CMR (SharePoint)</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…sharepoint.com/:x:/s/TorgMetal/…"
                  className="mt-1 w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-violet-500 focus:ring-1 focus:ring-violet-300" />
                <span className="text-[10px] text-torg-gray">Lê a aba do ano, detecta as colunas pelo cabeçalho e valida a corrida. Nada é gravado até você confirmar.</span>
              </label>
              <button onClick={previsualizar} disabled={carregando} className="text-[12px] font-semibold text-violet-700 border border-violet-300 hover:bg-violet-50 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50">
                {carregando ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Pré-visualizar
              </button>

              {preview && (
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  <p className="text-[11px] text-torg-gray"><strong className="text-torg-dark">{preview.arquivo}</strong> · aba {preview.sheet}</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Mini label="Linhas" v={preview.resumo.total} />
                    <Mini label="Novos" v={preview.resumo.novos} cor="text-violet-700" />
                    <Mini label="Já importados" v={preview.resumo.jaImportados} cor="text-torg-gray" />
                    <Mini label="Sem corrida" v={preview.resumo.semCorrida} cor={preview.resumo.semCorrida ? "text-amber-700" : "text-emerald-700"} />
                  </div>
                  {preview.resumo.semCorrida > 0 && (
                    <p className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle size={12} /> {preview.resumo.semCorrida} linha(s) sem corrida — serão importadas, mas travam a Seção 04 do data book até corrigir na origem.</p>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-[11px]">
                      <thead className="bg-gray-50/60 text-gray-500"><tr>
                        <th className="px-2 py-1 text-left">Material</th><th className="px-2 py-1 text-left">Corrida</th><th className="px-2 py-1 text-left">Norma</th><th className="px-2 py-1 text-left">OP</th><th className="px-2 py-1 text-left">Fornecedor</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {preview.amostra.map((l) => (
                          <tr key={l.linha}>
                            <td className="px-2 py-1 max-w-[200px] truncate" title={l.nome}>{l.nome}</td>
                            <td className="px-2 py-1 font-mono">{l.numeroCorrida || <span className="text-amber-700">—</span>}</td>
                            <td className="px-2 py-1">{l.norma || "—"}</td>
                            <td className="px-2 py-1">{l.opNumero || "—"}</td>
                            <td className="px-2 py-1">{l.fornecedor || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-torg-gray">Mostrando {preview.amostra.length} de {preview.resumo.total}. Categoria: <strong>Material</strong>. Origem: importação.</p>
                </div>
              )}
            </>
          )}

          {resultado && (
            <div className="text-center py-4">
              <Check size={28} className="text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-torg-dark">Importação concluída</p>
              <p className="text-[12px] text-torg-gray mt-1">
                {resultado.criados} novo(s) documento(s) criado(s) · {resultado.jaExistiam} já existia(m){resultado.semIndice ? ` · ${resultado.semIndice} sem índice (ignorado)` : ""}.
              </p>
            </div>
          )}

          {erro && <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {erro}</p>}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          {resultado ? (
            <button onClick={onImported} className="px-3 py-1.5 text-[12px] font-semibold text-white bg-violet-700 rounded-lg hover:bg-violet-800">Concluir</button>
          ) : (
            <>
              <button onClick={onClose} disabled={importando} className="px-3 py-1.5 text-[12px] text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
              <button onClick={confirmar} disabled={importando || !preview || preview.resumo.novos === 0}
                className="px-3 py-1.5 text-[12px] font-semibold text-white bg-violet-700 rounded-lg hover:bg-violet-800 disabled:opacity-50 inline-flex items-center gap-1.5">
                {importando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Importar {preview ? `${preview.resumo.novos} novo(s)` : ""}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, v, cor = "text-torg-dark" }) {
  return (
    <div className="bg-gray-50 rounded-lg py-2">
      <p className={`text-lg font-bold ${cor}`}>{v}</p>
      <p className="text-[9px] text-torg-gray uppercase">{label}</p>
    </div>
  );
}

function KpiCard({ label, valor, cor, Icon, ativo, onClick }) {
  return (
    <button onClick={onClick} className={`text-left rounded-xl border p-3 transition-shadow hover:shadow-sm ${ativo ? "border-violet-400 ring-1 ring-violet-200" : "border-gray-100"} bg-white`}>
      <div className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${cor}`}><Icon size={12} /> {label}</div>
      <p className="text-2xl font-bold text-torg-dark mt-1.5">{valor}</p>
    </button>
  );
}

function Chip({ ativo, onClick, children }) {
  return (
    <button onClick={onClick} className={`text-[12px] px-2.5 py-1 rounded-lg font-medium transition-colors ${ativo ? "bg-violet-700 text-white" : "bg-gray-100 text-torg-gray hover:bg-gray-200"}`}>{children}</button>
  );
}

function ModalDocumento({ doc, onClose, onSaved }) {
  const editando = !!doc.id;
  const [form, setForm] = useState(doc);
  const [file, setFile] = useState(null);
  const [pct, setPct] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  async function salvar() {
    setErro("");
    if (!form.nome || form.nome.trim().length < 2) { setErro("Informe o nome do documento."); return; }
    setSalvando(true);
    try {
      let arquivo = {};
      if (file) {
        const safe = String(file.name || "arquivo").replace(/[^\w.\- ]/g, "_").slice(0, 100);
        const blob = await upload(`qualidade-docs/${Date.now()}-${safe}`, file, {
          access: "public",
          handleUploadUrl: "/api/qualidade/documentos/upload-token",
          onUploadProgress: (p) => setPct(Math.round(p.percentage)),
        });
        arquivo = { arquivoUrl: blob.url, arquivoNome: file.name, arquivoTamanho: file.size, arquivoTipo: file.type || "application/octet-stream" };
      }
      const payload = {
        nome: form.nome, categoria: form.categoria, tipo: form.tipo || null, norma: form.norma || null,
        vinculo: form.vinculo || null, opNumero: form.opNumero || null, numeroCorrida: form.numeroCorrida || null,
        dataEmissao: form.dataEmissao || null, dataValidade: form.dataValidade || null,
        responsavel: form.responsavel || null, observacao: form.observacao || null, ...arquivo,
      };
      const url = editando ? `/api/qualidade/documentos/${doc.id}` : "/api/qualidade/documentos";
      const res = await fetch(url, { method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.error || "Erro ao salvar");
      if (json.backup && json.backup.ok === false && (file || !editando)) {
        alert("Documento salvo, mas a cópia de backup no SharePoint falhou: " + (json.backup.erro || "erro") + "\n(O documento foi gravado normalmente.)");
      }
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    } finally {
      setPct(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-bold text-torg-dark flex items-center gap-1.5"><FileText size={15} className="text-violet-700" /> {editando ? "Editar documento" : "Novo documento"}</p>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-4 py-3 overflow-y-auto space-y-3">
          {/* Arquivo */}
          <div className="rounded-lg border border-dashed border-gray-300 p-3">
            <label className="text-[11px] font-semibold text-torg-gray uppercase">Arquivo (scan PDF / imagem){editando ? " — opcional (troca o atual)" : ""}</label>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full text-[12px] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-violet-50 file:text-violet-700 file:font-medium hover:file:bg-violet-100" />
            {file && <p className="text-[11px] text-torg-gray mt-1">{file.name} · {fmtTam(file.size)}</p>}
            {editando && doc.temArquivo && !file && <p className="text-[11px] text-emerald-700 mt-1">Já possui arquivo anexado.</p>}
            {pct != null && (
              <div className="mt-2"><div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${pct}%` }} /></div><p className="text-[10px] text-torg-gray mt-0.5">Enviando arquivo… {pct}%</p></div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nome do documento *" full><input value={form.nome} onChange={(e) => set("nome", e.target.value)} className={inp} placeholder="ex.: MTC chapa A36 — corrida 45219" /></Campo>
            <Campo label="Categoria *"><select value={form.categoria} onChange={(e) => set("categoria", e.target.value)} className={inp}>{CATEGORIAS_QUALIDADE.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></Campo>
            <Campo label="Tipo"><input value={form.tipo || ""} onChange={(e) => set("tipo", e.target.value)} className={inp} placeholder="MTC · ASO · Calibração · WPS" /></Campo>
            <Campo label="Norma"><input value={form.norma || ""} onChange={(e) => set("norma", e.target.value)} className={inp} placeholder="AWS D1.1 · NR-35 · ISO 2808" /></Campo>
            <Campo label="Nº da corrida (heat)"><input value={form.numeroCorrida || ""} onChange={(e) => set("numeroCorrida", e.target.value)} className={inp} placeholder="só p/ certificado de material" /></Campo>
            <Campo label="Vínculo (livre)"><input value={form.vinculo || ""} onChange={(e) => set("vinculo", e.target.value)} className={inp} placeholder="OP-083 · Soldador João · Munck 01" /></Campo>
            <Campo label="OP (vínculo p/ data book)"><input value={form.opNumero || ""} onChange={(e) => set("opNumero", e.target.value)} className={inp} placeholder="ex.: 083" /></Campo>
            <Campo label="Data de emissão"><input type="date" value={form.dataEmissao || ""} onChange={(e) => set("dataEmissao", e.target.value)} className={inp} /></Campo>
            <Campo label="Data de validade"><input type="date" value={form.dataValidade || ""} onChange={(e) => set("dataValidade", e.target.value)} className={inp} /></Campo>
            <Campo label="Responsável"><input value={form.responsavel || ""} onChange={(e) => set("responsavel", e.target.value)} className={inp} placeholder="quem registrou / emitiu" /></Campo>
            <Campo label="Observação" full><textarea value={form.observacao || ""} onChange={(e) => set("observacao", e.target.value)} rows={2} className={inp} /></Campo>
          </div>

          {erro && <p className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle size={12} /> {erro}</p>}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={salvando} className="px-3 py-1.5 text-[12px] text-torg-gray hover:text-torg-dark rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-3 py-1.5 text-[12px] font-semibold text-white bg-violet-700 rounded-lg hover:bg-violet-800 disabled:opacity-50 inline-flex items-center gap-1.5">
            {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {editando ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "mt-1 w-full px-2 py-1.5 text-[12px] border border-gray-200 rounded-lg focus:border-violet-500 focus:ring-1 focus:ring-violet-300";

function Campo({ label, children, full }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] font-medium text-torg-gray uppercase">{label}</span>
      {children}
    </label>
  );
}
