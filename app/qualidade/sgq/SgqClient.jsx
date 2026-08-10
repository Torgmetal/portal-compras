"use client";
import { useState, useEffect, useCallback } from "react";
import { FolderTree, Folder, FileText, FileSpreadsheet, FileImage, ChevronRight, ExternalLink, Loader2, AlertCircle, Home } from "lucide-react";

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
      <div>
        <h1 className="text-2xl font-extrabold text-torg-dark flex items-center gap-2"><FolderTree size={22} className="text-torg-blue" /> Documentos do SGQ</h1>
        <p className="text-sm text-torg-gray mt-1">Consulta dos documentos do Sistema de Gestão da Qualidade (ISO 9001) que ficam no servidor. Somente leitura — a <strong>edição continua no servidor</strong>; aqui reflete as alterações.</p>
      </div>

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
