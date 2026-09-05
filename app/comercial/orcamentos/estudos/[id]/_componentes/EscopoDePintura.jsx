"use client";
import { fmtR$ } from "../_lib/formatos";

/**
 * A tinta por área da obra — que é como ela é comprada e aplicada.
 *
 * Vitor (23/08/2026): "trazer as áreas de pintura mencionadas na primeira parte e trazer a
 * quantidade de tinta que vamos usar em cada área". Quem compra tinta compra por cor e por
 * trecho, não um número único da obra.
 */
export function EscopoDePintura({
  res,
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <p className="text-[12px] font-bold text-torg-dark px-4 py-2 bg-gray-50">Tinta por área da obra</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 720 }}>
          <thead className="text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Área</th><th className="text-left px-2 py-1.5">Cor</th>
              <th className="text-right px-2 py-1.5">Área</th><th className="text-left px-2 py-1.5">Esquema</th>
              <th className="text-right px-2 py-1.5">Película</th><th className="text-right px-2 py-1.5">Tinta</th>
              <th className="text-right px-2 py-1.5">Diluente</th><th className="text-right px-4 py-1.5">Custo</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {res.pinturaPorArea.map((a2, i) => (
              <tr key={i}>
                <td className="px-4 py-1.5">{a2.area} <span className="text-torg-gray">· perda {a2.perda}%</span></td>
                <td className="px-2 py-1.5 text-torg-gray">{a2.cor || "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{Number(a2.areaM2).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} m²</td>
                <td className="px-2 py-1.5 text-torg-gray">
                  {a2.camadas.length ? a2.camadas.map((x) => `${x.camada.toLowerCase()}${x.produto ? ` (${x.produto})` : ""}`).join(" + ") : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{a2.peliculaTotal || "—"} µm</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{Number(a2.litros).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">{Number(a2.litrosDiluente).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L</td>
                <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{fmtR$(a2.custo)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-bold">
              <td className="px-4 py-1.5" colSpan={5}>Total</td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                {Number(res.pinturaPorArea.reduce((a2, x) => a2 + x.litros, 0)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                {Number(res.pinturaPorArea.reduce((a2, x) => a2 + x.litrosDiluente, 0)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L
              </td>
              <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap">
                {fmtR$(res.pinturaPorArea.reduce((a2, x) => a2 + x.custo, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-100">
        Primer e intermediário cobrem todas as áreas do mesmo fator de perda; o acabamento vai
        só nas áreas da sua cor. A cor de cada área se define no quantitativo.
      </p>
    </div>
  );
}
