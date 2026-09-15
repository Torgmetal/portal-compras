"use client";
import { FileText } from "lucide-react";
import { numeroBR } from "@/lib/numero-br";
import { fmtMoeda } from "../_lib/formatos";
import CampoDecimal from "@/components/CampoDecimal";

// Grade de precos por item da RM dentro do lancamento manual de proposta.
export function TabelaLinhasProposta({
  autoFilled,
  linhas,
  marcarRevisado,
  revisado,
  setLinha,
  setTotalPropostaInput,
  total,
  totalBrutoSemIPI,
  totalIPI,
  totalPropostaInput,
}) {
  return (
    <div>
      <p className="text-xs font-medium text-torg-gray mb-2">Itens ({linhas.length})</p>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Descrição</th>
              <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">Qtd</th>
              <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">Preço *</th>
              <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">ICMS%</th>
              <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">IPI%</th>
              <th className="px-2 py-1.5 text-right font-medium text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {linhas.map((l) => {
              const t = (numeroBR(l.precoUnit)) * (numeroBR(l.qtdCotada));
              const isAuto = autoFilled.has(l.rmItemId);
              const isRevisado = revisado.has(l.rmItemId);
              const inputCls = isAuto
                ? "border-torg-orange-300 bg-torg-orange-50/40"
                : isRevisado
                ? "border-torg-blue-200 bg-torg-blue-50/30"
                : "border-gray-200";
              return (
                <tr key={l.rmItemId} className={isAuto ? "bg-torg-orange-50/20" : ""}>
                  <td className="px-2 py-1.5 text-torg-dark">
                    {l._rmNumero && !l._ehDestaRM && (
                      <span className="font-mono text-[10px] text-torg-blue bg-torg-blue-50 px-1.5 py-0.5 rounded mr-1.5">
                        {l._rmNumero}
                      </span>
                    )}
                    {l.descricao}
                    {isAuto && (
                      <button
                        type="button"
                        onClick={() => marcarRevisado(l.rmItemId)}
                        className="ml-2 text-[10px] text-torg-orange-700 hover:text-torg-orange-800 font-medium inline-flex items-center gap-0.5"
                        title="Marcar como conferido"
                      >
                        ⚠ via IA
                      </button>
                    )}
                    {isRevisado && (
                      <span className="ml-2 text-[10px] text-torg-blue font-medium">✓</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <CampoDecimal value={l.qtdCotada}
                      onChange={(txt) => setLinha(l.rmItemId, "qtdCotada", txt)}
                      className={`w-24 border rounded px-1.5 py-0.5 text-xs text-right tabular-nums ${inputCls}`} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <CampoDecimal value={l.precoUnit}
                      onChange={(txt) => setLinha(l.rmItemId, "precoUnit", txt)}
                      placeholder="0,00"
                      className={`w-24 border rounded px-1.5 py-0.5 text-xs text-right tabular-nums ${inputCls}`} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <CampoDecimal value={l.icmsPct}
                      onChange={(txt) => setLinha(l.rmItemId, "icmsPct", txt)}
                      placeholder="0"
                      className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-right tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <CampoDecimal value={l.ipiPct}
                      onChange={(txt) => setLinha(l.rmItemId, "ipiPct", txt)}
                      placeholder="0"
                      className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-right tabular-nums" />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-torg-dark font-medium">
                    {t > 0 ? fmtMoeda(t) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={5} className="px-2 py-1 text-right text-torg-gray text-[11px]">Mercadoria (bruto):</td>
              <td className="px-2 py-1 text-right text-torg-gray tabular-nums text-xs">{fmtMoeda(totalBrutoSemIPI)}</td>
            </tr>
            {totalIPI > 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-1 text-right text-torg-gray text-[11px]">+ IPI:</td>
                <td className="px-2 py-1 text-right text-torg-gray tabular-nums text-xs">{fmtMoeda(totalIPI)}</td>
              </tr>
            )}
            <tr className="border-t border-gray-200">
              <td colSpan={5} className="px-2 py-2 text-right text-torg-dark font-semibold">Total da nota (calculado):</td>
              <td className="px-2 py-2 text-right font-bold text-torg-orange-700 tabular-nums">{fmtMoeda(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {/* Total da NF do fornecedor — ajuste pra bater com o PDF da proposta */}
      <div className="mt-3 bg-amber-50/60 border border-amber-200 rounded-lg p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-torg-dark inline-flex items-center gap-1.5">
              <FileText size={14} className="text-amber-700" /> Total da nota (PDF do fornecedor)
            </p>
            <p className="text-xs text-torg-gray mt-0.5">
              Preencha o valor total exato do PDF do fornecedor. Se preenchido, os preços vão ser ajustados proporcionalmente na hora de gerar o pedido no Omie pra bater com esse total. Deixe vazio pra usar o calculado.
            </p>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center bg-white border border-amber-300 rounded-lg overflow-hidden">
              <span className="px-2 text-xs text-torg-gray">R$</span>
              {/* ⚠⚠ ESTE É O CAMPO QUE MANDA NO PREÇO FINAL: quando preenchido, `gerar-pedidos`
                  escala os unitários para bater com ele. Com `type="number"` a vírgula era
                  descartada — "31.020,50" virava 3102050 — e o erro entrava no pedido do Omie
                  multiplicado por cem, com cara de valor digitado. */}
              <CampoDecimal
                casas={2}
                value={totalPropostaInput}
                onChange={setTotalPropostaInput}
                placeholder="0,00"
                className="w-32 px-2 py-1.5 text-right text-sm font-bold text-amber-700 tabular-nums focus:outline-none"
              />
            </div>
            {totalPropostaInput && numeroBR(totalPropostaInput) > 0 && (
              <p className="text-[10px] text-torg-gray mt-1 tabular-nums">
                Diff calc: {fmtMoeda(numeroBR(totalPropostaInput) - total)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
