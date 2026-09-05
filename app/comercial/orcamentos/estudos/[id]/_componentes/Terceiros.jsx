"use client";
import { Plus, Trash2 } from "lucide-react";
import { BASES_TERCEIRO, FATURAMENTO, FATURAMENTO_ROTULO, TERCEIROS_SUGESTOES } from "@/lib/lqc";
import { Campo, Inp, Sel } from "./campos";
import { fmtKg, fmtR$ } from "../_lib/formatos";

/**
 * TERCEIROS — o que vem de fora.
 *
 * Vitor (23/08/2026): "se criar uma nova aba e colocar terceiros, para podermos fabricar alguns
 * itens, e aí ter a opção de faturamento direto ou Torg, aí tudo bem". A lista é livre porque cada
 * obra terceiriza uma coisa diferente; os atalhos cobrem o que se repete.
 */
export function Terceiros({ c, res, setComp }) {
  const lista = Array.isArray(c.terceiros) ? c.terceiros : [];
  const set = (i, campo, v) => setComp({ terceiros: lista.map((t, j) => (j === i ? { ...t, [campo]: v } : t)) });
  const add = (base = {}) => setComp({ terceiros: [...lista, { descricao: "", base: "kg", faturamento: "TORG", ...base }] });
  const del = (i) => setComp({ terceiros: lista.filter((_, j) => j !== i) });
  const usados = new Set(lista.map((t) => t.chave).filter(Boolean));

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-torg-gray">
        Serviço contratado fora. É onde <strong className="text-torg-dark">Torg fatura</strong> ou{" "}
        <strong className="text-torg-dark">cliente compra direto</strong> muda o preço: o que o cliente contrata
        direto não carrega nosso imposto nem recebe BDI.
      </p>

      <div className="flex flex-wrap gap-2">
        {TERCEIROS_SUGESTOES.filter((t) => !usados.has(t.chave)).map((t) => (
          <button key={t.chave} onClick={() => add(t)}
            className="text-[11px] font-semibold text-torg-blue border border-torg-blue/30 rounded-lg px-2.5 py-1 hover:bg-torg-blue-50 inline-flex items-center gap-1">
            <Plus size={12} /> {t.descricao}
          </button>
        ))}
        <button onClick={() => add()} className="text-[11px] font-semibold text-torg-gray border border-dashed border-gray-300 rounded-lg px-2.5 py-1 hover:border-torg-blue/40 inline-flex items-center gap-1">
          <Plus size={12} /> Outro serviço
        </button>
      </div>

      {lista.length === 0 && <p className="text-[13px] text-torg-gray">Nada terceirizado nesta obra.</p>}

      {lista.map((t, i) => {
        const l = res.grupos?.terceirizados?.linhas?.[i] || {};
        return (
          <div key={i} className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="col-span-2">
                <Campo r="Serviço">
                  <Inp value={t.descricao ?? ""} onChange={(e) => set(i, "descricao", e.target.value)} className="w-full" /></Campo>
              </div>
              <Campo r="Área" ajuda="vazio = obra inteira">
                <Sel value={t.area || ""} onChange={(e) => set(i, "area", e.target.value)}
                  opcoes={[...new Set((c.resumos || []).map((x) => x.area).filter(Boolean))]} className="w-full" /></Campo>
              <Campo r="Cobrança" ajuda={BASES_TERCEIRO[t.base || "kg"]}>
                <Sel value={t.base || "kg"} onChange={(e) => set(i, "base", e.target.value)} opcoes={["kg", "m2", "verba"]}
                  rotulos={{ kg: "Por kg", m2: "Por m²", verba: "Valor fechado" }} className="w-full" /></Campo>
              <Campo r={t.base === "verba" ? "Valor (R$)" : "Preço unitário (R$)"}>
                <Inp value={t.precoUnit ?? ""} onChange={(e) => set(i, "precoUnit", e.target.value)} className="w-full text-right" /></Campo>
              <Campo r="Faturamento">
                <Sel value={t.faturamento || ""} onChange={(e) => set(i, "faturamento", e.target.value)}
                  opcoes={FATURAMENTO} rotulos={FATURAMENTO_ROTULO} className="w-full" /></Campo>
              {t.base === "verba" && !t.area && (
                <Campo r="Escopo" ajuda={t.escopoFixo ? "não encolhe" : "encolhe com o escopo"}>
                  <label className="flex items-center gap-2 text-[11px] text-torg-dark mt-1">
                    <input type="checkbox" checked={!!t.escopoFixo} onChange={(e) => set(i, "escopoFixo", e.target.checked)}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue" />
                    travar valor
                  </label>
                </Campo>
              )}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] text-torg-gray">
                {l.foraDoEscopo
                  ? <span className="text-torg-orange-700 font-semibold">área fora do escopo — zerado</span>
                  : <>{fmtKg(l.pesoKg)} × {fmtR$(l.precoKg)} = <strong className="text-torg-dark">{fmtR$(l.subtotal)}</strong></>}
                {l.naoAcompanha && <span className="block text-torg-orange-700">travado — não encolheu com o corte de escopo, confira</span>}
                {!l.escopoFixo && l.fracaoEscopo < 0.999 && l.base === "verba" && !l.area && (
                  <span className="block">valor do levantamento inteiro, ajustado para {(l.fracaoEscopo * 100).toFixed(0)}% do peso</span>
                )}
                {l.icms > 0 && <> · ICMS {fmtR$(l.icms)}</>}
                {l.pisCofins > 0 && <> · PIS/COFINS {fmtR$(l.pisCofins)}</>}
              </p>
              <button onClick={() => del(i)} className="text-gray-300 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          </div>
        );
      })}

      {lista.length > 0 && (
        <p className="text-[13px] font-bold text-torg-dark text-right">
          Total de terceiros: <span className="tabular-nums whitespace-nowrap">{fmtR$(res.grupos?.terceirizados?.total?.subtotal)}</span>
        </p>
      )}
    </div>
  );
}
