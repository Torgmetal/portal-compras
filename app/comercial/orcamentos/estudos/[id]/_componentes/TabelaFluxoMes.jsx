"use client";
import { numeroBr } from "@/lib/lqc";
import { Inp } from "./campos";
import { fmtKg, fmtR$ } from "../_lib/formatos";

/**
 * O fluxo mês a mês, com a receita digitável na própria linha.
 *
 * Vitor (23/08/2026): "mais as receitas nos meses para que aí sim você calcule o cenário
 * financeiro real". Cronograma de medição negociado vale mais que distribuir por regra.
 */
export function TabelaFluxoMes({
  ajustando,
  alternaMedicao,
  f,
  kgMedidoPorMes,
  kgPorMes,
  linhas,
  receita,
  semMedicao,
  setAjustando,
  setKg,
  setKgMedido,
  setReceita,
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]" style={{ minWidth: 1040 }}>
        <thead className="bg-gray-50 text-[10px] uppercase text-torg-gray">
          <tr><th className="text-left px-4 py-1.5">Mês</th><th className="text-left px-2 py-1.5">Fase</th>
            <th className="text-right px-3 py-1.5">kg produzido</th>
            <th className="text-right px-3 py-1.5">kg medido</th>
            <th className="text-right px-3 py-1.5">Em aberto</th>
            <th className="text-right px-3 py-1.5">Recebimento</th>
            <th className="text-right px-3 py-1.5">Material</th>
            <th className="text-right px-3 py-1.5">Fábrica</th>
            <th className="text-right px-3 py-1.5">Impostos</th>
            <th className="text-right px-4 py-1.5">Saldo acumulado</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {linhas.map((x) => (
            <tr key={x.mes} className={x.fase === "projeto" ? "bg-gray-50" : x.mes === f.mesEntrega ? "bg-torg-blue-50/40" : ""}>
              <td className="px-4 py-1 whitespace-nowrap">{x.mes === 0 ? "assinatura" : `mês ${x.mes}`}</td>
              {/* ⚠ MEDIÇÃO SÓ NOS MESES QUE MEDEM. Vitor (23/08/2026): "no mês 1 da fabricação não
                  teremos medição, e pode ser que o segundo também não". Espalhar a medição por
                  igual desde o primeiro mês antecipa receita que não existe e esconde o buraco de
                  caixa exatamente onde ele é maior. */}
              <td className="px-2 py-1 text-[10px] whitespace-nowrap">
                {x.fase.includes("fabricação") ? (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer" title="mês com medição">
                    <input type="checkbox" checked={!semMedicao.includes(x.mes - f.mesInicioFabricacao + 1)}
                      onChange={() => alternaMedicao(x.mes - f.mesInicioFabricacao + 1)}
                      className="rounded border-gray-300 text-torg-blue focus:ring-torg-blue h-3 w-3" />
                    <span className={semMedicao.includes(x.mes - f.mesInicioFabricacao + 1) ? "text-torg-gray line-through" : "text-torg-dark"}>
                      {x.mes === f.mesEntrega ? "entrega" : `mede · fab ${x.mes - f.mesInicioFabricacao + 1}`}
                    </span>
                  </label>
                ) : <span className="text-torg-gray">{x.fase}</span>}
              </td>
              <td className="px-3 py-1 text-right">
                {x.fase.includes("fabricação") ? (<>
                  <Inp value={kgPorMes[x.mes] ?? ""} placeholder="0"
                    onChange={(e) => setKg(x.mes, e.target.value)} className="w-24 text-right tabular-nums" />
                  {/* ⚠ digitado além do peso da obra não produz — e precisa mostrar quanto valeu */}
                  {numeroBr(kgPorMes[x.mes]) - x.kgProduzido > 1 && (
                    <span className="block text-[9px] text-torg-orange-700 leading-tight">vale {fmtKg(x.kgProduzido)}</span>
                  )}
                </>) : <span className="text-torg-gray">—</span>}
              </td>
              {/* ⚠ kg MEDIDO é escolha, não consequência: o que ficou pronto e não foi medido fica
                  EM ABERTO, e o comercial distribui como o cliente aprova. */}
              <td className="px-3 py-1 text-right">
                {x.fase.includes("fabricação")
                  ? <Inp value={kgMedidoPorMes[x.mes] ?? ""} placeholder={x.kgMedido ? Math.round(x.kgMedido).toLocaleString("pt-BR") : "0"}
                      onChange={(e) => setKgMedido(x.mes, e.target.value)} className="w-24 text-right tabular-nums" />
                  : <span className="text-torg-gray">—</span>}
              </td>
              <td className={`px-3 py-1 text-right tabular-nums whitespace-nowrap ${x.emAberto > 0 ? "text-torg-orange-700 font-semibold" : "text-torg-gray"}`}>
                {x.emAberto > 0 ? fmtKg(x.emAberto) : "—"}
              </td>
              <td className="px-3 py-1 text-right">
                {ajustando === x.mes ? (
                  <Inp autoFocus value={receita[x.mes] ?? ""} placeholder={x.entrada ? Math.round(x.entrada).toLocaleString("pt-BR") : "0"}
                    onChange={(e) => setReceita(x.mes, e.target.value)}
                    onBlur={() => setAjustando(null)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setAjustando(null); }}
                    className="w-32 text-right tabular-nums" />
                ) : (
                  <button type="button" onClick={() => setAjustando(x.mes)} title="clique para ajustar"
                    className={`tabular-nums whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-gray-100 ${x.entrada ? "text-green-700 font-semibold" : "text-torg-gray"}`}>
                    {x.entrada ? fmtR$(x.entrada) : "—"}
                    {numeroBr(receita[x.mes]) > 0 ? <span className="ml-1 text-[9px] uppercase tracking-wider text-torg-orange-700">ajustado</span> : null}
                    {/* ⚠ num mês de projeto + fabricação o número precisa dizer de que é feito:
                        ver só a parcela do projeto parece medição esquecida. */}
                    {x.entrada > 0 && [x.de?.projeto, x.de?.medicao, x.de?.entrada, x.de?.entrega].filter((v) => v > 0).length > 1 && (
                      <span className="block text-[9px] font-normal text-torg-gray leading-tight">
                        {[x.de.entrada > 0 && `entrada ${fmtR$(x.de.entrada)}`,
                          x.de.projeto > 0 && `projeto ${fmtR$(x.de.projeto)}`,
                          x.de.medicao > 0 && `medição ${fmtR$(x.de.medicao)}`,
                          x.de.entrega > 0 && `entrega ${fmtR$(x.de.entrega)}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                )}
              </td>
              {/* ⚠ material tem coluna própria: é a maior saída da obra e a única com prazo de
                  fornecedor. Somada dentro de um total, ninguém confere se a compra caiu no mês
                  certo nem se as parcelas 28/42/56 pousaram onde deviam. */}
              <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-red-600">{x.material ? `− ${fmtR$(x.material)}` : "—"}</td>
              <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-red-600">
                {x.fabrica || x.projeto ? `− ${fmtR$(x.fabrica + x.projeto)}` : "—"}
                {x.projeto ? <span className="block text-[9px] text-torg-gray leading-none">inclui projeto {fmtR$(x.projeto)}</span> : null}
              </td>
              <td className="px-3 py-1 text-right tabular-nums whitespace-nowrap text-red-600">{x.impostos ? `− ${fmtR$(x.impostos)}` : "—"}</td>
              <td className={`px-4 py-1 text-right tabular-nums whitespace-nowrap font-semibold ${x.saldo < 0 ? "text-red-600" : "text-torg-dark"}`}>
                {fmtR$(x.saldo)}
                {x.juros ? <span className="block text-[9px] font-normal text-torg-gray leading-tight">juro do mês − {fmtR$(x.juros)}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
