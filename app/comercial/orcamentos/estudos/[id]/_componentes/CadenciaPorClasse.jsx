"use client";
import { cadenciaPorClasse } from "@/lib/lqc";
import { fmtR$ } from "../_lib/formatos";

/** A cadência traduzida por tipo de estrutura, e o que o MIX desta obra faz com ela. */
export function CadenciaPorClasse({ cadencia, res }) {
  const d = cadenciaPorClasse(cadencia, res.pesoPorClasse || {});
  const temMix = d.pesoTotal > 0;
  return (
    <div className="px-4 py-3 border-t border-gray-100 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="text-[12px] font-bold text-torg-dark">Por tipo de estrutura</p>
        <p className="text-[11px] text-torg-gray">
          {cadencia.toLocaleString("pt-BR")} kg/mês é a régua do <b>{d.referencia}</b>; as demais saem da razão entre os custos de fabricação da tabela.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 560 }}>
          <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-3 py-1.5">Classe</th><th className="text-left px-2 py-1.5">Faixa</th>
              <th className="text-right px-2 py-1.5">Fabricação</th><th className="text-right px-2 py-1.5">Cadência</th>
              <th className="text-right px-2 py-1.5">Nesta obra</th><th className="text-right px-3 py-1.5">Meses</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {d.classes.map((c2) => (
              <tr key={c2.key} className={c2.pesoKg > 0 ? "" : "text-torg-gray/60"}>
                <td className="px-3 py-1.5 font-semibold text-torg-dark">{c2.nome}</td>
                <td className="px-2 py-1.5 text-torg-gray">{c2.faixa}</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{fmtR$(c2.fabricacaoRsKg)}/kg</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{Math.round(c2.kgMes).toLocaleString("pt-BR")} kg/mês</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{c2.pesoKg > 0 ? `${Math.round(c2.pesoKg).toLocaleString("pt-BR")} kg` : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{c2.meses > 0 ? c2.meses.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
              </tr>
            ))}
            {temMix && (
              <tr className="bg-torg-blue-50/50 font-bold text-torg-dark">
                <td className="px-3 py-2" colSpan={3}>Esta obra — {d.mistura}</td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{Math.round(d.obraKgMes).toLocaleString("pt-BR")} kg/mês</td>
                <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{Math.round(d.pesoTotal).toLocaleString("pt-BR")} kg</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{d.mesesTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!temMix && (
        <p className="text-[11px] text-torg-gray mt-2">
          O quantitativo desta obra está sem classificação — sem ela a cadência da obra é a da régua, e o prazo pode
          estar otimista se a estrutura for leve.
        </p>
      )}
      {temMix && Math.abs(d.obraKgMes - cadencia) / (cadencia || 1) > 0.08 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border border-[#F4801F]/30 rounded-lg px-3 py-2 mt-2">
          Pelo mix, esta obra roda a <strong>{Math.round(d.obraKgMes).toLocaleString("pt-BR")} kg/mês</strong> —
          {d.obraKgMes < cadencia ? " menos" : " mais"} que a régua de {cadencia.toLocaleString("pt-BR")}.
          É esse número que o prazo deveria usar.
        </p>
      )}
    </div>
  );
}
