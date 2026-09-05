"use client";
import { CAPACIDADE_CARGA, numeroBr } from "@/lib/lqc";
import { Inp } from "./campos";
import { fmtKg } from "../_lib/formatos";

/**
 * CARGAS POR CLASSE — quantas carretas cada tipo de estrutura precisa.
 *
 * Vitor (23/08/2026): "para as estruturas extra leve calcular a média de 6,5 toneladas por carga,
 * para a leve 8, média 12, pesada 14, extra pesada 20… para podermos ver quantas cargas será
 * necessário para cada tipo de estrutura".
 *
 * ⚠ O QUE LIMITA A CARGA NÃO É O PESO, É O VOLUME. A carreta é a mesma nos cinco casos; o que muda
 * é que estrutura leve OCUPA a prancha antes de atingir o limite de peso. Dividir o peso total por
 * uma capacidade única erra feio: na TMSA dá 85 cargas por 27 t, contra 226 pela classe — 141
 * carretas de diferença, ou R$ 2,5 milhões a R$ 18 mil a viagem.
 */
export function CargasPorClasse({ c, res, setComp }) {
  const cargas = res.cargas || { linhas: [], totalCargas: 0, pesoTotal: 0 };
  const cap = c.frete?.capacidadePorClasse || {};
  const setCap = (k, v) => setComp({ frete: { ...(c.frete || {}), capacidadePorClasse: { ...cap, [k]: v } } });
  const unica = cargas.pesoTotal > 0 ? Math.ceil(cargas.pesoTotal / 27000) : 0;

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">Cargas necessárias, por tipo de estrutura</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          A carreta é a mesma; o que muda é que estrutura leve ocupa a prancha antes de atingir o
          limite de peso. Média da casa, editável por obra.
        </p>
      </div>
      {cargas.pesoSemClasse > 0 && (
        <p className="text-[11px] text-torg-dark bg-[#FFF7ED] border-b border-[#F4801F]/30 px-4 py-2">
          <strong>{Math.round(cargas.pesoSemClasse).toLocaleString("pt-BR")} kg</strong> estão sem classe reconhecida
          {cargas.rotulosSemClasse?.length ? <> (aparecem como <strong>{cargas.rotulosSemClasse.join(", ")}</strong>)</> : null}.
          Entram na conta pela capacidade do Médio para o frete não sair por baixo, mas a fabricação, a pintura e a
          cadência dessas linhas só ficam certas com a classe escolhida no quantitativo.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 620 }}>
          <thead className="text-[10px] uppercase text-torg-gray">
            <tr><th className="text-left px-4 py-1.5">Classe</th><th className="text-right px-2 py-1.5">Peso no escopo</th>
              <th className="text-right px-2 py-1.5">t por carga</th><th className="text-right px-2 py-1.5">Cargas</th>
              <th className="text-right px-4 py-1.5">Última carga</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cargas.linhas.map((l) => (
              <tr key={l.key} className={l.semClasse ? "bg-[#FFF7ED]" : ""}>
                <td className="px-4 py-1.5">{l.nome} <span className="text-torg-gray">· {l.faixa}</span></td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(l.pesoKg)}</td>
                <td className="px-2 py-1.5 text-right">
                  <Inp value={cap[l.key] ?? ""} placeholder={String(CAPACIDADE_CARGA[l.key] / 1000).replace(".", ",")}
                    onChange={(e) => setCap(l.key, (numeroBr(e.target.value) || 0) * 1000)}
                    className="w-20 text-right" />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold">{l.cargas}</td>
                <td className="px-4 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">
                  {fmtKg(l.ultimaCargaKg)}
                  {l.ultimaCargaKg < l.capacidadeKg * 0.5 && l.cargas > 1 && <span className="text-torg-orange-700"> · meia carga</span>}
                </td>
              </tr>
            ))}
            {!cargas.linhas.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-torg-gray">Lance a classificação no quantitativo.</td></tr>}
            <tr className="bg-gray-50 font-bold">
              <td className="px-4 py-1.5">Total</td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtKg(cargas.pesoTotal)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-torg-gray">
                {cargas.totalCargas > 0 ? `${(cargas.pesoTotal / cargas.totalCargas / 1000).toFixed(1)} méd.` : "—"}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{cargas.totalCargas}</td>
              <td className="px-4 py-1.5" />
            </tr>
          </tbody>
        </table>
      </div>
      {cargas.totalCargas > 0 && (
        <p className="text-[11px] text-torg-gray px-4 py-2.5 border-t border-gray-100">
          {/* ⚠ o contraste com a capacidade única existe para mostrar o tamanho do erro que se
              evita — não é curiosidade, é a diferença entre orçar e perder dinheiro no frete. */}
          <strong className="text-torg-dark">{cargas.totalCargas} cargas</strong> para{" "}
          {fmtKg(cargas.pesoTotal)} — média de {fmtKg(cargas.pesoTotal / cargas.totalCargas)} por carreta.
          Por uma capacidade única de 27 t dariam {unica}, e o frete sairia{" "}
          {Math.round((1 - unica / cargas.totalCargas) * 100)}% mais barato do que a obra realmente exige.
        </p>
      )}
    </div>
  );
}
