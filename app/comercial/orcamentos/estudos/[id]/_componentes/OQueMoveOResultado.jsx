"use client";
import { fmtR$ } from "../_lib/formatos";

/**
 * A tabela de sensibilidade do cenário.
 *
 * Cada linha é um susto de tamanho realista, aplicado sozinho sobre o cenário base. Serve para
 * saber onde vale gastar a negociação.
 */
export function OQueMoveOResultado({
  sens,
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[12px] font-bold text-torg-dark">O que move o resultado</p>
        <p className="text-[11px] text-torg-gray mt-0.5">
          Cada linha é um susto de tamanho realista, aplicado sozinho sobre o cenário base. Serve para saber
          onde vale gastar a negociação — com o cliente, com o fornecedor ou dentro de casa.
        </p>
      </div>
      <table className="w-full text-[12px]">
        <tbody className="divide-y divide-gray-50">
          {sens.map((s) => {
            const maior = Math.max(...sens.map((x) => Math.abs(x.delta))) || 1;
            return (
              <tr key={s.key}>
                <td className="px-4 py-1.5 whitespace-nowrap">{s.nome} <span className="text-torg-gray">{s.passo}</span></td>
                <td className="px-3 py-1.5 w-1/2">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${s.delta < 0 ? "bg-red-500" : "bg-green-600"}`}
                      style={{ width: `${(Math.abs(s.delta) / maior) * 100}%` }} />
                  </div>
                </td>
                <td className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold ${s.delta < 0 ? "text-red-600" : "text-green-700"}`}>
                  {s.delta < 0 ? "− " : "+ "}{fmtR$(Math.abs(s.delta))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
