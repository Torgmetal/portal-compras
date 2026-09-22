"use client";

// ─── OS CONTROLES DO PORTAL DE CAMPO ─────────────────────────────────────────────────────────
//
// ⚠ Eles vivem fora das telas porque são do PORTAL, não de um ensaio: o mesmo campo de texto, o
// mesmo N/A e o mesmo seletor servem pintura, LP e ultrassom. Copiados por tela, o dia em que o
// tamanho do toque mudar ele muda numa e fica velho nas outras.
//
// ⚠⚠ E SÃO DE MÓDULO, nunca definidos dentro do componente-pai: definido lá dentro, o React
// recebe uma identidade nova a cada tecla, desmonta o <input> e o foco se perde no meio do número
// (Vitor, 14/09/2026 — "clicar número por número"). É o que `useComponenteEstavel` resolve para os
// que precisam de fechamento sobre o estado da tela.

// ── controles no tamanho do dedo, iguais aos do resto do portal de campo ──
export function Txt({ rot, v, onMudar, tipo = "text" }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
      <input type={tipo} inputMode={tipo === "number" ? "decimal" : undefined} value={v ?? ""}
        onChange={(e) => onMudar(e.target.value)}
        className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none" />
    </label>
  );
}

/** Campo que aceita número/texto OU N/A — com o botão do lado do rótulo, no tamanho do dedo. */
export function TxtNA({ rot, v, onMudar, tipo = "text" }) {
  const na = v === "N/A";
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-[12px] text-torg-gray mb-1">
        <span>{rot}</span>
        <button type="button" onClick={() => onMudar(na ? "" : "N/A")}
          className={`text-[11px] font-bold rounded-lg px-2 py-0.5 border ${
            na ? "bg-torg-blue text-white border-torg-blue" : "bg-white text-torg-gray border-gray-300"}`}>
          N/A
        </button>
      </span>
      <input type={na ? "text" : tipo} inputMode={!na && tipo === "number" ? "decimal" : undefined}
        value={v ?? ""} disabled={na} onChange={(e) => onMudar(e.target.value)}
        className={`w-full text-base border-2 rounded-xl px-3 py-3 outline-none ${
          na ? "border-gray-200 bg-gray-100 text-torg-gray" : "border-gray-200 focus:border-torg-blue"}`} />
    </label>
  );
}

export function Sel({ rot, v, opcoes, onMudar }) {
  return (
    <label className="block">
      <span className="block text-[12px] text-torg-gray mb-1">{rot}</span>
      <select aria-label={rot} value={v ?? ""} onChange={(e) => onMudar(e.target.value)}
        className="w-full text-base border-2 border-gray-200 rounded-xl px-3 py-3 focus:border-torg-blue outline-none">
        <option value="">—</option>
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </label>
  );
}
