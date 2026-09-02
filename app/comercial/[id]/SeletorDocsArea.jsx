"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2, FolderOpen, Folder, Check, AlertCircle, RefreshCw, ChevronRight, FileText, CornerLeftUp, Pencil, X, Lock, Trash2 } from "lucide-react";

const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);

/**
 * Escolhe, no servidor, quais arquivos aparecem numa ÁREA do portal do cliente — e com que nome.
 *
 * Vitor (26/08/2026): "para cada parte aqui me permita acessar o servidor e selecionar o que eu
 * quero colocar, e me dê a opção de podermos renomear os arquivos para que o cliente veja um nome
 * mais adequado do que o nome original do documento".
 *
 * ⚠⚠ O NOME DO ARQUIVO É INTERNO. "T112-PM-01_R00.pdf" diz tudo para quem fabrica e nada para quem
 * comprou a obra — publicar o nome do arquivo é publicar a nossa nomenclatura. O nome de exibição
 * é opcional; sem ele vale o original, que é melhor que um campo obrigatório preenchido às pressas.
 *
 * ⚠ COM `tipo`, A PASTA É TRAVA. Vitor (26/08/2026): "vamos restringir a permissão de importação de
 * arquivos; na Engenharia apenas permitir o Modelo 3D, memorial de cálculo, ART e Diagramas de
 * montagem". Nesse modo não existe "subir até a raiz da OP": o topo é o tipo, e o servidor recusa
 * caminho de fora. Sem `tipo` (as outras áreas) segue navegando a OP inteira.
 */
export default function SeletorDocsArea({ opNumero, area, nomeArea, tipo, nomeTipo, ondeTipo, resumoTipo }) {
  const [d, setD] = useState(null);
  const [caminho, setCaminho] = useState(null);   // null = deixa a API escolher a pasta de partida
  const [sel, setSel] = useState(() => new Map()); // id → doc escolhido
  const [fora, setFora] = useState([]);            // escolhidos que não são de nenhum dos 4 tipos
  const [editando, setEditando] = useState(null);  // id em renomeação
  const [rascunho, setRascunho] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const rotulo = nomeTipo || nomeArea;

  const carregar = useCallback(async (p) => {
    setCarregando(true); setErro("");
    try {
      const q = new URLSearchParams({ opNumero, area });
      if (tipo) q.set("tipo", tipo);
      if (p !== null && p !== undefined) q.set("caminho", p);
      const r = await fetch(`/api/portal/engenharia-docs?${q}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao ler a pasta");
      setD(j);
      setCaminho(j.caminho ?? "");
      // ⚠ a seleção do TIPO inteiro, não só o que está nesta pasta: navegar não pode desmarcar o
      // que foi escolhido noutra pasta.
      setSel(new Map((j.selecionados || []).map((x) => [String(x.id), x])));
      setFora(j.foraDoPadrao || []);
      if (j.error) setErro(j.error);
      setAviso(j.aviso || "");
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }, [opNumero, area, tipo]);
  useEffect(() => { carregar(null); }, [carregar]);

  const marcar = (a, ligar) => setSel((m) => {
    const n = new Map(m);
    if (ligar) n.set(String(a.id), { id: a.id, nome: a.nome, nomeExibicao: n.get(String(a.id))?.nomeExibicao || null, pasta: a.pasta ?? (caminho || ""), tamanho: a.tamanho, em: a.em });
    else n.delete(String(a.id));
    return n;
  });

  const renomear = (id, nome) => setSel((m) => {
    const n = new Map(m);
    const at = n.get(String(id));
    if (at) n.set(String(id), { ...at, nomeExibicao: nome.trim() || null });
    return n;
  });

  async function salvar(limparFora = false) {
    setSalvando(true); setErro(""); setAviso("");
    try {
      const r = await fetch("/api/portal/engenharia-docs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opNumero, area, tipo: tipo || undefined, docs: [...sel.values()], limparForaDoPadrao: limparFora }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      if (limparFora) setFora([]);
      setAviso(`${j.escolhidos} documento(s) publicados em ${rotulo}.`);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  // ── a trilha ──
  // com tipo: o topo é o TIPO, e só se mostra o que está abaixo da pasta dele.
  // sem tipo: o topo é a OP, como sempre foi.
  const raizAtual = tipo ? (d?.raizes || []).find((r) => caminho === r || (caminho || "").startsWith(`${r}/`)) : null;
  const trilha = tipo
    ? (raizAtual ? (caminho || "").slice(raizAtual.length).split("/").filter(Boolean) : [])
    : (caminho || "").split("/").filter(Boolean);
  const subirPara = () => {
    if (!tipo) return trilha.slice(0, -1).join("/");
    return trilha.length > 1 ? `${raizAtual}/${trilha.slice(0, -1).join("/")}` : "";
  };
  const irAte = (i) => (tipo ? `${raizAtual}/${trilha.slice(0, i + 1).join("/")}` : trilha.slice(0, i + 1).join("/"));

  return (
    <div className="border border-gray-200 rounded-xl p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[13px] font-semibold text-torg-dark inline-flex items-center gap-1.5 flex-1">
          {tipo ? <Lock size={13} className="text-torg-gray-light" /> : <FolderOpen size={14} className="text-torg-blue" />} {rotulo}
          <span className="text-[11px] font-normal text-torg-gray">· {sel.size} documento(s) no portal</span>
        </p>
        <button onClick={() => carregar(caminho)} disabled={carregando}
          className="text-[11px] text-torg-gray border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50">
          {carregando ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
        </button>
      </div>
      {tipo && (resumoTipo || ondeTipo) && (
        <p className="text-[11px] text-torg-gray -mt-1">
          {resumoTipo} {ondeTipo && <span className="text-torg-gray-light">· pasta {ondeTipo}</span>}
        </p>
      )}

      {erro && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 inline-flex items-start gap-1.5"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {erro}</p>}

      {d?.caminhoCompleto && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1">
          <code className="text-[10px] text-torg-gray truncate flex-1" title={d.caminhoCompleto}>{d.caminhoCompleto}</code>
          <button onClick={() => { navigator.clipboard?.writeText(d.caminhoCompleto); setAviso("Caminho copiado."); }}
            className="text-[10px] font-semibold text-torg-blue hover:underline shrink-0">copiar</button>
        </div>
      )}

      {/* ── trilha ── */}
      <div className="flex items-center gap-1 text-[12px] flex-wrap">
        <button onClick={() => carregar("")} className={`hover:underline ${trilha.length ? "text-torg-blue" : "font-semibold text-torg-dark"}`}>{tipo ? rotulo : "OP"}</button>
        {trilha.map((n, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight size={11} className="text-torg-gray-light" />
            <button onClick={() => carregar(irAte(i))}
              className={i === trilha.length - 1 ? "font-semibold text-torg-dark" : "text-torg-blue hover:underline"}>{n}</button>
          </span>
        ))}
      </div>

      <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
        {carregando && <p className="px-3 py-3 text-[12px] text-torg-gray inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> lendo…</p>}
        {!carregando && trilha.length > 0 && (
          <button onClick={() => carregar(subirPara())} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-torg-gray hover:bg-gray-50">
            <CornerLeftUp size={13} /> voltar
          </button>
        )}
        {!carregando && (d?.pastas || []).map((f) => {
          // ⚠ o aviso de OBSOLETO na pasta: é como a revisão antiga vaza para o cliente.
          const suspeita = /obsolet/i.test(f.nome);
          return (
            <button key={f.caminho || f.nome} onClick={() => carregar(f.caminho ?? (caminho ? `${caminho}/${f.nome}` : f.nome))}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50/60 text-left">
              <Folder size={14} className="text-torg-blue shrink-0" />
              <span className="text-[12px] font-semibold text-torg-dark truncate flex-1">{f.nome}</span>
              {suspeita && <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 shrink-0">obsoleto?</span>}
              {f.itens != null && <span className="text-[11px] text-torg-gray shrink-0">{f.itens}</span>}
              <ChevronRight size={13} className="text-torg-gray-light shrink-0" />
            </button>
          );
        })}
        {/* ⚠⚠ MARCAR A PASTA INTEIRA. Vitor (01/09/2026): "deixe uma caixa de seleção nos projetos
            de fabricação, para podermos selecionar todos de uma vez". A pasta do cliente da OP-113
            tem ~240 arquivos (o PDF e o DWG de cada conjunto) — marcar um a um não é trabalho, é
            impedimento, e quem tenta desiste no meio e publica a obra pela metade.
            ⚠ Marca o que está NA PASTA ABERTA, não o tipo inteiro: é o que está à vista, e é o que
            a pessoa acha que está marcando. */}
        {!carregando && (d?.arquivos || []).length > 1 && (() => {
          const lista = d.arquivos;
          const marcados = lista.filter((a) => sel.has(String(a.id))).length;
          const todos = marcados === lista.length;
          return (
            <label className="flex items-center gap-2 px-3 py-2 bg-gray-50/80 border-b border-gray-100 cursor-pointer sticky top-0 z-10">
              <input type="checkbox" checked={todos} className="accent-torg-orange"
                ref={(el) => { if (el) el.indeterminate = marcados > 0 && !todos; }}
                onChange={() => lista.forEach((a) => marcar(a, !todos))} />
              <span className="text-[12px] font-semibold text-torg-dark">
                {todos ? "desmarcar" : "marcar"} os {lista.length} arquivos desta pasta
              </span>
              {marcados > 0 && <span className="text-[11px] text-torg-gray ml-auto">{marcados} marcado(s)</span>}
            </label>
          );
        })()}
        {!carregando && (d?.arquivos || []).map((a) => {
          const on = sel.has(String(a.id));
          const doc = sel.get(String(a.id));
          return (
            <div key={a.id} className={`px-3 py-1.5 ${on ? "bg-torg-blue/5" : "hover:bg-gray-50/60"}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={on} className="accent-torg-orange" onChange={() => marcar(a, !on)} />
                <FileText size={13} className="text-torg-gray-light shrink-0" />
                <span className="text-[12px] text-torg-dark truncate flex-1" title={a.nome}>{a.nome}</span>
                {/* ⚠ o portal já publica a LPC/LE no template Torg e sem peso — o arquivo da pasta
                    traz o peso item a item, e peso é preço. Avisa antes de deixar marcar. */}
                {/\.xls[xm]?$/i.test(a.nome) && /(^|[^A-Za-z])(LPC|LE)([^A-Za-z]|$)|lista de (pe[çc]a|produ|expedi)/i.test(a.nome) && (
                  <span className="text-[10px] text-red-700 bg-red-50 rounded px-1.5 py-0.5 shrink-0"
                    title="O portal já publica esta lista no template Torg e sem peso. O arquivo da pasta tem o peso item a item.">tem peso</span>
                )}
                {/* ⚠ .dwg é o nosso arquivo de trabalho: vai editável para o cliente. Para diagrama
                    de montagem existe o PDF ao lado; no Modelo 3D o formato editável é o esperado. */}
                {tipo !== "MODELO_3D" && /\.dwg$/i.test(a.nome) && (
                  <span className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 shrink-0"
                    title="Arquivo de CAD editável. Normalmente existe o PDF do mesmo desenho ao lado.">editável</span>
                )}
                <span className="text-[10px] text-torg-gray-light shrink-0">{kb(a.tamanho)}</span>
              </label>
              {/* ── o nome que o cliente vê ── */}
              {on && (
                editando === String(a.id) ? (
                  <div className="flex items-center gap-1.5 mt-1 ml-6">
                    <input autoFocus value={rascunho} onChange={(e) => setRascunho(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { renomear(a.id, rascunho); setEditando(null); } if (e.key === "Escape") setEditando(null); }}
                      placeholder="Como o cliente vê este documento"
                      className="flex-1 text-[11px] border border-torg-blue rounded px-2 py-1 outline-none" />
                    <button onClick={() => { renomear(a.id, rascunho); setEditando(null); }} className="text-torg-blue"><Check size={13} /></button>
                    <button onClick={() => setEditando(null)} className="text-torg-gray"><X size={13} /></button>
                  </div>
                ) : (
                  <button onClick={() => { setEditando(String(a.id)); setRascunho(doc?.nomeExibicao || ""); }}
                    className="ml-6 mt-0.5 text-[11px] text-torg-blue hover:underline inline-flex items-center gap-1">
                    <Pencil size={10} />
                    {doc?.nomeExibicao
                      ? <>o cliente vê: <b className="text-torg-dark">{doc.nomeExibicao}</b></>
                      : "dar um nome para o cliente"}
                  </button>
                )
              )}
            </div>
          );
        })}
        {!carregando && !(d?.pastas || []).length && !(d?.arquivos || []).length && (
          <p className="px-3 py-4 text-[12px] text-torg-gray text-center">Pasta vazia.</p>
        )}
      </div>

      {/* ⚠ O QUE FICOU FORA DOS QUATRO TIPOS. Escolhido antes desta regra existir — não sai sozinho
          do cadastro, mas também não vai ao portal. Aparece uma vez, para ele decidir. */}
      {tipo && fora.length > 0 && (
        <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 space-y-1">
          <p className="text-amber-800 inline-flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {fora.length} documento(s) escolhidos antes desta regra não são nenhum dos quatro tipos — <b>não vão ao portal</b>.
          </p>
          <ul className="text-torg-gray pl-5 list-disc">
            {fora.slice(0, 6).map((f) => <li key={f.id} className="truncate">{f.nomeExibicao || f.nome}</li>)}
          </ul>
          <button onClick={() => salvar(true)} disabled={salvando}
            className="text-[11px] font-semibold text-amber-800 hover:underline inline-flex items-center gap-1">
            <Trash2 size={11} /> tirar do cadastro
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => salvar(false)} disabled={salvando}
          className="text-[12px] font-semibold text-white bg-torg-blue rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1.5">
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Publicar {sel.size}
        </button>
        {sel.size > 0 && <button onClick={() => setSel(new Map())} className="text-[11px] text-torg-orange hover:underline">limpar seleção</button>}
        {aviso && <span className="text-[12px] text-emerald-700">{aviso}</span>}
      </div>
    </div>
  );
}
