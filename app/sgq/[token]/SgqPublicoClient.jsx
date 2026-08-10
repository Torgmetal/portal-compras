"use client";
import { useState, useEffect, useCallback } from "react";
import { Folder, FileText, ChevronRight, Home, Loader2, ShieldCheck, Lock } from "lucide-react";

const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const fmtTam = (n) => {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default function SgqPublicoClient({ token }) {
  const [path, setPath] = useState("");
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback((p) => {
    setCarregando(true); setErro("");
    fetch(`/api/sgq-publico/${token}?path=${encodeURIComponent(p)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => { if (!ok || j.error) setErro(j.error || "Não foi possível carregar."); else { setDados(j); if (j.erro) setErro(j.erro); } })
      .catch(() => setErro("Erro de conexão."))
      .finally(() => setCarregando(false));
  }, [token]);
  useEffect(() => { carregar(path); }, [path, carregar]);

  const segmentos = path ? path.split("/") : [];
  const itens = dados?.itens || [];
  const pastas = itens.filter((i) => i.tipo === "folder");
  const arquivos = itens.filter((i) => i.tipo === "file");
  const tokenInvalido = erro && !dados;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Cabeçalho navy padrão Torg */}
      <header className="bg-[#0D1F3C] text-white">
        <div className="max-w-3xl mx-auto px-5 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#F4801F] grid place-items-center font-extrabold text-white shrink-0">T</div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-white/60">Torg Metal · Qualidade</p>
            <h1 className="text-lg font-bold truncate">Documentos do SGQ{dados?.nome ? ` — ${dados.nome}` : ""}</h1>
          </div>
        </div>
        <div className="h-1 bg-[#F4801F]" />
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {tokenInvalido ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
            <Lock size={30} className="mx-auto text-gray-300 mb-3" />
            <p className="font-semibold text-torg-dark">{erro}</p>
            <p className="text-sm text-torg-gray mt-1">O link pode ter expirado ou sido revogado. Peça um novo à equipe da Qualidade da Torg Metal.</p>
          </div>
        ) : (
          <>
            <p className="text-[12px] text-torg-gray mb-3 inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-600" /> Acesso somente leitura às pastas liberadas. Documentos em PDF.</p>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 flex-wrap text-sm mb-3">
              <button onClick={() => setPath("")} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 ${path === "" ? "text-torg-blue font-semibold" : "text-torg-gray"}`}>
                <Home size={14} /> Início
              </button>
              {segmentos.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <ChevronRight size={13} className="text-gray-300" />
                  <button onClick={() => setPath(segmentos.slice(0, i + 1).join("/"))} className={`px-2 py-1 rounded-lg hover:bg-gray-100 ${i === segmentos.length - 1 ? "text-torg-dark font-semibold" : "text-torg-gray"}`}>{s}</button>
                </span>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {carregando ? (
                <div className="py-16 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin" /></div>
              ) : itens.length === 0 ? (
                <div className="py-16 text-center text-torg-gray text-sm">{erro || "Nenhum documento nesta pasta."}</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {pastas.map((it) => (
                    <button key={it.caminho} onClick={() => setPath(it.caminho)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 text-left transition-colors">
                      <Folder size={18} className="text-torg-blue shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm font-medium text-torg-dark">{it.nome}</span>
                      <ChevronRight size={16} className="text-gray-300 shrink-0" />
                    </button>
                  ))}
                  {arquivos.map((it) => (
                    <a key={it.caminho} href={`/api/sgq-publico/${token}/download?path=${encodeURIComponent(it.caminho)}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/70 transition-colors group">
                      <FileText size={18} className="text-red-500 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm text-torg-dark">{it.nome.replace(/\.pdf$/i, "")}</span>
                      <span className="text-[11px] text-torg-gray tabular-nums whitespace-nowrap hidden sm:inline">{fmtD(it.modificado)}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap hidden md:inline">{fmtTam(it.tamanho)}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-torg-gray mt-4 text-center">Torg Metal · Sistema de Gestão da Qualidade (ISO 9001) · documentos controlados</p>
          </>
        )}
      </main>
    </div>
  );
}
