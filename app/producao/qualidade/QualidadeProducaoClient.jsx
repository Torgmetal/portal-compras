"use client";
import { useEffect, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import FichaPecaModal from "@/components/FichaPecaModal";
const TIPOS = { DIMENSIONAL: "Dimensional", VISUAL_SOLDA: "Visual de solda", ULTRASSOM: "Ultrassom", LP: "Líquido penetrante", PINTURA: "Pintura", MONTAGEM: "Montagem", GERAL: "Geral" };
const RESULTADOS = { APROVADO: "Aprovado", REPROVADO: "Reprovado", REC: "REC", PENDENTE: "Sem resultado" };
export default function QualidadeProducaoClient({ ops }) {
 const [opId, setOpId] = useState("");
 const [resultado, setResultado] = useState("TODOS");
 const [pagina, setPagina] = useState(1);
 const [tentativa, setTentativa] = useState(0);
 const [estado, setEstado] = useState({});
 const [marca, setMarca] = useState(null);
 useEffect(() => {
  if (!opId) { setEstado({}); return; }
  const abort = new AbortController(); setEstado({ carregando: true });
  async function carregar() {
   try {
    const res = await fetch(`/api/producao/qualidade?${new URLSearchParams({ opId, resultado, pagina })}`, { cache: "no-store", signal: abort.signal });
    const dados = await res.json(); if (!res.ok) throw new Error(dados.error || "Falha na consulta.");
    if (!abort.signal.aborted) setEstado({ dados });
   } catch (e) { if (!abort.signal.aborted) setEstado({ erro: e.message }); }
  }
  carregar(); return () => abort.abort();
 }, [opId, resultado, pagina, tentativa]);
 return <div className="max-w-6xl space-y-5">
  <header><h1 className="text-2xl font-bold text-torg-dark flex gap-2 items-center"><ClipboardCheck className="text-torg-blue"/>Qualidade por OP</h1><p className="text-sm text-torg-gray mt-2">Consulte os resultados e as marcas cobertas pelos relatórios. A emissão e a aprovação permanecem com a Qualidade.</p></header>
  <div className="grid sm:grid-cols-2 gap-3 bg-white border rounded-xl p-4">
   <label className="text-sm text-torg-gray">Ordem de produção<select aria-label="Ordem de produção" className="block w-full min-h-11 mt-1 border rounded-lg px-3 bg-white" value={opId} onChange={e => { setOpId(e.target.value); setEstado(e.target.value ? { carregando: true } : {}); setPagina(1); setMarca(null); }}><option value="">Selecione uma OP</option>{ops.map(o => <option key={o.id} value={o.id}>OP {o.numero} · {o.cliente}</option>)}</select></label>
   <label className="text-sm text-torg-gray">Resultado<select aria-label="Resultado" className="block w-full min-h-11 mt-1 border rounded-lg px-3 bg-white" value={resultado} onChange={e => { setResultado(e.target.value); setEstado(opId ? { carregando: true } : {}); setPagina(1); }}><option value="TODOS">Todos os resultados</option>{Object.entries(RESULTADOS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  </div>
  {!opId && <p className="p-8 bg-white border rounded-xl text-center text-torg-gray">Selecione uma OP para consultar os relatórios de inspeção.</p>}
  {estado.carregando && <p role="status" className="flex gap-2 text-torg-gray"><Loader2 className="animate-spin"/>Consultando relatórios…</p>}
  {estado.erro && <div role="alert" className="p-4 bg-red-50 rounded-xl text-red-700"><p>{estado.erro}</p><button className="border rounded-lg min-h-11 px-4 mt-3" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</button></div>}
  {estado.dados && <>
   <p className="text-sm text-torg-gray">{estado.dados.total} relatório(s) nesta consulta. O resultado de um relatório não representa a liberação de toda a OP.</p>
   {!estado.dados.relatorios.length && <p className="p-8 bg-white border rounded-xl text-torg-gray">Nenhum relatório encontrado para esta seleção.</p>}
   <div className="grid lg:grid-cols-2 gap-3">{estado.dados.relatorios.map(r => <article key={r.id} className="bg-white border border-gray-100 shadow-sm rounded-xl p-4 min-w-0">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold text-torg-dark">{r.codigo} · R{String(r.revisao).padStart(2,"0")}</h2><span className={`text-xs font-semibold rounded-full px-3 py-1 ${r.resultadoInspecao === "APROVADO" ? "bg-emerald-50 text-emerald-700" : r.resultadoInspecao === "REPROVADO" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>{RESULTADOS[r.resultadoInspecao] || r.resultadoInspecao || "Sem resultado"}</span></div>
    <p className="text-sm text-torg-gray mt-2">{TIPOS[r.tipo] || r.tipo} · {r.status === "EMITIDO" ? "Emitido" : r.status === "RASCUNHO" ? "Rascunho" : r.status}</p>
    <p className="text-xs text-torg-gray mt-1">{r.emitidoEm ? `Emissão: ${new Date(r.emitidoEm).toLocaleDateString("pt-BR")}` : "Ainda não emitido"}</p>
    <div className="flex flex-wrap gap-2 mt-3">{(Array.isArray(r.marcas) ? r.marcas : []).filter(m => typeof m === "string").map((m,i) => <button key={`${m}-${i}`} onClick={() => setMarca(m)} className="min-h-11 border rounded-lg px-3 text-sm text-torg-blue break-all" aria-label={`Abrir ficha da peça ${m}`}>{m}</button>)}</div>
   </article>)}</div>
   <div className="flex items-center justify-between gap-3"><button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)} className="min-h-11 px-4 border rounded-lg disabled:opacity-40">Anterior</button><span className="text-sm text-torg-gray">Página {pagina} de {estado.dados.paginas}</span><button disabled={pagina >= estado.dados.paginas} onClick={() => setPagina(p => p + 1)} className="min-h-11 px-4 border rounded-lg disabled:opacity-40">Próxima</button></div>
  </>}
  {marca && <FichaPecaModal opId={opId} marca={marca} onClose={() => setMarca(null)}/>}
 </div>;
}
