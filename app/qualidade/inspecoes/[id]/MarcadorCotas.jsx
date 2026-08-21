"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle, Trash2, Undo2 } from "lucide-react";

/**
 * MARCAR AS COTAS NO DESENHO.
 *
 * Vitor (21/08/2026): "seria possível você trazer apenas o desenho sem as cotas e quem for gerar o
 * relatório eu conseguir fazer a cota no desenho específico?" — e, sobre a referência: "colocarmos
 * cota simples e referenciamos como cota A B C".
 *
 * A pessoa clica em dois pontos do desenho e nasce a cota A; depois a B, a C. Cada uma leva nome,
 * especificação e tolerância, igual ao modelo em Excel dele (`( A ) Interno · Espec. 1250mm +/- 3mm`).
 *
 * ⚠ O CLIQUE GRUDA NO TRAÇO. O desenho chega em vetor, então dá para prender o ponto no vértice
 * mais próximo — a cota nasce na coordenada real do projeto, não onde o mouse caiu. Sem isso, medir
 * em cima de uma imagem erraria alguns milímetros a cada clique.
 *
 * ⚠ A COTA APONTA, NÃO MEDE. O valor de projeto é o que se digita em "Espec."; a linha só mostra
 * ONDE medir. É por isso que não é preciso descobrir a escala do PDF.
 */

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SNAP = 12; // px de imã

export default function MarcadorCotas({ relatorioId, marca, cotas, onChange }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [pendente, setPendente] = useState(null); // primeiro ponto já clicado
  const [hover, setHover] = useState(null);
  const [rascunho, setRascunho] = useState(null); // { ax, ay, bx, by } esperando nome/espec
  const cv = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro("");
    fetch(`/api/qualidade/inspecoes/${relatorioId}/vetor${marca ? `?marca=${encodeURIComponent(marca)}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then((j) => vivo && setDados(j))
      .catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [relatorioId, marca]);

  // escala e deslocamento para caber na largura disponível
  const layout = useCallback(() => {
    if (!dados || !box.current) return null;
    const larg = box.current.clientWidth || 600;
    const esc = larg / dados.largura;
    return { esc, larg, alt: dados.altura * esc };
  }, [dados]);

  // vértices para o imã
  const vertices = useCallback(() => {
    if (!dados) return [];
    const v = [];
    for (const [x1, y1, x2, y2] of dados.segs) { v.push([x1, y1]); v.push([x2, y2]); }
    return v;
  }, [dados]);

  const paraTela = (p, L) => [p[0] * L.esc, L.alt - p[1] * L.esc];
  const paraDesenho = (x, y, L) => [x / L.esc, (L.alt - y) / L.esc];

  useEffect(() => {
    const L = layout();
    if (!L || !cv.current) return;
    const c = cv.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = L.larg * dpr; c.height = L.alt * dpr;
    c.style.width = `${L.larg}px`; c.style.height = `${L.alt}px`;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, L.larg, L.alt);
    g.fillStyle = "#fff"; g.fillRect(0, 0, L.larg, L.alt);

    // o desenho
    g.strokeStyle = "#334155"; g.lineWidth = 0.6; g.beginPath();
    for (const [x1, y1, x2, y2] of dados.segs) {
      const a = paraTela([x1, y1], L), b = paraTela([x2, y2], L);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();

    // as cotas já marcadas
    const desenhaCota = (co, cor, rotulo) => {
      const a = paraTela([co.ax, co.ay], L), b = paraTela([co.bx, co.by], L);
      g.strokeStyle = cor; g.lineWidth = 2;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      for (const p of [a, b]) { g.beginPath(); g.arc(p[0], p[1], 3, 0, 7); g.fillStyle = cor; g.fill(); }
      if (rotulo) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        g.fillStyle = cor;
        g.beginPath(); g.arc(mx, my, 9, 0, 7); g.fill();
        g.fillStyle = "#fff"; g.font = "bold 11px sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(rotulo, mx, my);
      }
    };
    for (const co of cotas) desenhaCota(co, "#F4801F", co.letra);
    if (rascunho) desenhaCota(rascunho, "#006EAB", null);

    // o ponto pendente e a borracha do imã
    if (pendente) {
      const p = paraTela(pendente, L);
      g.fillStyle = "#006EAB"; g.beginPath(); g.arc(p[0], p[1], 4, 0, 7); g.fill();
      if (hover) {
        const h = paraTela(hover, L);
        g.strokeStyle = "#006EAB"; g.lineWidth = 1.5; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(h[0], h[1]); g.stroke();
        g.setLineDash([]);
      }
    }
    if (hover) {
      const h = paraTela(hover, L);
      g.strokeStyle = "#006EAB"; g.lineWidth = 1.5;
      g.beginPath(); g.arc(h[0], h[1], 5, 0, 7); g.stroke();
    }
  }, [dados, cotas, pendente, hover, rascunho, layout]);

  function pontoDoEvento(e) {
    const L = layout(); if (!L) return null;
    const r = cv.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const [dx, dy] = paraDesenho(x, y, L);
    // imã: o vértice mais próximo dentro do raio
    let melhor = null, dist = SNAP / L.esc;
    for (const v of vertices()) {
      const d = Math.hypot(v[0] - dx, v[1] - dy);
      if (d < dist) { dist = d; melhor = v; }
    }
    return melhor || [dx, dy];
  }

  function clique(e) {
    const p = pontoDoEvento(e); if (!p) return;
    if (!pendente) { setPendente(p); return; }
    setRascunho({ ax: pendente[0], ay: pendente[1], bx: p[0], by: p[1] });
    setPendente(null);
  }

  function confirmar(espec, tol) {
    const letra = LETRAS[cotas.length] || `C${cotas.length + 1}`;
    onChange([...cotas, {
      letra,
      // ⚠ o rótulo é SÓ "Cota A". Vitor (21/08/2026): "nas marcações laterais você precisa trazer
      // apenas isso: cota A, Cota B e Cota C". Quem diz o que medir é a marca no desenho, não um
      // nome repetido na tabela.
      descricao: `Cota ${letra}`,
      projetoMm: espec === "" ? null : Number(espec),
      tolerancia: tol ? `± ${tol}` : "",
      encontradoMm: null,
      ...rascunho,
    }]);
    setRascunho(null);
  }

  function remover(i) {
    // ⚠ as letras se renumeram: buraco no meio (A, C, D) confunde quem mede
    const restantes = cotas.filter((_, k) => k !== i).map((c, k) => {
      const letra = LETRAS[k] || `C${k + 1}`;
      return { ...c, letra, descricao: `Cota ${letra}` };
    });
    onChange(restantes);
  }

  if (erro) return <p className="text-[12px] text-red-600 inline-flex items-center gap-1.5"><AlertCircle size={14} /> {erro}</p>;
  if (!dados) return <p className="text-[12px] text-torg-gray inline-flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> lendo o desenho…</p>;

  return (
    <div>
      <p className="text-[11px] text-torg-gray mb-1.5">
        {pendente ? "Agora clique no segundo ponto da cota." : "Clique em dois pontos do desenho para criar uma cota. O clique gruda no traço."}
        {pendente && <button onClick={() => setPendente(null)} className="ml-2 text-torg-blue inline-flex items-center gap-1"><Undo2 size={11} /> cancelar</button>}
      </p>
      <div ref={box} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <canvas ref={cv} onClick={clique} onMouseMove={(e) => setHover(pontoDoEvento(e))} onMouseLeave={() => setHover(null)}
          className="block cursor-crosshair" />
      </div>

      {rascunho && <FormCota onConfirmar={confirmar} onCancelar={() => setRascunho(null)} letra={LETRAS[cotas.length] || "?"} />}

      {cotas.length > 0 && (
        <ul className="mt-2 space-y-1">
          {cotas.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-5 h-5 rounded-full bg-torg-orange text-white font-bold text-[10px] inline-flex items-center justify-center shrink-0">{c.letra}</span>
              <span className="text-torg-dark flex-1">{c.descricao}</span>
              <span className="font-mono text-torg-dark">{c.projetoMm ?? "—"}</span>
              <span className="text-torg-gray w-14 text-right">{c.tolerancia || ""}</span>
              <button onClick={() => remover(i)} className="text-torg-gray hover:text-red-600"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormCota({ onConfirmar, onCancelar, letra }) {
  const [espec, setEspec] = useState("");
  const [tol, setTol] = useState("3");
  return (
    <div className="mt-2 p-2.5 bg-torg-blue-50 border border-torg-blue-200 rounded-lg flex items-end gap-2 flex-wrap">
      <span className="w-6 h-6 rounded-full bg-torg-blue text-white font-bold text-[11px] inline-flex items-center justify-center shrink-0">{letra}</span>
      <span className="text-[12px] font-semibold text-torg-dark self-center">Cota {letra}</span>
      <label className="w-28">
        <span className="block text-[10px] text-torg-gray mb-0.5">Espec. (mm)</span>
        <input autoFocus type="number" value={espec} onChange={(e) => setEspec(e.target.value)}
          className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] font-mono" />
      </label>
      <label className="w-20">
        <span className="block text-[10px] text-torg-gray mb-0.5">Tol. ±</span>
        <input type="number" value={tol} onChange={(e) => setTol(e.target.value)}
          className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] font-mono" />
      </label>
      <button onClick={() => onConfirmar(espec, tol)} disabled={espec === ""}
        className="bg-torg-blue text-white rounded px-3 py-1.5 text-[12px] font-medium disabled:opacity-40">Criar cota</button>
      <button onClick={onCancelar} className="text-[12px] text-torg-gray px-2 py-1.5">Cancelar</button>
    </div>
  );
}
