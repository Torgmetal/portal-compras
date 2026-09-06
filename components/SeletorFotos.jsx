"use client";
import { useEffect, useState } from "react";
import { Loader2, Check, Images, Search } from "lucide-react";
import { ehVideo } from "@/lib/midia";

// A seleção é de cada portal. Abrir o acervo nunca publica os arquivos por conta própria.
export default function SeletorFotos({ opId, opNumero, aberto, onFechar, onEscolher, jaUsadas = [], multiplo = true, permitirVideos = false, maximo = Infinity }) {
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const usadas = new Set(jaUsadas.map(String));
  useEffect(() => {
    if (!aberto) return;
    const controller = new AbortController();
    setDados(null); setSel(new Set()); setBusca(""); setTipo("todos"); setErro("");
    const q = opId ? `?opId=${encodeURIComponent(opId)}` : opNumero ? `?opNumero=${encodeURIComponent(opNumero)}` : "";
    fetch(`/api/fotos${q}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Não foi possível abrir o banco."); return j; })
      .then(setDados).catch((e) => { if (e.name !== "AbortError") setErro("Não foi possível abrir o banco de imagens. Tente novamente."); });
    return () => controller.abort();
  }, [aberto, opId, opNumero, tentativa]);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e) => { if (e.key === "Escape" && !enviando) onFechar(); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto, onFechar, enviando]);
  if (!aberto) return null;
  const alternar = (f) => setSel((prev) => {
    const next = new Set(multiplo ? prev : []);
    if (prev.has(f.url)) next.delete(f.url); else if (!multiplo || next.size < maximo) next.add(f.url);
    return next;
  });
  const confirmar = async () => {
    setEnviando(true); setErro("");
    try {
      const todas = [...(dados?.daObra || []), ...(dados?.acervo || []), ...(dados?.outras || [])];
      const unicas = [...new Map(todas.map((f) => [f.url, f])).values()];
      await onEscolher(unicas.filter((f) => sel.has(f.url)).map((f) => ({ ...f, legenda: f.legenda || "" })));
      onFechar();
    } catch { setErro("Não foi possível aplicar a seleção. Confira e tente novamente."); }
    finally { setEnviando(false); }
  };
  const filtrar = (lista) => (lista || []).filter((f) => {
    const video = ehVideo(f);
    if (video && !permitirVideos) return false;
    if (tipo === "imagem" && video) return false;
    if (tipo === "completo" && (!video || f.versao !== "completo")) return false;
    if (tipo === "corte" && (!video || f.versao !== "corte")) return false;
    return `${f.legenda || ""} ${f.op || ""} ${f.categoria || ""}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR"));
  });
  const grade = (lista) => <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">{lista.map((f) => {
    const on = sel.has(f.url); const ja = usadas.has(f.url);
    return <div key={f.id || f.url} className="min-w-0 rounded-xl border border-gray-200 overflow-hidden bg-white">
      <button type="button" aria-pressed={on} aria-label={`Selecionar ${f.legenda || "imagem"}`} disabled={ja || enviando || !onEscolher || (multiplo && !on && sel.size >= maximo)} onClick={() => alternar(f)} className={`relative w-full text-left border-2 ${on ? "border-torg-orange" : "border-transparent"} ${ja ? "opacity-40" : ""}`}>
        <img loading="lazy" src={f.miniatura || f.url} alt={f.legenda || ""} className="w-full h-28 object-cover" />
        <span className="block text-xs px-2 pt-2 line-clamp-2 min-h-[40px]">{f.legenda || (f.op ? `OP-${f.op}` : "Imagem da obra")}</span>
        {on && <Check size={20} className="absolute top-2 right-2 bg-torg-orange text-white rounded-full p-0.5" />}
        {ja && <span className="absolute top-2 left-2 bg-white rounded px-1 text-xs">Já selecionada</span>}
      </button>
      <div className="flex justify-between items-center text-[11px] px-2 py-2 text-torg-gray"><span>{ehVideo(f) ? `${f.versao === "corte" ? "Corte" : "Vídeo"} · ${Math.round(f.duracao || 0)}s` : "Foto"}</span><a href={f.url} target="_blank" rel="noreferrer" className="text-torg-blue font-semibold">{ehVideo(f) ? "Assistir" : "Ampliar"}</a></div>
    </div>;
  })}</div>;
  const grupos = [
    { titulo: "Desta obra", lista: filtrar(dados?.daObra) },
    { titulo: "Acervo Torg · fotos e vídeos tratados", lista: filtrar(dados?.acervo) },
    { titulo: opId || opNumero ? "De outras obras" : "Fotos cadastradas", lista: filtrar(dados?.outras) },
  ].filter((g) => g.lista.length);
  return <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-3 sm:p-6" onClick={() => !enviando && onFechar()}>
    <div role="dialog" aria-modal="true" aria-label="Banco de imagens" className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-torg-dark" onClick={(e) => e.stopPropagation()}>
      <div className="p-4 border-b flex items-center gap-2"><Images size={20} className="text-torg-blue" /><h3 className="font-bold">Banco de imagens</h3><button disabled={enviando} onClick={onFechar} className="ml-auto text-sm px-2 py-1">Fechar</button></div>
      <div className="p-4 border-b space-y-3"><p className="text-xs text-torg-gray">Escolha o que deseja mostrar neste portal. As imagens das obras e o acervo ficam disponíveis para reutilização.</p>
        <label className="flex gap-2 items-center border rounded-lg px-3 py-2"><Search size={16} /><input aria-label="Buscar no banco de imagens" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por descrição ou obra" className="w-full text-sm outline-none" /></label>
        {permitirVideos && <div className="flex gap-2 flex-wrap">{[["todos","Todos"],["imagem","Fotos"],["completo","Vídeos completos"],["corte","Cortes para apresentação"]].map(([v,label]) => <button key={v} aria-pressed={tipo===v} onClick={() => setTipo(v)} className={`text-xs px-3 py-1.5 rounded-full ${tipo===v ? "bg-torg-blue text-white" : "bg-gray-100"}`}>{label}</button>)}</div>}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {erro && <p role="alert" className="text-sm text-red-700">{erro} {!dados && <button className="underline" onClick={() => setTentativa((v) => v+1)}>Tentar novamente</button>}</p>}
        {!dados && !erro && <p className="flex gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Carregando imagens…</p>}
        {dados && !grupos.length && <p className="text-sm text-torg-gray">Nenhuma imagem encontrada para esta busca.</p>}
        {grupos.map((g) => <section key={g.titulo}><h4 className="text-xs font-bold mb-3">{g.titulo} · {g.lista.length}</h4>{grade(g.lista)}</section>)}
      </div>
      {onEscolher && <div className="p-4 border-t flex items-center gap-3"><span className="text-xs">{sel.size} selecionada(s){Number.isFinite(maximo) && ` · limite ${maximo}`}{!multiplo && " · escolha uma imagem"}</span><button onClick={confirmar} disabled={!sel.size || enviando} className="ml-auto bg-torg-blue text-white text-sm rounded-lg px-4 py-2 disabled:opacity-40">{enviando ? "Aplicando…" : "Usar seleção"}</button></div>}
    </div>
  </div>;
}
