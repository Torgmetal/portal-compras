"use client";
/* global Worker */
// "Simular carga" de um romaneio prévio: baixa o IFC da obra, mede as marcas do romaneio, roda o
// simulador num Web Worker e mostra veículo, volumes e o 3D. O resultado é gravado (CargaSimulada).
//
// Vitor (12/09/2026): a lista é o romaneio prévio; "se a lista não cabe num veículo, ele avisa na hora".
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, X, Play, RefreshCw, AlertCircle, CheckCircle2, FileText } from "lucide-react";
import { geometriaDoIfc } from "@/lib/carga/geometria-ifc";
import { prefixoDaOp } from "@/lib/carga/classificar";
import { marcaEhAC } from "@/lib/marca-ac";
import { ResumoSimulacao, VolumesDaCarga } from "./ResultadoSimulacao";

const VisualizadorCarga = dynamic(() => import("./VisualizadorCarga"), { ssr: false, loading: () => <div className="h-[480px] rounded-xl bg-[#eef2f6] flex items-center justify-center text-sm text-torg-gray">Carregando o 3D…</div> });

const fmtD = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function SimularCargaModal({ opId, opNumero, previo, onClose }) {
  const [dados, setDados] = useState(null), [erro, setErro] = useState(null);
  const [fase, setFase] = useState("carregando"), [progresso, setProgresso] = useState({ msg: "", frac: 0 });
  const [geo, setGeo] = useState(null), [perfil, setPerfil] = useState("recomendado");
  const [resultado, setResultado] = useState(null), [cargaSel, setCargaSel] = useState(0), [gravada, setGravada] = useState(null), [pdf, setPdf] = useState(null);
  const worker = useRef(null), viz = useRef(null);

  // 1) a lista, o perfil da LQC e a última simulação
  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/romaneios-previos/${previo.id}/simulacao`).then((r) => r.json())
      .then((j) => { if (!j.success) throw new Error(j.error || "Falha ao carregar"); setDados(j); setPerfil(j.perfilPadrao || "recomendado"); if (j.simulacao && !j.simulacao.desatualizada) { setResultado({ cargas: j.simulacao.cargas, resumo: j.simulacao.resumo, ...(j.simulacao.avisos || {}) }); setGravada(j.simulacao); } setFase("ifc"); })
      .catch((e) => { setErro(e.message); setFase("erro"); });
  }, [opId, previo.id]);

  // 2) os IFCs da obra → geometria das marcas do romaneio. Uma obra pode ter um modelo por frente
  //    (a OP-107 tem seis): percorre TODOS, do mais novo ao mais antigo, até achar todas as marcas.
  //    Item AC (parafuso, acessório comprado) nunca tem geometria: fica fora da carga sem alarme.
  useEffect(() => {
    if (fase !== "ifc" || !dados) return;
    let cancelado = false;
    (async () => {
      try {
        setProgresso({ msg: "Procurando os modelos IFC da obra…", frac: 0.02 });
        const lst = await fetch(`/api/producao/modelo-3d?opId=${opId}`).then((r) => r.json());
        const modelos = (lst.modelos || []).filter((m) => !m.grande), grandes = (lst.modelos || []).filter((m) => m.grande);
        if (!modelos.length) throw new Error(lst.error || (grandes.length ? `O modelo da obra (${grandes[0].nome}) passa de 60 MB e não abre no navegador — a Engenharia precisa publicar o IFC por frente.` : "A obra não tem modelo IFC publicado na pasta da Engenharia — sem ele não dá para medir as peças."));
        const ac = dados.lista.filter((i) => marcaEhAC(i.marca)).map((i) => i.marca);
        let faltantes = [...new Set(dados.lista.filter((i) => !marcaEhAC(i.marca)).map((i) => i.marca))];
        const geometria = {}, malhas = {}, usados = [];
        for (const [k, mod] of modelos.entries()) {
          if (!faltantes.length) break;
          setProgresso({ msg: `Baixando ${mod.nome} (${k + 1} de ${modelos.length})…`, frac: 0.05 + 0.9 * k / modelos.length });
          const res = await fetch(`/api/producao/modelo-3d?opId=${opId}&rel=${encodeURIComponent(mod.rel)}`, { cache: "force-cache" });
          if (!res.ok) continue;
          const bytes = new Uint8Array(await res.arrayBuffer()); if (cancelado) return;
          const g = await geometriaDoIfc(bytes, faltantes, (msg, frac) => !cancelado && setProgresso({ msg: `${mod.nome}: ${msg}`, frac: 0.05 + 0.9 * (k + frac) / modelos.length })); if (cancelado) return;
          const achou = Object.keys(g.geometria); if (achou.length) usados.push({ nome: mod.nome, marcas: achou.length });
          Object.assign(geometria, g.geometria); Object.assign(malhas, g.malhas); faltantes = g.faltantes;
        }
        setGeo({ geometria, malhas, faltantes, ac: [...new Set(ac)], usados, modelo: usados.map((u) => u.nome).join(", ") || modelos[0].nome }); setFase("pronto");
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
    w.postMessage({ lista: dados.lista.filter((i) => !marcaEhAC(i.marca)), geometria: geo.geometria, perfil, prefixo: prefixoDaOp(opNumero), opcoes: dados.opcoes || {} });
  };

  // PDF do modelo: fotografa o 3D (carga pronta + cada camada) e manda para a rota montar o A4
  const gerarPdf = async () => {
    const v = viz.current, c = resultado?.cargas?.[cargaSel]; if (!v || !c || !gravada) return;
    setPdf({ gerando: true });
    try {
      await new Promise((r) => setTimeout(r, 50));
      const camadas = [...new Set(c.itens.map((u) => u.camada || 0))].sort((a, b) => a - b);
      const imagens = { full: { iso: v.capturar("iso"), lado: v.capturar("lado"), topo: v.capturar("topo") }, camadas: camadas.map((ci) => ({ ci, iso: v.capturar("iso", ci), topo: v.capturar("topo", ci) })) };
      const res = await fetch(`/api/comercial/op/${opId}/romaneios-previos/${previo.id}/simulacao/modelo-pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ simulacaoId: gravada.id, indice: cargaSel, imagens }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Não consegui gerar o PDF."); }
      const blob = await res.blob(), url = URL.createObjectURL(blob);
      const nome = (res.headers.get("Content-Disposition") || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)/)?.[1];
      setPdf({ url, nome: nome ? decodeURIComponent(nome) : `modelo-carga-OP-${opNumero}.pdf` }); window.open(url, "_blank");
    } catch (e) { setPdf(null); setErro(e.message); }
  };
  useEffect(() => () => { if (pdf?.url) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const carga = resultado?.cargas?.[cargaSel] || null;
  const ocupado = fase === "carregando" || fase === "ifc" || fase === "simulando";
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#F3F6F9] rounded-2xl shadow-2xl w-full max-w-6xl">
        <div className="px-4 sm:px-5 py-3 bg-torg-dark text-white rounded-t-2xl flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
            <h3 className="text-sm font-bold">Simular carga · Romaneio prévio {String(previo.numero).padStart(2, "0")} · OP {opNumero}</h3>
            <p className="text-[11px] text-white/70">{dados ? `${dados.lista.length} marcas · ${dados.lista.reduce((t, i) => t + i.qtd, 0)} peças · ${Math.round(dados.previo.pesoKg || 0).toLocaleString("pt-BR")} kg` : "…"}{geo?.modelo ? ` · modelo: ${geo.modelo}` : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={perfil} onChange={(e) => setPerfil(e.target.value)} disabled={ocupado} className="text-[12px] text-torg-dark rounded-lg px-2 py-1.5 border-0" title="Nível de embalagem (o padrão vem da LQC da obra)">
              {(dados?.perfis || [{ chave: "recomendado", nome: "Padrão" }]).map((p) => <option key={p.chave} value={p.chave}>Embalagem {p.nome}</option>)}
            </select>
            <button onClick={simular} disabled={ocupado || !geo} className="text-[12px] font-semibold bg-torg-orange text-white rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50 hover:bg-orange-600">
              {fase === "simulando" ? <Loader2 size={14} className="animate-spin" /> : resultado ? <RefreshCw size={14} /> : <Play size={14} />} {resultado ? "Simular de novo" : "Simular"}
            </button>
            <button onClick={gerarPdf} disabled={ocupado || !gravada || !geo || pdf?.gerando} className="text-[12px] font-semibold bg-white/15 text-white rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40 hover:bg-white/25" title="PDF do modelo de carga para a Expedição (separar, formar volumes, montar por camada)">
              {pdf?.gerando ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} PDF do modelo
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
              Marcas medidas no modelo: <b>{Object.keys(geo.geometria).length}</b> de {dados.lista.length}{geo.ac?.length ? <> · {geo.ac.length} AC (parafusos e acessórios comprados) ficam fora da carga</> : null}.
              {geo.faltantes.length > 0 && <p className="mt-1 text-red-700"><b>Sem geometria em nenhum IFC da obra ({geo.faltantes.length}):</b> {geo.faltantes.slice(0, 15).join(", ")}{geo.faltantes.length > 15 ? ` e mais ${geo.faltantes.length - 15}` : ""}. Essas ficam fora da carga — confira se a marca no modelo é a mesma da lista de expedição.</p>}
              <p className="mt-1">Escolha a embalagem e clique em <b>Simular</b>.</p>
              {dados.simulacao?.desatualizada && <p className="mt-1 text-amber-800">A última simulação ({fmtD(dados.simulacao.createdAt)}) é de antes de o romaneio mudar — simule de novo.</p>}
            </div>
          )}
          {resultado && (
            <>
              <div className="flex items-center gap-2 text-[11px] text-torg-gray">
                {gravada ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> Simulação gravada em {fmtD(gravada.createdAt)} · embalagem {gravada.perfilNome}</span> : <span>Resultado não gravado</span>}
                {resultado.gcModo && <span>· guarda-corpo: {resultado.gcModo === "engradado" ? "em pé em engradado" : "deitado em pacote"}</span>}
                {pdf?.url && <a href={pdf.url} download={pdf.nome} className="ml-auto text-torg-blue font-medium hover:underline inline-flex items-center gap-1"><FileText size={12} /> Baixar {pdf.nome}</a>}
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
