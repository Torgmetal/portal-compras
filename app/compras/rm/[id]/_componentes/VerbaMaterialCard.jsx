"use client";
import { Package } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";
import { fmtMoeda } from "../_lib/formatos";

export function VerbaMaterialCard({ verba, menorCotacao, categoriasRM = [] }) {
  const { verbaTotal, totalEmPedidos, saldo, porCategoria = [] } = verba;
  const catsRM = new Set(categoriasRM);
  const cabe = menorCotacao != null ? saldo - menorCotacao : null;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
        <Package size={16} className="text-torg-blue" />
        <h3 className="text-lg font-semibold text-torg-dark">Verba de material da OP</h3>
        <span className="text-xs text-torg-gray">quanto ainda há pra comprar × o preço cotado desta RM</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
        <div className="bg-white p-4">
          <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Orçado (verba)</p>
          <p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtMoeda(verbaTotal)}</p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Comprometido</p>
          <p className="text-lg font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(totalEmPedidos)}</p>
          <p className="text-[10px] text-torg-gray mt-1">em pedidos</p>
        </div>
        <div className="bg-white p-4">
          <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Disponível</p>
          <p className={`text-lg font-extrabold tabular-nums ${saldo >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtMoeda(saldo)}</p>
        </div>
      </div>
      {menorCotacao != null && (
        <div className={`px-5 py-3 text-sm flex items-start gap-2 ${cabe >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          <span>{cabe >= 0 ? "✓" : "⚠"}</span>
          <p>
            Menor cotação desta RM: <span className="font-semibold">{fmtMoeda(menorCotacao)}</span>.{" "}
            {cabe >= 0
              ? <>Cabe na verba disponível — sobrariam <span className="font-semibold">{fmtMoeda(cabe)}</span>.</>
              : <>Estoura a verba disponível em <span className="font-semibold">{fmtMoeda(-cabe)}</span>.</>}
          </p>
        </div>
      )}
      {porCategoria.length > 0 && (
        <div className="px-5 py-3">
          <p className="text-[11px] font-medium text-torg-gray uppercase tracking-wider mb-2">Orçado por categoria</p>
          <div className="space-y-0.5">
            {porCategoria.map((c) => (
              <div key={c.categoria} className={`flex items-center justify-between text-sm py-1 ${catsRM.has(c.categoria) ? "" : "opacity-50"}`}>
                <span className="text-torg-dark">{labelCategoria(c.categoria)}{catsRM.has(c.categoria) && <span className="ml-1.5 text-[10px] text-torg-blue font-medium">• desta RM</span>}</span>
                <span className="tabular-nums text-torg-dark">{fmtMoeda(c.orcado)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="px-5 py-2 text-[11px] text-torg-gray border-t border-gray-50">Disponível = verba orçada da OP − pedidos já emitidos (OP inteira, todas as categorias). O comparativo abaixo é o menor preço das propostas recebidas desta RM.</p>
    </div>
  );
}
