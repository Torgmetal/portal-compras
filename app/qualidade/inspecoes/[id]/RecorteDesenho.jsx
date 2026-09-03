"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle, X, Check, RotateCcw } from "lucide-react";

/**
 * O RECORTE MANUAL DO DESENHO.
 *
 * Vitor (03/09/2026): "quero poder colocar o projeto dentro do relatório e poder mover ele dentro
 * para mostrar apenas o que eu selecionar" — o recorte automático (`recortarVista`) acerta a
 * maioria das peças, mas numa folha com várias vistas parecidas (um diagrama de montagem tem isso
 * aos montes) ele pode escolher a vista errada, e não havia como corrigir.
 *
 * Mostra a FOLHA INTEIRA (sem decisão nenhuma do algoritmo) e deixa arrastar um retângulo por cima.
 * Esse retângulo é a mesma caixa que passa a valer para a marcação de cota E para o PDF final — os
 * dois leem `desenho.recorte` a partir daqui.
 */
export default function RecorteDesenho({ relatorioId, marca, onSalvo, onCancelar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [caixa, setCaixa] = useState(null); // {left, right, bottom, top} em pontos da folha original
  const [arrasto, setArrasto] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [tick, setTick] = useState(0);
  const cv = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(""); setCaixa(null);
    fetch(`/api/qualidade/inspecoes/${relatorioId}/pagina${marca ? `?marca=${encodeURIComponent(marca)}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then((j) => { if (!vivo) return; setDados(j); if (j.recorte) setCaixa(j.recorte); })
      .catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [relatorioId, marca]);

  // ⚠ sem PADDING: aqui é a folha crua, não a vista já recortada — não há linha de cota para caber
  // do lado de fora.
  const layout = useCallback(() => {
    if (!dados || !box.current) return null;
    const dispL = box.current.clientWidth || 600;
    const dispA = Math.max(360, window.innerHeight - 320);
    const esc = Math.min(dispL / dados.largura, dispA / dados.altura);
    return { esc, larg: dados.largura * esc, alt: dados.altura * esc };
  }, [dados]);

  const paraTela = (x, y, L) => [x * L.esc, L.alt - y * L.esc];
  const paraDesenho = (x, y, L) => [x / L.esc, (L.alt - y) / L.esc];

  useEffect(() => {
    const L = layout();
    if (!L || !cv.current || !dados) return;
    const c = cv.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = L.larg * dpr; c.height = L.alt * dpr;
    c.style.width = `${L.larg}px`; c.style.height = `${L.alt}px`;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L.larg, L.alt);
    g.fillStyle = "#fff"; g.fillRect(0, 0, L.larg, L.alt);

    g.strokeStyle = "#94a3b8"; g.lineWidth = 0.5; g.beginPath();
    for (const [x1, y1, x2, y2] of dados.segs || []) {
      const a = paraTela(x1, y1, L), b = paraTela(x2, y2, L);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();

    g.fillStyle = "#64748b"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    for (const t of dados.textos || []) {
      const [tx, ty] = paraTela(t.x, t.y, L);
      const tam = Math.max(5, t.t * L.esc);
      g.save(); g.translate(tx, ty);
      if (t.v) g.rotate(-Math.PI / 2);
      g.font = `${tam}px sans-serif`;
      g.fillText(t.s, 0, 0);
      g.restore();
    }

    if (caixa) {
      const x0 = Math.min(caixa.left, caixa.right), x1 = Math.max(caixa.left, caixa.right);
      const y0 = Math.min(caixa.bottom, caixa.top), y1 = Math.max(caixa.bottom, caixa.top);
      const a = paraTela(x0, y1, L), b = paraTela(x1, y0, L);
      g.fillStyle = "rgba(244,128,31,0.15)";
      g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      g.strokeStyle = "#F4801F"; g.lineWidth = 1.6;
      g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    }
  }, [dados, caixa, layout, tick]);

  // ⚠ mesma insurance da MarcadorCotas: a caixa só tem largura final depois do primeiro layout.
  useEffect(() => {
    const f = () => setTick((v) => v + 1);
    window.addEventListener("resize", f);
    const t = setTimeout(f, 30);
    return () => { window.removeEventListener("resize", f); clearTimeout(t); };
  }, []);

  function pontoEvento(e) {
    const L = layout(); if (!L) return null;
    const r = cv.current.getBoundingClientRect();
    return paraDesenho(e.clientX - r.left, e.clientY - r.top, L);
  }
  function dentroDaCaixa(x, y) {
    if (!caixa) return false;
    const x0 = Math.min(caixa.left, caixa.right), x1 = Math.max(caixa.left, caixa.right);
    const y0 = Math.min(caixa.bottom, caixa.top), y1 = Math.max(caixa.bottom, caixa.top);
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  // ⚠ clique DENTRO do retângulo já desenhado MOVE; clique fora começa um novo (redesenhar é o
  // jeito de mudar o tamanho — mais simples que alças de redimensionar, e resolve o pedido: "poder
  // mover ele dentro para mostrar apenas o que eu selecionar").
  function aoPressionar(e) {
    const p = pontoEvento(e); if (!p) return;
    if (dentroDaCaixa(p[0], p[1])) {
      setArrasto({
        tipo: "mover", offX: p[0] - Math.min(caixa.left, caixa.right), offY: p[1] - Math.min(caixa.bottom, caixa.top),
        largura: Math.abs(caixa.right - caixa.left), altura: Math.abs(caixa.top - caixa.bottom),
      });
    } else {
      setArrasto({ tipo: "novo", x0: p[0], y0: p[1] });
      setCaixa({ left: p[0], right: p[0], bottom: p[1], top: p[1] });
    }
  }
  function aoMover(e) {
    if (!arrasto) return;
    const p = pontoEvento(e); if (!p) return;
    if (arrasto.tipo === "novo") {
      setCaixa({ left: Math.min(arrasto.x0, p[0]), right: Math.max(arrasto.x0, p[0]), bottom: Math.min(arrasto.y0, p[1]), top: Math.max(arrasto.y0, p[1]) });
    } else {
      const left = p[0] - arrasto.offX, bottom = p[1] - arrasto.offY;
      setCaixa({ left, right: left + arrasto.largura, bottom, top: bottom + arrasto.altura });
    }
  }
  function aoSoltar() { setArrasto(null); }

  const caixaValida = caixa && Math.abs(caixa.right - caixa.left) >= 20 && Math.abs(caixa.top - caixa.bottom) >= 20;

  async function salvar() {
    if (!caixaValida) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${relatorioId}/recorte`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca: dados.marca, recorte: caixa }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      onSalvo?.();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }
  async function usarAutomatico() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/qualidade/inspecoes/${relatorioId}/recorte`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca: dados.marca, recorte: null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro");
      setCaixa(null);
      onSalvo?.();
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  if (erro) return <p className="text-[12px] text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={14} /> {erro}</p>;
  if (!dados) return <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> lendo a folha inteira…</p>;

  return (
    <div>
      <p className="text-[11px] text-torg-gray mb-1.5">
        Arraste para desenhar o retângulo — é ele que vira a imagem do relatório (e a área da marcação de cotas).
        Clique dentro do retângulo já desenhado para movê-lo; para mudar o tamanho, desenhe outro por cima.
        {" "}Se este desenho já tem cotas marcadas, confira a posição delas depois de trocar o recorte.
      </p>
      <div ref={box} className="w-full">
        <div className="border border-gray-200 rounded-lg overflow-auto bg-white max-w-full inline-block">
          <canvas ref={cv} onMouseDown={aoPressionar} onMouseMove={aoMover} onMouseUp={aoSoltar} onMouseLeave={aoSoltar}
            className="block cursor-crosshair" />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <button onClick={salvar} disabled={!caixaValida || salvando}
          className="text-[12px] font-semibold text-white bg-torg-blue hover:bg-torg-dark rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40">
          {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar recorte
        </button>
        <button onClick={usarAutomatico} disabled={salvando}
          className="text-[12px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1.5 disabled:opacity-40">
          <RotateCcw size={13} /> usar recorte automático
        </button>
        <button onClick={onCancelar} className="ml-auto text-[12px] text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
          <X size={13} /> fechar
        </button>
      </div>
    </div>
  );
}
