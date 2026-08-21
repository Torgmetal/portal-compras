"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, Folder, FileText, ChevronRight, Home, Check, AlertTriangle, X } from "lucide-react";

const fmtKb = (n) => (n ? `${Math.round(n / 1024).toLocaleString("pt-BR")} KB` : "");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "");

/**
 * NAVEGADOR DA PASTA DO SERVIDOR — escolher arquivo por arquivo.
 *
 * Vitor (19/08/2026), repetido em quase toda seção: "deixar navegar na pasta e selecionar os
 * arquivos que quero colocar", "deixe eu selecionar qual eu quero anexar".
 *
 * O que existia era um botão que puxava a pasta inteira. Serve pra desenho, onde tudo da OP entra;
 * não serve pra qualificação de soldador, EPS ou calibração — ali entram só os que aquela obra
 * usou, e trazer tudo enche o data book de documento que não é dele.
 */
export default function NavegadorServidor({ secaoId, titulo, onFechar, onAnexado }) {
  const [dados, setDados] = useState(null);
  const [path, setPath] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sel, setSel] = useState(new Set());
  const [anexando, setAnexando] = useState(false);

  const carregar = useCallback((p) => {
    setLoading(true); setErro("");
    fetch(`/api/qualidade/data-books/secao/${secaoId}/navegar${p ? `?path=${encodeURIComponent(p)}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then((j) => { setDados(j); setPath(j.path || p || null); })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [secaoId]);

  useEffect(() => { carregar(null); }, [carregar]);

  const raiz = dados?.fontes?.find((f) => path === f.path || (path || "").startsWith(`${f.path}/`));
  // trilha só dentro da fonte — não expõe o caminho da empresa inteiro
  const trilha = raiz && path && path !== raiz.path
    ? path.slice(raiz.path.length + 1).split("/").map((nome, i, arr) => ({ nome, path: `${raiz.path}/${arr.slice(0, i + 1).join("/")}` }))
    : [];

  const anexar = async () => {
    const escolhidos = (dados?.arquivos || []).filter((a) => sel.has(a.id));
    if (!escolhidos.length) return;
    setAnexando(true);
    try {
      const res = await fetch(`/api/qualidade/data-books/secao/${secaoId}/navegar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivos: escolhidos.map((a) => ({ id: a.id, nome: a.nome, url: a.url })) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro");
      onAnexado?.(j);
      onFechar?.();
    } catch (e) { alert(e.message); } finally { setAnexando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-torg-dark">Anexar do servidor — {titulo}</p>
            <p className="text-[11px] text-torg-gray">Escolha os arquivos. O portal aponta pro arquivo no SharePoint, sem copiar.</p>
          </div>
          <button onClick={onFechar} className="text-torg-gray hover:text-torg-dark shrink-0"><X size={18} /></button>
        </div>

        {/* fontes (quando a seção tem mais de uma pasta) + trilha */}
        <div className="px-5 py-2 border-b border-gray-100 flex flex-wrap items-center gap-1.5 text-[11px]">
          {(dados?.fontes || []).map((f) => (
            <button key={f.path} onClick={() => { setSel(new Set()); carregar(f.path); }}
              className={`px-2 py-1 rounded-lg border inline-flex items-center gap-1 ${
                raiz?.path === f.path ? "bg-torg-blue text-white border-torg-blue" : "text-torg-blue border-torg-blue-200 hover:bg-torg-blue-50"
              }`}>
              <Home size={11} /> {f.label}
            </button>
          ))}
          {trilha.map((t) => (
            <span key={t.path} className="inline-flex items-center gap-1 text-torg-gray">
              <ChevronRight size={11} />
              <button onClick={() => { setSel(new Set()); carregar(t.path); }} className="hover:text-torg-blue">{t.nome}</button>
            </span>
          ))}
        </div>

        {dados?.erros?.length > 0 && (
          <div className="mx-5 mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{dados.erros.join(" · ")}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading && <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> abrindo…</p>}
          {erro && !loading && <p className="text-[12px] text-red-600">{erro}</p>}
          {!loading && !erro && (
            <>
              {(dados?.pastas || []).map((p) => (
                <button key={p.path} onClick={() => { setSel(new Set()); carregar(p.path); }}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 flex items-center gap-2 text-[12px]">
                  <Folder size={13} className="text-torg-blue shrink-0" />
                  <span className="text-torg-dark">{p.nome}</span>
                  <ChevronRight size={12} className="ml-auto text-torg-gray" />
                </button>
              ))}
              {(dados?.arquivos || []).map((a) => (
                <label key={a.id} className="w-full px-2 py-1.5 rounded hover:bg-gray-50 flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={sel.has(a.id)}
                    onChange={() => setSel((prev) => { const n = new Set(prev); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} />
                  <FileText size={13} className="text-torg-gray shrink-0" />
                  <span className="text-torg-dark min-w-0 truncate">{a.nome}</span>
                  <span className="ml-auto text-[10px] text-torg-gray whitespace-nowrap">{fmtData(a.modificadoEm)} {fmtKb(a.tamanho)}</span>
                </label>
              ))}
              {!dados?.pastas?.length && !dados?.arquivos?.length && (
                <p className="text-[12px] text-torg-gray">{dados?.fontes?.length > 1 ? "Escolha uma pasta acima." : "Pasta vazia."}</p>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <span className="text-[11px] text-torg-gray">
            {sel.size ? `${sel.size} arquivo(s) selecionado(s)` : "Nenhum selecionado"}
            {dados?.arquivos?.length > 1 && (
              <button onClick={() => setSel(sel.size === dados.arquivos.length ? new Set() : new Set(dados.arquivos.map((a) => a.id)))}
                className="ml-2 text-torg-blue hover:underline">
                {sel.size === dados.arquivos.length ? "limpar" : "selecionar todos desta pasta"}
              </button>
            )}
          </span>
          <button onClick={anexar} disabled={!sel.size || anexando}
            className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
            {anexando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Anexar selecionados
          </button>
        </div>
      </div>
    </div>
  );
}
