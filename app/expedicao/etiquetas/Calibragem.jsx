"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Move } from "lucide-react";
import { lerJson } from "@/lib/ler-json";

// CALIBRAGEM DA IMPRESSORA — quanto o desenho precisa andar para cair no adesivo.
//
// ⚠⚠ CONSERTO DE MÁQUINA, NÃO DESIGN, e a tela diz isso. O PDF desenha de 1,2 a 98,8 mm numa página
// de 100: está centrado. Se sai cortado, a origem de impressão da Argox está deslocada — o lugar
// certo de corrigir é o driver. Isto existe porque o driver dela nem sempre expõe esse ajuste.
//
// ⚠ FICA RECOLHIDO. É ajuste de UMA vez, não decisão de cada impressão: aberto o tempo todo,
// convidaria a mexer em algo que só deve mudar quando a etiqueta sai torta.

const passo = (v, d) => Math.round(((Number(v) || 0) + d) * 10) / 10;

export default function Calibragem() {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState({ deslocX: 0, deslocY: 0 });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const j = await lerJson(await fetch("/api/expedicao/etiquetas/calibragem", { cache: "no-store" }), "Calibragem");
      setValor({ deslocX: j.deslocX || 0, deslocY: j.deslocY || 0 });
    } catch { /* sem calibragem a etiqueta sai como foi projetada — não é erro que valha alarme */ }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const salvar = async () => {
    setSalvando(true); setErro(""); setSalvo(false);
    try {
      const j = await lerJson(await fetch("/api/expedicao/etiquetas/calibragem", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valor),
      }), "Calibragem");
      setValor({ deslocX: j.deslocX, deslocY: j.deslocY });
      setSalvo(true);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  };

  const mexeu = valor.deslocX !== 0 || valor.deslocY !== 0;

  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)}
        className="text-[12.5px] text-torg-blue font-semibold flex items-center gap-1.5 mb-5">
        <Move size={14} /> A etiqueta sai cortada na borda? Ajustar a posição
        {mexeu && <span className="text-torg-gray font-normal">(hoje: {valor.deslocX} mm ↔, {valor.deslocY} mm ↕)</span>}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-torg-gray">
          Posição da impressão na etiqueta
        </span>
        <button onClick={() => setAberto(false)} className="text-[12.5px] text-torg-gray">fechar</button>
      </div>
      <p className="text-[12.5px] text-torg-gray mb-3">
        Use só se a impressão sair <b>cortada na borda</b>. O desenho já é centrado na etiqueta —
        isto move a impressão inteira para compensar a máquina, e vale para <b>todas</b> as
        etiquetas, de todas as obras.
      </p>

      <div className="flex flex-wrap gap-4">
        {[
          ["deslocX", "Horizontal", "→ direita", "← esquerda"],
          ["deslocY", "Vertical", "↓ baixo", "↑ cima"],
        ].map(([campo, rotulo, mais, menos]) => (
          <label key={campo} className="block">
            <span className="block text-[12.5px] font-semibold text-torg-dark mb-1">{rotulo}</span>
            <span className="flex items-center gap-1">
              <button type="button" title={menos} onClick={() => setValor((v) => ({ ...v, [campo]: passo(v[campo], -0.5) }))}
                className="border border-gray-200 rounded-lg w-8 h-9 text-torg-gray">−</button>
              <input value={valor[campo]} inputMode="decimal"
                onChange={(e) => setValor((v) => ({ ...v, [campo]: e.target.value }))}
                className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-sm text-center" />
              <button type="button" title={mais} onClick={() => setValor((v) => ({ ...v, [campo]: passo(v[campo], 0.5) }))}
                className="border border-gray-200 rounded-lg w-8 h-9 text-torg-gray">+</button>
              <span className="text-[12.5px] text-torg-gray">mm</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button onClick={salvar} disabled={salvando}
          className="bg-torg-blue text-white text-[13px] font-semibold rounded-lg px-4 py-2 flex items-center gap-2 disabled:opacity-40">
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
        </button>
        {salvo && <span className="text-[12.5px] text-emerald-700">Salvo — gere as etiquetas de novo para conferir.</span>}
        {erro && <span className="text-[12.5px] text-red-700">{erro}</span>}
      </div>

      {/* ⚠ O ENCOLHIMENTO PRECISA SER DITO. Deslocar sozinho jogaria a coluna do QR para fora do
          papel — o desenho também encolhe para caber. Quem calibra precisa saber que está trocando
          um pouco de tamanho por não perder a borda, senão vai achar que a etiqueta "diminuiu". */}
      {mexeu && (
        <p className="text-[12.5px] text-amber-700 mt-2">
          Com {Math.max(Math.abs(Number(valor.deslocX) || 0), 0)} mm de deslocamento o desenho
          encolhe cerca de {Math.round(Math.max(Math.abs(Number(valor.deslocX) || 0),
            Math.abs(Number(valor.deslocY) || 0) * 2))}% para não perder a borda do outro lado.
        </p>
      )}
    </div>
  );
}
