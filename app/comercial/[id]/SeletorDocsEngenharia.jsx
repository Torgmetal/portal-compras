"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Loader2, FolderOpen, Folder, Check, Search, AlertCircle, RefreshCw, ChevronRight, FileText, CornerLeftUp } from "lucide-react";

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

/**
 * Escolhe quais arquivos da pasta 2.5.5 vão para a aba Engenharia do portal.
 *
 * ⚠⚠ NAVEGA POR PASTA, NÃO É LISTA. Vitor (26/08/2026): "está muito bagunçado (…) me traga as
 * pastas para eu poder selecionar o que eu quero de fato trazer, não ficar tudo como lista e ter
 * que ficar rolando a página e marcando item por item". A OP-067 tem 126 arquivos em subpastas —
 * numa lista chapada, achar "Modelo 3D" é rolar até topar com ele.
 *
 * ⚠ E MARCAR A PASTA INTEIRA É UM CLIQUE. Quase sempre a decisão é por assunto ("manda os projetos
 * de montagem"), não arquivo a arquivo — obrigar 12 cliques para o que é uma decisão só é o que
 * fazia a tela ser abandonada no meio.
 *
 * ⚠ NADA É PUBLICADO SOZINHO: a pasta tem revisão antiga (OBSOLETO) e arquivo de trabalho
 * ("Mandar nessa pasta.docx"). Escolher continua sendo obrigatório — o que muda é o esforço.
 */
export default function SeletorDocsEngenharia({ opNumero }) {
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [aqui, setAqui] = useState("");          // pasta corrente ("" = raiz)
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

  const arquivos = useMemo(() => dados?.arquivos || [], [dados]);

  // ── a árvore: subpastas da pasta corrente e os arquivos soltos nela ──
  const t = q.trim().toLowerCase();
  const vista = useMemo(() => {
    // ⚠ com busca, o navegador vira RESULTADO: procurar dentro de uma pasta só esconderia o que a
    // pessoa está procurando em outra.
    if (t) return { busca: true, subpastas: [], aqui: arquivos.filter((a) => `${a.pasta} ${a.nome}`.toLowerCase().includes(t)) };
    const prefixo = aqui ? `${aqui} / ` : "";
    const subpastas = new Map();
    const soltos = [];
    for (const a of arquivos) {
      const p = a.pasta === "(raiz)" ? "" : a.pasta;
      if (aqui && !(p === aqui || p.startsWith(prefixo))) continue;
      if (!aqui && p === "") { soltos.push(a); continue; }
      if (p === aqui) { soltos.push(a); continue; }
      const resto = aqui ? p.slice(prefixo.length) : p;
      const nome = resto.split(" / ")[0];
      const caminho = aqui ? `${aqui} / ${nome}` : nome;
      const g = subpastas.get(caminho) || { nome, caminho, itens: [] };
      g.itens.push(a);
      subpastas.set(caminho, g);
    }
    return { busca: false, subpastas: [...subpastas.values()].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR", { numeric: true })), aqui: soltos };
  }, [arquivos, aqui, t]);

  const marcar = (itens, ligar) => setSel((s) => {
    const n = new Set(s);
    itens.forEach((a) => (ligar ? n.add(a.id) : n.delete(a.id)));
    return n;
  });

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

  const trilha = aqui ? aqui.split(" / ") : [];

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <p className="text-[13px] font-semibold text-torg-dark inline-flex items-center gap-1.5">
            <FolderOpen size={14} className="text-torg-blue" /> Documentos da Engenharia (pasta 2.5.5)
          </p>
          <p className="text-[11px] text-torg-gray mt-0.5">
            Entre na pasta e marque o que o cliente pode ver — a pasta inteira em um clique, ou item
            a item. <b>Nada é publicado sozinho.</b>
          </p>
        </div>
        <button onClick={carregar} disabled={carregando}
          className="text-[11px] text-torg-gray border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
          {carregando ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} reler a pasta
        </button>
      </div>

      {erro && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {erro}</p>}

      {dados?.caminho && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <FolderOpen size={13} className="text-torg-gray shrink-0" />
          <code className="text-[11px] text-torg-dark truncate flex-1" title={dados.caminho}>{dados.caminho}</code>
          <button onClick={() => { navigator.clipboard?.writeText(dados.caminho); setAviso("Caminho copiado — cole no Explorer ou no SharePoint."); }}
            className="text-[11px] font-semibold text-torg-blue hover:underline shrink-0">copiar</button>
        </div>
      )}

      {carregando && !dados ? (
        <p className="text-[12px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> lendo a pasta no servidor…</p>
      ) : arquivos.length === 0 ? (
        <p className="text-[12px] text-torg-gray">Nenhum arquivo na 2.5.5 desta obra.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={13} className="absolute left-2.5 top-2 text-torg-gray" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Achar em todas as pastas…"
                className="w-full text-[12px] border border-gray-200 rounded-lg pl-8 pr-2 py-1.5 focus:border-torg-blue outline-none" />
            </div>
            <span className="text-[11px] text-torg-gray">
              <b className="text-torg-dark">{sel.size}</b> de {arquivos.length} escolhido(s)
            </span>
            {sel.size > 0 && <button onClick={() => setSel(new Set())} className="text-[11px] text-torg-orange hover:underline">limpar</button>}
          </div>

          {/* ── trilha ── */}
          {!t && (
            <div className="flex items-center gap-1 text-[12px] flex-wrap">
              <button onClick={() => setAqui("")} className={`hover:underline ${aqui ? "text-torg-blue" : "font-semibold text-torg-dark"}`}>2.5.5</button>
              {trilha.map((n, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <ChevronRight size={11} className="text-torg-gray-light" />
                  <button onClick={() => setAqui(trilha.slice(0, i + 1).join(" / "))}
                    className={i === trilha.length - 1 ? "font-semibold text-torg-dark" : "text-torg-blue hover:underline"}>{n}</button>
                </span>
              ))}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
            {!t && aqui && (
              <button onClick={() => setAqui(trilha.slice(0, -1).join(" / "))}
                className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-torg-gray hover:bg-gray-50">
                <CornerLeftUp size={13} /> voltar
              </button>
            )}

            {/* ── as pastas ── */}
            {vista.subpastas.map((f) => {
              const marcados = f.itens.filter((a) => sel.has(a.id)).length;
              const todos = marcados === f.itens.length;
              // ⚠ o aviso de OBSOLETO na PASTA, não só no arquivo: é o caso real da OP-105, e
              // marcar a pasta inteira sem ver o nome dela é como a revisão antiga vaza.
              const suspeita = /obsolet/i.test(f.nome);
              return (
                <div key={f.caminho} className={`flex items-center gap-2 px-3 py-2 ${marcados ? "bg-torg-blue/5" : "hover:bg-gray-50/60"}`}>
                  <input type="checkbox" checked={todos} ref={(el) => { if (el) el.indeterminate = marcados > 0 && !todos; }}
                    className="accent-torg-orange" onChange={() => marcar(f.itens, !todos)} />
                  <button onClick={() => setAqui(f.caminho)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <Folder size={14} className="text-torg-blue shrink-0" />
                    <span className="text-[12px] font-semibold text-torg-dark truncate">{f.nome}</span>
                    {suspeita && <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">obsoleto?</span>}
                    <span className="text-[11px] text-torg-gray shrink-0">
                      {marcados ? <b className="text-torg-blue">{marcados}</b> : null}{marcados ? "/" : ""}{f.itens.length}
                    </span>
                    <ChevronRight size={13} className="text-torg-gray-light ml-auto shrink-0" />
                  </button>
                </div>
              );
            })}

            {/* ── os arquivos ── */}
            {vista.aqui.map((a) => {
              const on = sel.has(a.id);
              const suspeito = /obsolet/i.test(`${a.pasta} ${a.nome}`);
              return (
                <label key={a.id} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${on ? "bg-torg-blue/5" : "hover:bg-gray-50/60"}`}>
                  <input type="checkbox" checked={on} className="accent-torg-orange"
                    onChange={() => marcar([a], !on)} />
                  <FileText size={13} className="text-torg-gray-light shrink-0" />
                  <span className="text-[12px] text-torg-dark truncate flex-1" title={a.nome}>{a.nome}</span>
                  {t && <span className="text-[10px] text-torg-gray-light shrink-0 truncate max-w-[30%]">{a.pasta}</span>}
                  {suspeito && <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">obsoleto?</span>}
                  <span className="text-[10px] text-torg-gray-light shrink-0">{kb(a.tamanho)}</span>
                </label>
              );
            })}

            {!vista.subpastas.length && !vista.aqui.length && (
              <p className="px-3 py-4 text-[12px] text-torg-gray text-center">
                {t ? "Nada com esse nome." : "Pasta vazia."}
              </p>
            )}
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
