"use client";
import { useState, useEffect, useCallback } from "react";
import { FolderTree, Folder, FileText, FileSpreadsheet, FileImage, ChevronRight, ExternalLink, Loader2, AlertCircle, Home, Share2, Copy, Trash2, Check, X, CalendarClock } from "lucide-react";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const fmtTam = (n) => {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
const RECENTE_DIAS = 14;
const ehRecente = (d) => d && (Date.now() - new Date(d).getTime()) / 86400000 <= RECENTE_DIAS;
const iconeArquivo = (nome) => {
  const e = (nome.split(".").pop() || "").toLowerCase();
  if (["xlsx", "xls", "csv", "xlsm"].includes(e)) return FileSpreadsheet;
  if (["png", "jpg", "jpeg", "webp", "gif", "vsdm", "vsd"].includes(e)) return FileImage;
  return FileText;
};

export default function SgqClient() {
  const [path, setPath] = useState("");
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [compartilhar, setCompartilhar] = useState(false);

  const carregar = useCallback((p) => {
    setCarregando(true); setErro("");
    fetch(`/api/qualidade/sgq?path=${encodeURIComponent(p)}`)
      .then((r) => r.json())
      .then((j) => { if (j.error) setErro(j.error); else { setDados(j); if (j.erro) setErro(j.erro); } })
      .catch(() => setErro("Erro ao carregar"))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(() => { carregar(path); }, [path, carregar]);

  const segmentos = path ? path.split("/") : [];
  const irPara = (i) => setPath(segmentos.slice(0, i + 1).join("/"));
  const itens = dados?.itens || [];
  const pastas = itens.filter((i) => i.tipo === "folder");
  const arquivos = itens.filter((i) => i.tipo === "file");

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-torg-dark flex items-center gap-2"><FolderTree size={22} className="text-torg-blue" /> Documentos do SGQ</h1>
          <p className="text-sm text-torg-gray mt-1">Consulta dos documentos do Sistema de Gestão da Qualidade (ISO 9001) que ficam no servidor. Somente leitura — a <strong>edição continua no servidor</strong>; aqui reflete as alterações.</p>
        </div>
        <button onClick={() => setCompartilhar(true)} className="px-3.5 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 shrink-0">
          <Share2 size={15} /> Compartilhar externo
        </button>
      </div>
      {compartilhar && <CompartilharModal onClose={() => setCompartilhar(false)} />}

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap text-sm">
        <button onClick={() => setPath("")} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-torg-blue-50 ${path === "" ? "text-torg-blue font-semibold" : "text-torg-gray"}`}>
          <Home size={14} /> SGQ ISO 9001
        </button>
        {segmentos.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight size={13} className="text-gray-300" />
            <button onClick={() => irPara(i)} className={`px-2 py-1 rounded-lg hover:bg-torg-blue-50 ${i === segmentos.length - 1 ? "text-torg-dark font-semibold" : "text-torg-gray"}`}>{s}</button>
          </span>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {carregando ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin" /></div>
        ) : erro ? (
          <div className="py-12 text-center text-red-600 text-sm inline-flex items-center gap-2 justify-center w-full"><AlertCircle size={16} /> {erro}</div>
        ) : itens.length === 0 ? (
          <div className="py-16 text-center text-torg-gray text-sm">Pasta vazia.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pastas.map((it) => (
              <button key={it.nome} onClick={() => setPath(path ? `${path}/${it.nome}` : it.nome)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 text-left transition-colors">
                <Folder size={18} className="text-torg-blue shrink-0" />
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-torg-dark">{it.nome}</span>
                {it.filhos != null && <span className="text-[11px] text-torg-gray tabular-nums">{it.filhos} {it.filhos === 1 ? "item" : "itens"}</span>}
                <ChevronRight size={16} className="text-gray-300 shrink-0" />
              </button>
            ))}
            {arquivos.map((it) => {
              const Ic = iconeArquivo(it.nome);
              return (
                <a key={it.nome} href={it.webUrl || "#"} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors group">
                  <Ic size={18} className="text-torg-gray shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-sm text-torg-dark">{it.nome}</span>
                  {ehRecente(it.modificado) && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0">atualizado</span>}
                  <span className="text-[11px] text-torg-gray tabular-nums whitespace-nowrap w-20 text-right hidden sm:inline">{fmtD(it.modificado)}</span>
                  <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap w-16 text-right hidden md:inline">{fmtTam(it.tamanho)}</span>
                  <ExternalLink size={14} className="text-gray-300 group-hover:text-torg-blue shrink-0" />
                </a>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[11px] text-torg-gray">Clique numa pasta para navegar, ou num documento para abri-lo no servidor (SharePoint). Documentos alterados nos últimos {RECENTE_DIAS} dias aparecem com <span className="text-emerald-700 font-semibold">atualizado</span>.</p>
    </div>
  );
}

function CompartilharModal({ onClose }) {
  const [shares, setShares] = useState(null);
  const [pastasDisp, setPastasDisp] = useState([]);
  const [nome, setNome] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [validade, setValidade] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState("");

  const carregarShares = () => fetch("/api/qualidade/sgq/compartilhar").then((r) => r.json()).then((j) => setShares(j.shares || [])).catch(() => setShares([]));
  useEffect(() => {
    carregarShares();
    fetch("/api/qualidade/sgq?path=").then((r) => r.json()).then((j) => setPastasDisp((j.itens || []).filter((i) => i.tipo === "folder").map((i) => i.nome))).catch(() => {});
  }, []);

  const toggle = (p) => setSel((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const linkDe = (t) => (typeof window !== "undefined" ? `${window.location.origin}/sgq/${t}` : `/sgq/${t}`);
  const copiar = (t) => { navigator.clipboard?.writeText(linkDe(t)); setCopiado(t); setTimeout(() => setCopiado(""), 1500); };

  async function criar() {
    if (nome.trim().length < 2) return setErro("Dê um nome ao link (ex.: Auditor BVQI).");
    if (!sel.size) return setErro("Selecione ao menos uma pasta.");
    setErro(""); setCriando(true);
    try {
      const r = await fetch("/api/qualidade/sgq/compartilhar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nome.trim(), pastas: [...sel], expiraEm: validade || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao criar");
      setNome(""); setSel(new Set()); setValidade(""); carregarShares();
    } catch (e) { setErro(e.message); } finally { setCriando(false); }
  }
  async function revogar(id) {
    if (!confirm("Revogar este link? Ele para de funcionar na hora.")) return;
    await fetch(`/api/qualidade/sgq/compartilhar?id=${id}`, { method: "DELETE" });
    carregarShares();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-torg-dark inline-flex items-center gap-2"><Share2 size={16} className="text-torg-blue" /> Compartilhar documentos com externo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3 border-b border-gray-100">
          <p className="text-[12px] text-torg-gray">Gera um link para alguém de fora consultar (só leitura, só PDFs) as pastas que você escolher. Dá pra definir validade e revogar quando quiser.</p>
          <div>
            <label className="block text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Para quem / referência</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Auditor BVQI — Surveillance 1" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Pastas liberadas</label>
            <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
              {pastasDisp.length === 0 ? (
                <p className="text-xs text-torg-gray p-3">Carregando pastas…</p>
              ) : pastasDisp.map((p) => (
                <label key={p} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={sel.has(p)} onChange={() => toggle(p)} className="accent-torg-blue" />
                  <Folder size={14} className="text-torg-blue" /> {p}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-1">Validade <span className="font-normal normal-case">— opcional</span></label>
              <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-torg-blue/30" />
            </div>
            <button onClick={criar} disabled={criando} className="px-4 py-2 bg-torg-blue text-white text-sm rounded-lg hover:bg-torg-dark font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
              {criando ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Gerar link
            </button>
          </div>
          {erro && <p className="text-xs text-red-600 inline-flex items-center gap-1"><AlertCircle size={13} /> {erro}</p>}
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold text-torg-gray uppercase tracking-wide mb-2">Links ativos</p>
          {shares === null ? (
            <div className="py-6 text-center text-torg-gray"><Loader2 size={18} className="mx-auto animate-spin" /></div>
          ) : shares.length === 0 ? (
            <p className="text-xs text-torg-gray py-2">Nenhum link criado ainda.</p>
          ) : (
            <div className="space-y-2">
              {shares.map((s) => {
                const expirado = s.expiraEm && new Date(s.expiraEm) < new Date();
                return (
                  <div key={s.id} className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-torg-dark">{s.nome}</span>
                      {expirado
                        ? <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">expirado</span>
                        : s.expiraEm && <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1"><CalendarClock size={10} /> até {fmtD(s.expiraEm)}</span>}
                      <span className="text-[11px] text-torg-gray">{(s.pastas || []).length} pasta(s) · {s.acessos || 0} acesso(s)</span>
                      <button onClick={() => revogar(s.id)} className="ml-auto text-torg-gray hover:text-red-600 inline-flex items-center gap-1 text-xs" title="Revogar"><Trash2 size={13} /> Revogar</button>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input readOnly value={linkDe(s.token)} className="flex-1 min-w-0 text-[12px] text-torg-gray bg-gray-50 border border-gray-200 rounded px-2 py-1 truncate" />
                      <button onClick={() => copiar(s.token)} className="text-xs text-torg-blue hover:text-torg-dark inline-flex items-center gap-1 shrink-0">
                        {copiado === s.token ? <><Check size={13} /> copiado</> : <><Copy size={13} /> copiar</>}
                      </button>
                    </div>
                    <p className="text-[10px] text-torg-gray mt-1 truncate">{(s.pastas || []).join(" · ")}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
