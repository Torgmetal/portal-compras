"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, AlertCircle, Maximize2, X } from "lucide-react";
import { layoutCotas, setaEm, PADDING } from "@/lib/cota-marcacao";

/**
 * O DESENHO COM AS COTAS, NA MÃO DO INSPETOR — SÓ LEITURA.
 *
 * Vitor (03/09/2026): "no relatório de pré-montagem consegue trazer os desenhos que criamos nos
 * relatórios para ele ter referência das cotas?".
 *
 * Sem isto o celular listava "Cota A · 1250 ± 3" e mais nada: o inspetor sabia o VALOR, mas não
 * onde medir. Numa peça grande, cota pelo nome é convite a medir o vão errado e aprovar a peça
 * errada.
 *
 * ⚠ SÓ LEITURA, de propósito. Quem marca, apaga e recorta é a Qualidade no computador
 * (MarcadorCotas). Aqui o desenho é referência — dar a borracha para quem está no meio do galpão
 * seria abrir caminho para o relatório mudar de conteúdo depois de alguém já tê-lo revisado.
 *
 * ⚠ Reusa `layoutCotas` (lib/cota-marcacao), o MESMO layout do computador e do PDF: a Cota A tem
 * de estar no mesmo lugar nos três, senão a referência não é referência.
 */
export default function VistaCotas({ relatorioId, marca, cotas = [], ocultos = [], linhasOcultas = [] }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [amplo, setAmplo] = useState(false);
  const [tick, setTick] = useState(0);
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

  const layout = useCallback(() => {
    if (!dados || !box.current) return null;
    const dispL = box.current.clientWidth || 320;
    // em tela cheia usa a janela; embutido, uma faixa que não empurre o resto da tela para longe
    const dispA = amplo ? Math.max(320, window.innerHeight - 120) : 260;
    const W = dados.largura + PADDING * 2, H = dados.altura + PADDING * 2;
    const esc = Math.min(dispL / W, dispA / H);
    return { esc, larg: W * esc, alt: H * esc };
  }, [dados, amplo]);

  const telaPad = (p, L) => [p[0] * L.esc, L.alt - p[1] * L.esc];
  const paraTela = (p, L) => telaPad([p[0] + PADDING, p[1] + PADDING], L);

  useEffect(() => {
    const L = layout();
    if (!L || !cv.current || !dados) return;
    const c = cv.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = L.larg * dpr; c.height = L.alt * dpr;
    c.style.width = `${L.larg}px`; c.style.height = `${L.alt}px`;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff"; g.fillRect(0, 0, L.larg, L.alt);

    // ⚠ o que a Qualidade apagou no computador continua apagado aqui — o inspetor tem de ver o
    // MESMO desenho que virou documento, não a folha crua do Tekla.
    const apagadas = new Set((linhasOcultas || []).map((l) => l.join(",")));
    g.strokeStyle = "#334155"; g.lineWidth = 0.6; g.beginPath();
    for (const sg of dados.segs || []) {
      if (apagadas.has(sg.join(","))) continue;
      const a = paraTela([sg[0], sg[1]], L), b = paraTela([sg[2], sg[3]], L);
      g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();

    // ⚠ casa pela posição ORIGINAL do texto (`tx`/`ty`), não pela caixa: a caixa cresceu para
    // engolir a moldura do rótulo e já não coincide com o canto do texto. Mesma regra do
    // MarcadorCotas — o inspetor tem de ver a mesma limpeza que a Qualidade fez.
    const apagado = (t) => (ocultos || []).some((o) =>
      Math.abs((o.tx ?? o.x) - t.x) < 0.6 && Math.abs((o.ty ?? o.y) - t.y) < 0.6);
    g.fillStyle = "#0f172a"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    for (const t of dados.textos || []) {
      if (apagado(t)) continue;
      const [tx, ty] = paraTela([t.x, t.y], L);
      const tam = Math.max(5, t.t * L.esc);
      g.save(); g.translate(tx, ty);
      if (t.v) g.rotate(-Math.PI / 2);
      g.font = `${tam}px sans-serif`;
      g.fillText(t.s, 0, 0);
      g.restore();
    }

    const traco = (a, b) => { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); };
    for (const m of layoutCotas(cotas.filter((c0) => c0.letra), dados.largura, dados.altura)) {
      if (!m) continue;
      g.strokeStyle = "#F4801F";
      g.lineWidth = 0.8;
      traco(telaPad(m.ext1.a, L), telaPad(m.ext1.b, L));
      traco(telaPad(m.ext2.a, L), telaPad(m.ext2.b, L));
      g.lineWidth = 1.4;
      const la = telaPad(m.linha.a, L), lb = telaPad(m.linha.b, L);
      traco(la, lb);
      for (const [p, q] of [[la, lb], [lb, la]]) {
        for (const [s1, s2] of setaEm(p, [q[0] - p[0], q[1] - p[1]], 6)) traco(s1, s2);
      }
      const r = telaPad([m.rotulo.x, m.rotulo.y], L);
      g.fillStyle = "#F4801F";
      g.font = "bold 13px sans-serif";
      g.textAlign = "center"; g.textBaseline = m.vertical ? "middle" : "bottom";
      g.save();
      g.translate(r[0], r[1]);
      if (m.vertical) { g.rotate(-Math.PI / 2); g.textBaseline = "bottom"; }
      g.fillText(String(m.letra || ""), 0, 0);
      g.restore();
    }
  }, [dados, cotas, layout, tick, ocultos, linhasOcultas]);

  // ⚠ a caixa só tem largura final depois da primeira pintura; sem isto o desenho nasce miúdo
  useEffect(() => {
    const f = () => setTick((v) => v + 1);
    window.addEventListener("resize", f);
    const t = setTimeout(f, 40);
    return () => { window.removeEventListener("resize", f); clearTimeout(t); };
  }, [amplo]);

  if (erro) {
    return (
      <p className="text-[12.5px] text-torg-gray inline-flex items-start gap-1.5">
        <AlertCircle size={14} className="mt-0.5 shrink-0" /> Desenho indisponível: {erro}
      </p>
    );
  }
  if (!dados) {
    return (
      <p className="text-[12.5px] text-torg-gray inline-flex items-center gap-1.5">
        <Loader2 size={14} className="animate-spin" /> abrindo o desenho…
      </p>
    );
  }

  return (
    <div className={amplo ? "fixed inset-0 z-50 bg-white p-3 overflow-auto" : ""}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[12px] text-torg-gray">As cotas marcadas no relatório, no desenho.</p>
        <button onClick={() => setAmplo((v) => !v)}
          className="text-[12px] text-torg-blue font-medium inline-flex items-center gap-1 px-2 py-1">
          {amplo ? <><X size={14} /> fechar</> : <><Maximize2 size={14} /> ampliar</>}
        </button>
      </div>
      <div ref={box} className="w-full">
        <div className="border border-gray-200 rounded-xl overflow-auto bg-white">
          <canvas ref={cv} className="block" />
        </div>
      </div>
    </div>
  );
}
