"use client";
/* global Worker */
// "Simular carga" de um romaneio prévio: baixa o IFC da obra, mede as marcas do romaneio, roda o
// simulador num Web Worker e mostra veículo, volumes e o 3D. O resultado é gravado (CargaSimulada).
//
// Vitor (12/09/2026): a lista é o romaneio prévio; "se a lista não cabe num veículo, ele avisa na hora".
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, X, Play, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { geometriaDoIfc } from "@/lib/carga/geometria-ifc";
import { prefixoDaOp } from "@/lib/carga/classificar";
import { ResumoSimulacao, VolumesDaCarga } from "./ResultadoSimulacao";

const VisualizadorCarga = dynamic(() => import("./VisualizadorCarga"), { ssr: false, loading: () => <div className="h-[480px] rounded-xl bg-[#eef2f6] flex items-center justify-center text-sm text-torg-gray">Carregando o 3D…</div> });

const fmtD = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function SimularCargaModal({ opId, opNumero, previo, onClose }) {
  const [dados, setDados] = useState(null), [erro, setErro] = useState(null);
  const [fase, setFase] = useState("carregando"), [progresso, setProgresso] = useState({ msg: "", frac: 0 });
  const [geo, setGeo] = useState(null), [perfil, setPerfil] = useState("recomendado");
  const [resultado, setResultado] = useState(null), [cargaSel, setCargaSel] = useState(0), [gravada, setGravada] = useState(null);
  const worker = useRef(null), viz = useRef(null);

  // 1) a lista, o perfil da LQC e a última simulação
  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/romaneios-previos/${previo.id}/simulacao`).then((r) => r.json())
      .then((j) => { if (!j.success) throw new Error(j.error || "Falha ao carregar"); setDados(j); setPerfil(j.perfilPadrao || "recomendado"); if (j.simulacao && !j.simulacao.desatualizada) { setResultado({ cargas: j.simulacao.cargas, resumo: j.simulacao.resumo, ...(j.simulacao.avisos || {}) }); setGravada(j.simulacao); } setFase("ifc"); })
      .catch((e) => { setErro(e.message); setFase("erro"); });
  }, [opId, previo.id]);

  // 2) o IFC da obra → geometria das marcas do romaneio
  useEffect(() => {
    if (fase !== "ifc" || !dados) return;
    let cancelado = false;
    (async () => {
      try {
        setProgresso({ msg: "Procurando o modelo IFC da obra…", frac: 0.02 });
        const lst = await fetch(`/api/producao/modelo-3d?opId=${opId}`).then((r) => r.json());
        const modelos = (lst.modelos || []).filter((m) => !m.grande);
        if (!modelos.length) throw new Error(lst.error || "A obra não tem modelo IFC publicado na pasta da Engenharia — sem ele não dá para medir as peças.");
        const mod = modelos[0];
        setProgresso({ msg: `Baixando ${mod.nome}…`, frac: 0.05 });
        const res = await fetch(`/api/producao/modelo-3d?opId=${opId}&rel=${encodeURIComponent(mod.rel)}`, { cache: "force-cache" });
        if (!res.ok) throw new Error("Não consegui baixar o IFC.");
        const bytes = new Uint8Array(await res.arrayBuffer()); if (cancelado) return;
        const marcas = [...new Set(dados.lista.map((i) => i.marca))];
        const g = await geometriaDoIfc(bytes, marcas, (msg, frac) => !cancelado && setProgresso({ msg, frac })); if (cancelado) return;
        setGeo({ ...g, modelo: mod.nome }); setFase("pronto");
      } catch (e) { if (!cancelado) { setErro(e.message); setFase("erro"); } }
    })();
    return () => { cancelado = true; };
  }, [fase, dados, opId]);

  useEffect(() => () => worker.current?.terminate(), []);

  // 3) o motor, num worker; 4) grava
  const simular = () => {
    if (!dados || !geo) return;
    setFase("simulando"); setErro(null); setGravada(null); setProgresso({ msg: "Montando os volumes e a carga…", frac: 0.5 });
    worker.current?.terminate();
    // ⚠ tem de ser exatamente `new Worker(new URL(…, import.meta.url))`: é essa forma que o webpack reconhece para empacotar o worker
    const w = new Worker(new URL("./simular.worker.js", import.meta.url)); worker.current = w;
    w.onmessage = async (ev) => {
      if (!ev.data.ok) { setErro(ev.data.erro); setFase("pronto"); return; }
      const r = ev.data.resultado; setResultado(r); setCargaSel(0); setFase("pronto");
      try {
        const res = await fetch(`/api/comercial/op/${opId}/romaneios-previos/${previo.id}/simulacao`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfil, itensHash: dados.hash, resumo: r.resumo, cargas: r.cargas, avisos: { especiais: r.especiais, ajustadas: r.ajustadas, semCaixa: r.semCaixa, perfil: r.perfil, gcModo: r.gcModo, faltantes: geo.faltantes } }) }).then((x) => x.json());
        if (res.success) setGravada(res.simulacao); else setErro(res.error || "A simulação não foi gravada.");
      } catch { setErro("A simulação não foi gravada."); }
    };
    w.onerror = (e) => { setErro(e.message || "Falha no simulador"); setFase("pronto"); };
    w.postMessage({ lista: dados.lista, geometria: geo.geometria, perfil, prefixo: prefixoDaOp(opNumero), opcoes: {} });
  };

  const carga = resultado?.cargas?.[cargaSel] || null;
  const ocupado = fase === "carregando" || fase === "ifc" || fase === "simulando";
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#F3F6F9] rounded-2xl shadow-2xl w-full max-w-6xl">
        <div className="px-5 py-3 bg-torg-dark text-white rounded-t-2xl flex items-center gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold">Simular carga · Romaneio prévio {String(previo.numero).padStart(2, "0")} · OP {opNumero}</h3>
            <p className="text-[11px] text-white/70">{dados ? `${dados.lista.length} marcas · ${dados.lista.reduce((t, i) => t + i.qtd, 0)} peças · ${Math.round(dados.previo.pesoKg || 0).toLocaleString("pt-BR")} kg` : "…"}{geo?.modelo ? ` · modelo ${geo.modelo}` : ""}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)} disabled={ocupado} className="text-[12px] text-torg-dark rounded-lg px-2 py-1.5 border-0" title="Nível de embalagem (o padrão vem da LQC da obra)">
              {(dados?.perfis || [{ chave: "recomendado", nome: "Padrão" }]).map((p) => <option key={p.chave} value={p.chave}>Embalagem {p.nome}</option>)}
            </select>
            <button onClick={simular} disabled={ocupado || !geo} className="text-[12px] font-semibold bg-torg-orange text-white rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-orange-600">
              {fase === "simulando" ? <Loader2 size={14} className="animate-spin" /> : resultado ? <RefreshCw size={14} /> : <Play size={14} />} {resultado ? "Simular de novo" : "Simular"}
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white"><X size={20} /></button>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {ocupado && (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-[12px] text-torg-dark inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin text-torg-blue" /> {progresso.msg || "Carregando…"}</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-torg-blue transition-all" style={{ width: `${Math.round(100 * (progresso.frac || 0))}%` }} /></div>
            </div>
          )}
          {erro && <p className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-flex items-center gap-2"><AlertCircle size={14} /> {erro}</p>}
          {geo && !resultado && fase === "pronto" && (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 text-[12px] text-torg-dark">
              Peças medidas no modelo: <b>{Object.keys(geo.geometria).length}</b> de {dados.lista.length} marcas{geo.faltantes.length ? <> · <span className="text-red-700">sem geometria no IFC: {geo.faltantes.join(", ")}</span></> : null}. Escolha a embalagem e clique em <b>Simular</b>.
              {dados.simulacao?.desatualizada && <p className="mt-1 text-amber-800">A última simulação ({fmtD(dados.simulacao.createdAt)}) é de antes de o romaneio mudar — simule de novo.</p>}
            </div>
          )}
          {resultado && (
            <>
              <div className="flex items-center gap-2 text-[11px] text-torg-gray">
                {gravada ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> Simulação gravada em {fmtD(gravada.createdAt)} · embalagem {gravada.perfilNome}</span> : <span>Resultado não gravado</span>}
                {resultado.gcModo && <span>· guarda-corpo: {resultado.gcModo === "engradado" ? "em pé em engradado" : "deitado em pacote"}</span>}
              </div>
              <ResumoSimulacao resultado={resultado} cargaSel={cargaSel} onCarga={setCargaSel} />
              {carga && geo && <VisualizadorCarga ref={viz} carga={carga} malhas={geo.malhas} madeira={resultado.madeira || 100} altura={480} />}
              {carga && !geo && <p className="text-[12px] text-torg-gray">Baixando o modelo para desenhar o 3D…</p>}
              {carga && <VolumesDaCarga carga={carga} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
