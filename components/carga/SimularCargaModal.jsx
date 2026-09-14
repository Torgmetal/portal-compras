"use client";
/* global Worker */
// "Simular carga" de um romaneio prévio: baixa o IFC da obra, mede as marcas do romaneio, roda o
// simulador num Web Worker e mostra veículo, volumes e o 3D. O resultado é gravado (CargaSimulada).
//
// Vitor (12/09/2026): a lista é o romaneio prévio; "se a lista não cabe num veículo, ele avisa na hora".
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, X, Play, RefreshCw, AlertCircle, CheckCircle2, FileText, Truck, ChevronDown, SlidersHorizontal } from "lucide-react";
import { geometriaDoIfc } from "@/lib/carga/geometria-ifc";
import { prefixoDaOp } from "@/lib/carga/classificar";
import { marcaEhAC } from "@/lib/marca-ac";
import { ResumoSimulacao, VolumesDaCarga, AvisosSimulacao } from "./ResultadoSimulacao";
import { EditorAjuste, ListaAjustes } from "./AjustesCarga";

const VisualizadorCarga = dynamic(() => import("./VisualizadorCarga"), { ssr: false, loading: () => <div className="h-[480px] rounded-xl bg-[#eef2f6] flex items-center justify-center text-sm text-torg-gray">Carregando o 3D…</div> });

const fmtD = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function SimularCargaModal({ opId, opNumero, previo, onClose }) {
  const [dados, setDados] = useState(null), [erro, setErro] = useState(null);
  const [fase, setFase] = useState("carregando"), [progresso, setProgresso] = useState({ msg: "", frac: 0 });
  const [geo, setGeo] = useState(null), [perfil, setPerfil] = useState("recomendado");
  const [resultado, setResultado] = useState(null), [cargaSel, setCargaSel] = useState(0), [gravada, setGravada] = useState(null), [pdf, setPdf] = useState(null);
  const worker = useRef(null), viz = useRef(null);
  const [tentativa, setTentativa] = useState(0);
  const fecharRef = useRef(null);
  useEffect(() => {
    const anterior = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; fecharRef.current?.focus();
    return () => { document.body.style.overflow = overflow; anterior?.focus?.(); };
  }, []);
  // ajustes por marca da obra (AjusteCargaMarca): carregados junto com a lista; editar aqui e simular de novo
  const [ajustes, setAjustes] = useState({}), [editando, setEditando] = useState(null), [ajustesMudaram, setAjustesMudaram] = useState(false);
  useEffect(() => { fetch(`/api/comercial/op/${opId}/ajustes-carga`).then((r) => r.json()).then((j) => { if (j.success) setAjustes(j.ajustes || {}); }).catch(() => {}); }, [opId]);
  const salvarAjuste = async (marca, regras) => {
    const r = await fetch(`/api/comercial/op/${opId}/ajustes-carga`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marca, regras }) }).then((x) => x.json());
    if (!r.success) throw new Error(r.error || "Não salvou"); setAjustes(r.ajustes || {}); setAjustesMudaram(true);
  };

  // 1) a lista, o perfil da LQC e a última simulação
  useEffect(() => {
    fetch(`/api/comercial/op/${opId}/romaneios-previos/${previo.id}/simulacao`).then((r) => r.json())
      .then((j) => { if (!j.success) throw new Error(j.error || "Falha ao carregar"); setDados(j); setPerfil(j.perfilPadrao || "recomendado"); if (j.simulacao && !j.simulacao.desatualizada) { setResultado({ cargas: j.simulacao.cargas, resumo: j.simulacao.resumo, ...(j.simulacao.avisos || {}) }); setGravada(j.simulacao); } setFase("ifc"); })
      .catch((e) => { setErro(e.message); setFase("erro"); });
  }, [opId, previo.id, tentativa]);

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
        const descDe = new Map(dados.lista.map((i) => [String(i.marca).toUpperCase(), i.desc || ""]));
        const geometria = {}, malhas = {}, usados = [], porNome = [];
        for (const [k, mod] of modelos.entries()) {
          if (!faltantes.length) break;
          setProgresso({ msg: `Baixando ${mod.nome} (${k + 1} de ${modelos.length})…`, frac: 0.05 + 0.9 * k / modelos.length });
          const res = await fetch(`/api/producao/modelo-3d?opId=${opId}&rel=${encodeURIComponent(mod.rel)}`, { cache: "force-cache" });
          if (!res.ok) continue;
          const bytes = new Uint8Array(await res.arrayBuffer()); if (cancelado) return;
          // a descrição vai junto: se o IFC for de antes da renumeração da lista, a peça é achada pelo nome
          const g = await geometriaDoIfc(bytes, faltantes.map((m) => ({ marca: m, desc: descDe.get(m) || "" })), (msg, frac) => !cancelado && setProgresso({ msg: `${mod.nome}: ${msg}`, frac: 0.05 + 0.9 * (k + frac) / modelos.length })); if (cancelado) return;
          const achou = Object.keys(g.geometria); if (achou.length) usados.push({ nome: mod.nome, marcas: achou.length });
          Object.assign(geometria, g.geometria); Object.assign(malhas, g.malhas); faltantes = g.faltantes; porNome.push(...(g.porNome || []));
        }
        setGeo({ geometria, malhas, faltantes, porNome, ac: [...new Set(ac)], usados, modelo: usados.map((u) => u.nome).join(", ") || modelos[0].nome }); setFase("pronto");
      } catch (e) { if (!cancelado) { setErro(e.message); setFase("erro"); } }
    })();
    return () => { cancelado = true; };
  }, [fase, dados, opId]);

  useEffect(() => () => worker.current?.terminate(), []);

  // 3) o motor, num worker; 4) grava
  const simular = () => {
    if (!dados || !geo) return;
    setFase("simulando"); setErro(null); setGravada(null); setAjustesMudaram(false); setProgresso({ msg: "Montando os volumes e a carga…", frac: 0.5 });
    worker.current?.terminate();
    // ⚠ tem de ser exatamente `new Worker(new URL(…, import.meta.url))`: é essa forma que o webpack reconhece para empacotar o worker
    const w = new Worker(new URL("./simular.worker.js", import.meta.url)); worker.current = w;
    w.onmessage = async (ev) => {
      if (!ev.data.ok) { setErro(ev.data.erro); setFase("pronto"); return; }
      const r = ev.data.resultado; setResultado(r); setCargaSel(0); setFase("pronto");
      try {
        const res = await fetch(`/api/comercial/op/${opId}/romaneios-previos/${previo.id}/simulacao`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfil, itensHash: dados.hash, resumo: r.resumo, cargas: r.cargas, avisos: { especiais: r.especiais, ajustadas: r.ajustadas, semCaixa: r.semCaixa, estimadas: r.estimadas, perfil: r.perfil, gcModo: r.gcModo, porNome: geo.porNome || [], faltantes: geo.faltantes, ajustes } }) }).then((x) => x.json());
        if (res.success) setGravada(res.simulacao); else setErro(res.error || "A simulação não foi gravada.");
      } catch { setErro("A simulação não foi gravada."); }
    };
    w.onerror = (e) => { setErro(e.message || "Falha no simulador"); setFase("pronto"); };
    w.postMessage({ lista: dados.lista.filter((i) => !marcaEhAC(i.marca)), geometria: geo.geometria, perfil, prefixo: prefixoDaOp(opNumero), opcoes: dados.opcoes || {}, ajustes });
  };

  // PDF do modelo: fotografa o 3D (carga pronta + cada camada) e monta o A4 AQUI, no navegador.
  // ⚠ Vitor (14/09/2026): "não estou conseguindo exportar o pdf". Mandar as fotos para a rota estourava
  // os 4,5 MB de corpo da Vercel numa carga com várias camadas (3 + 2×camadas JPEGs) — e o
  // `window.open` depois do `await` caía no bloqueador de pop-up. Agora nada sobe: o pdf-lib roda
  // aqui (import dinâmico, fora do bundle da tela) e o arquivo desce por um <a download>.
  const gerarPdf = async () => {
    const v = viz.current, c = resultado?.cargas?.[cargaSel]; if (!c || !dados?.op) return;
    // ⚠ nunca falhar em silêncio: se o 3D não entregou a API (ver apiRef no VisualizadorCarga), a tela diz
    if (!v?.capturar) { setErro("O 3D ainda não está pronto para fotografar — espere o modelo aparecer e clique de novo."); return; }
    setPdf({ gerando: true }); setErro(null);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const camadas = [...new Set(c.itens.map((u) => u.camada || 0))].sort((a, b) => a - b);
      const imagens = { full: {}, camadas: [], volumes: {} };
      const totalFotos = 3 + camadas.length * 2 + c.itens.length; let foto = 0;
      const progressoPdf = async () => { setPdf({ gerando: true, etapa: `Preparando imagem ${++foto} de ${totalFotos}` }); await new Promise((r) => setTimeout(r, 0)); };
      for (const vista of ["iso", "lado", "topo"]) { await progressoPdf(); imagens.full[vista] = v.capturar(vista); }
      for (const ci of camadas) {
        await progressoPdf(); const iso = v.capturar("iso", ci);
        await progressoPdf(); const topo = v.capturar("topo", ci); imagens.camadas.push({ ci, iso, topo });
      }
      for (const u of c.itens) { await progressoPdf(); imagens.volumes[u.id] = v.capturarVolume?.(u.id) || null; }
      setPdf({ gerando: true, etapa: "Organizando as páginas do PDF…" });
      const [{ gerarModeloCargaPDF }, logo] = await Promise.all([
        import("@/lib/carga/modelo-carga-pdf"),
        fetch("/torg-logo-white.png").then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
      ]);
      const estimadas = (resultado.estimadas || []).filter((e) => c.itens?.some((u) => (u.membros || []).some((m) => m.marca === e.marca)));
      const perfilNome = gravada?.perfilNome || resultado.perfil?.nome || dados.perfis?.find((p) => p.chave === perfil)?.nome || perfil;
      const { bytes, filename } = await gerarModeloCargaPDF({ op: dados.op, previo: dados.previo || previo, carga: c, indice: cargaSel, total: resultado.cargas.length, perfilNome, prefixo: prefixoDaOp(dados.op.numero || opNumero), imagens, estimadas, ajustes, logo });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      setPdf({ url, nome: filename });
      const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setPdf(null); setErro(e.message || "Não consegui gerar o PDF."); }
  };
  useEffect(() => () => { if (pdf?.url) URL.revokeObjectURL(pdf.url); }, [pdf]);

  const carga = resultado?.cargas?.[cargaSel] || null;
  const ocupado = fase === "carregando" || fase === "ifc" || fase === "simulando";
  return (
    <div className="fixed inset-0 z-50 bg-torg-dark/60 sm:p-3 lg:p-5 flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-simular-carga" className="bg-[#F3F6F9] sm:rounded-2xl shadow-2xl w-full max-w-[1600px] h-[100dvh] sm:h-[calc(100dvh-1.5rem)] lg:h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden" onKeyDown={(e) => {
        if (editando) return;
        if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        if (e.key === "Tab") {
          const elementos = [...e.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary')].filter((el) => el.getClientRects().length);
          const primeiro = elementos[0], ultimo = elementos[elementos.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
        }
      }}>
        <header className="px-4 sm:px-6 py-4 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex h-11 w-11 rounded-xl bg-torg-blue-50 items-center justify-center text-torg-blue"><Truck size={23} /></div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-torg-gray">OP {opNumero} · Romaneio prévio {String(previo.numero).padStart(2, "0")}</p>
            <h2 id="titulo-simular-carga" className="text-xl sm:text-2xl font-bold text-torg-dark">Simular carga</h2>
          </div>
          <div className="hidden md:flex items-center gap-5 text-sm text-torg-gray">
            {dados && <><span><b className="text-torg-dark">{dados.lista.length}</b> marcas</span><span><b className="text-torg-dark">{dados.lista.reduce((t, i) => t + i.qtd, 0).toLocaleString("pt-BR")}</b> peças</span><span><b className="text-torg-dark">{Math.round(dados.previo.pesoKg || 0).toLocaleString("pt-BR")}</b> kg no romaneio</span></>}
          </div>
          <button ref={fecharRef} onClick={onClose} aria-label="Fechar simulação" className="h-11 w-11 shrink-0 rounded-xl text-torg-gray hover:bg-slate-100 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-torg-blue"><X size={22} /></button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="block sm:w-64 text-sm font-semibold text-torg-dark">Padrão de embalagem
              <select value={perfil} onChange={(e) => setPerfil(e.target.value)} disabled={ocupado || pdf?.gerando} className="mt-1.5 w-full h-11 text-sm font-normal text-torg-dark rounded-lg px-3 border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-torg-blue/30" title="O padrão vem da LQC da obra">
                {(dados?.perfis || [{ chave: "recomendado", nome: "Padrão" }]).map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={simular} disabled={ocupado || !geo || pdf?.gerando} className="min-h-11 text-sm font-semibold bg-torg-blue text-white rounded-lg px-4 inline-flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-torg-dark">
                {fase === "simulando" ? <Loader2 size={17} className="animate-spin" /> : resultado ? <RefreshCw size={17} /> : <Play size={17} />} {resultado ? "Simular de novo" : "Simular"}
              </button>
              <button onClick={gerarPdf} disabled={ocupado || !resultado || !geo || pdf?.gerando} className="min-h-11 text-sm font-semibold bg-white border border-slate-200 text-torg-dark rounded-lg px-4 inline-flex items-center justify-center gap-2 disabled:opacity-40 hover:bg-slate-50" title="Modelo de carga para a Expedição">
                {pdf?.gerando ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />} {pdf?.gerando ? "Gerando PDF…" : "PDF do modelo"}
              </button>
            </div>
            <p className="sm:ml-auto text-xs text-torg-gray sm:text-right leading-relaxed">Confira o veículo, a disposição<br className="hidden sm:block" /> e a sequência de carregamento.</p>
          </div>
          {pdf?.gerando && <p role="status" className="rounded-xl border border-torg-blue-200 bg-torg-blue-50 p-4 text-sm text-torg-dark flex items-center gap-2"><Loader2 size={17} className="animate-spin text-torg-blue" />{pdf.etapa || "Preparando o PDF…"}</p>}
          {ocupado && (
            <div className="bg-white rounded-xl border border-gray-100 px-4 py-3">
              <div className="text-sm text-torg-dark inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin text-torg-blue" /> {progresso.msg || "Carregando…"}</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-torg-blue transition-all" style={{ width: `${Math.round(100 * (progresso.frac || 0))}%` }} /></div>
            </div>
          )}
          {erro && <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-4 flex flex-wrap items-center gap-2"><AlertCircle size={18} className="shrink-0" /><span className="flex-1 min-w-0">{erro}</span>{fase === "erro" && <button onClick={() => { setErro(null); if (dados) setFase("ifc"); else { setFase("carregando"); setTentativa((t) => t + 1); } }} className="min-h-11 border border-red-200 rounded-lg px-3 font-semibold">Tentar novamente</button>}</div>}
          {geo && !resultado && fase === "pronto" && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 text-sm leading-relaxed text-torg-dark">
              Marcas medidas no modelo: <b>{Object.keys(geo.geometria).length}</b> de {dados.lista.length}{geo.ac?.length ? <> · {geo.ac.length} AC (parafusos e acessórios comprados) ficam fora da carga</> : null}.
              {geo.porNome?.length > 0 && <p className="mt-1 text-amber-800"><b>Numeração do IFC diferente da lista ({geo.porNome.length}):</b> {geo.porNome.slice(0, 15).join(", ")}{geo.porNome.length > 15 ? ` e mais ${geo.porNome.length - 15}` : ""} — o modelo é de antes da revisão; a peça foi achada pela descrição, confira a medida.</p>}
              {geo.faltantes.length > 0 && <p className="mt-1 text-amber-800"><b>Fora do IFC ({geo.faltantes.length}):</b> {geo.faltantes.slice(0, 15).join(", ")}{geo.faltantes.length > 15 ? ` e mais ${geo.faltantes.length - 15}` : ""} — entram na carga com medida estimada pelo peso; conferir no pátio.</p>}
              <p className="mt-1">Escolha a embalagem e clique em <b>Simular</b>.</p>
              {dados.simulacao?.desatualizada && <p className="mt-1 text-amber-800">A última simulação ({fmtD(dados.simulacao.createdAt)}) é de antes de o romaneio mudar — simule de novo.</p>}
            </div>
          )}
          {resultado && (
            <fieldset disabled={!!pdf?.gerando} className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-torg-gray">
                {gravada ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={15} className="text-emerald-600" /> Gravada em {fmtD(gravada.createdAt)} · {gravada.perfilNome}</span> : <span>Resultado não gravado</span>}
                {resultado.gcModo && <span>Guarda-corpo: {resultado.gcModo === "engradado" ? "em pé em engradado" : "deitado em pacote"}</span>}
                {pdf?.url && <a href={pdf.url} download={pdf.nome} className="sm:ml-auto text-torg-blue font-semibold hover:underline inline-flex items-center gap-1.5 min-h-9"><FileText size={15} /> Baixar PDF gerado</a>}
              </div>
              {ajustesMudaram && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Os ajustes mudaram. Clique em <b>Simular de novo</b> para atualizar a disposição da carga.</p>}
              <AvisosSimulacao resultado={resultado} />
              <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
                <ResumoSimulacao resultado={resultado} cargaSel={cargaSel} onCarga={setCargaSel} />
                <div className="min-w-0 space-y-3">
                  {carga && geo && <VisualizadorCarga apiRef={viz} carga={carga} malhas={geo.malhas} madeira={resultado.madeira || 100} altura={480} />}
                  {carga && !geo && <div className="min-h-64 rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-center text-sm text-torg-gray">{fase === "erro" ? "O modelo 3D não está disponível. Tente carregar novamente." : "Baixando o modelo para desenhar o 3D…"}</div>}
                  {geo?.modelo && <details className="text-xs text-torg-gray px-1"><summary className="cursor-pointer py-2">Modelo de referência</summary><p className="break-words pb-2">{geo.modelo}</p></details>}
                </div>
              </div>
              {carga && <VolumesDaCarga key={cargaSel} carga={carga} ajustes={ajustes} onAjustar={(marca, desc) => setEditando({ marca, desc })} />}
            </fieldset>
          )}
          {dados && fase !== "carregando" && <details className="group bg-white rounded-xl border border-slate-200">
            <summary className="flex items-center gap-2 p-4 cursor-pointer list-none text-sm font-semibold text-torg-dark"><SlidersHorizontal size={18} className="text-torg-blue" /> Ajustes por marca <span className="font-normal text-xs text-torg-gray">({Object.keys(ajustes).length})</span><ChevronDown size={18} className="ml-auto group-open:rotate-180" /></summary>
            <div className="px-4 pb-4"><p className="text-xs text-torg-gray mb-3">Defina exceções de embalagem, posição e medidas. Os ajustes ficam salvos para os próximos romaneios desta OP.</p><ListaAjustes ajustes={ajustes} lista={dados.lista} desatualizada={ajustesMudaram && !!resultado} onEditar={(marca, desc) => setEditando({ marca, desc })} /></div>
          </details>}
        </div>
      </div>
      {editando && <EditorAjuste marca={editando.marca} desc={editando.desc} regras={ajustes[editando.marca] || null} semGeometria={!!geo && !geo.geometria[editando.marca]} onSalvar={salvarAjuste} onFechar={() => setEditando(null)} />}
    </div>
  );
}
