"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, FolderOpen, Check, Search, AlertCircle, RefreshCw } from "lucide-react";

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

/**
 * Escolhe, um a um, quais arquivos da pasta 2.5.5 vão para a aba Engenharia do portal.
 *
 * ⚠⚠ NADA É PUBLICADO SOZINHO. Vitor (26/08/2026): "eu preciso selecionar esses documentos — não
 * sai puxando sozinho". A 2.5.5 é a pasta de envio ao cliente, então a fonte é a certa; o conteúdo
 * dela é que não é. Medido nas obras: a OP-089 tem "Mandar nessa pasta.docx" e o logo da Torg
 * soltos; a OP-105 tem uma subpasta OBSOLETO inteira de revisões antigas. Varrer e publicar
 * mandaria isso ao cliente — e o que ele já baixou, baixou.
 */
export default function SeletorDocsEngenharia({ opNumero }) {
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/portal/engenharia-docs?opNumero=${encodeURIComponent(opNumero)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao ler a pasta");
      setDados(j);
      setSel(new Set((j.arquivos || []).filter((a) => a.escolhido).map((a) => a.id)));
      if (j.error) setErro(j.error);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [opNumero]);
  useEffect(() => { carregar(); }, [carregar]);

  const arquivos = dados?.arquivos || [];
  const t = q.trim().toLowerCase();
  const vistos = t ? arquivos.filter((a) => `${a.pasta} ${a.nome}`.toLowerCase().includes(t)) : arquivos;
  const porPasta = vistos.reduce((m, a) => { (m[a.pasta] ||= []).push(a); return m; }, {});

  async function salvar() {
    setSalvando(true); setErro(""); setAviso("");
    try {
      const docs = arquivos.filter((a) => sel.has(a.id)).map(({ id, nome, pasta, tamanho, em }) => ({ id, nome, pasta, tamanho, em }));
      const r = await fetch("/api/portal/engenharia-docs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero, docs }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setAviso(`${j.escolhidos} documento(s) publicados na aba Engenharia.`);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <p className="text-[13px] font-semibold text-torg-dark inline-flex items-center gap-1.5">
            <FolderOpen size={14} className="text-torg-blue" /> Documentos da Engenharia (pasta 2.5.5)
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Marque o que o cliente pode ver. <b>Nada é publicado sozinho</b> — a pasta tem revisão
            antiga e arquivo de trabalho, e o que o cliente baixa não tem desfazer.
          </p>
        </div>
        <button onClick={carregar} disabled={carregando}
          className="text-[11px] text-torg-gray border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
          {carregando ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} reler a pasta
        </button>
      </div>

      {erro && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {erro}</p>}

      {carregando && !dados ? (
        <p className="text-[12px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> lendo a pasta no servidor…</p>
      ) : arquivos.length === 0 ? (
        <p className="text-[12px] text-torg-gray">Nenhum arquivo na 2.5.5 desta obra.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-2 text-torg-gray" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Achar arquivo ou pasta…"
                className="w-full text-[12px] border border-gray-200 rounded-lg pl-8 pr-2 py-1.5 focus:border-torg-blue outline-none" />
            </div>
            <span className="text-[11px] text-torg-gray">
              <b className="text-torg-dark">{sel.size}</b> de {arquivos.length} escolhido(s)
            </span>
            {sel.size > 0 && <button onClick={() => setSel(new Set())} className="text-[11px] text-torg-orange hover:underline">limpar</button>}
          </div>

          <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
            {Object.entries(porPasta).map(([pasta, itens]) => {
              const todos = itens.every((a) => sel.has(a.id));
              return (
                <div key={pasta}>
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 sticky top-0">
                    <input type="checkbox" checked={todos} className="accent-torg-blue"
                      onChange={() => setSel((s) => {
                        const n = new Set(s);
                        itens.forEach((a) => (todos ? n.delete(a.id) : n.add(a.id)));
                        return n;
                      })} />
                    <span className="text-[11px] font-semibold text-torg-dark truncate">{pasta}</span>
                    <span className="text-[10px] text-torg-gray-light ml-auto">{itens.length}</span>
                  </div>
                  {itens.map((a) => {
                    const on = sel.has(a.id);
                    // ⚠ o aviso de OBSOLETO é o caso real da OP-105 — a pasta tem uma subpasta
                    // inteira de revisão antiga, e publicar aquilo é o pior erro possível aqui.
                    const suspeito = /obsolet/i.test(`${a.pasta} ${a.nome}`);
                    return (
                      <label key={a.id} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${on ? "bg-torg-blue/5" : "hover:bg-gray-50/60"}`}>
                        <input type="checkbox" checked={on} className="accent-torg-orange"
                          onChange={() => setSel((s) => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })} />
                        <span className="text-[12px] text-torg-dark truncate flex-1" title={a.nome}>{a.nome}</span>
                        {suspeito && <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">obsoleto?</span>}
                        <span className="text-[10px] text-torg-gray-light shrink-0">{kb(a.tamanho)}</span>
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={salvar} disabled={salvando}
              className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
              {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Publicar {sel.size} documento(s)
            </button>
            {aviso && <span className="text-[12px] text-emerald-700">{aviso}</span>}
          </div>
        </>
      )}
    </div>
  );
}
