"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle, TrendingUp, Factory, Layers, Info } from "lucide-react";

const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtKg = (v) => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;

/**
 * Margem de transformação da OP — custo operacional da fábrica rateado por
 * kg-op produzido, contra a receita de fabricação. Material é FD/verba e fica
 * fora. Ver lib/rateio-transformacao.js e /api/comercial/op/[id]/margem.
 */
export default function MargemTransformacaoOP({ opId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [abrirDetalhe, setAbrirDetalhe] = useState(false);

  useEffect(() => {
    setLoading(true); setErro("");
    fetch(`/api/comercial/op/${opId}/margem`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro"); return j; })
      .then(setData).catch((e) => setErro(e.message)).finally(() => setLoading(false));
  }, [opId]);

  if (loading) return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
      <Loader2 size={20} className="mx-auto animate-spin text-torg-blue mb-2" />
      <p className="text-sm text-torg-gray">Calculando margem de transformação...</p>
    </div>
  );
  if (erro) return (
    <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
      <div className="flex items-start gap-2 text-red-600 text-sm"><AlertCircle size={16} className="mt-0.5" />
        <div><p className="font-medium">Erro ao calcular margem</p><p className="text-xs mt-1">{erro}</p></div></div>
    </div>
  );
  if (!data) return null;

  const { receita, faturado, saldoAFaturar, custoTransformacao, kgProduzido, material, resultadoAcumulado, flags, porMes } = data;

  if (flags.semReceita) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-sm font-semibold text-torg-dark inline-flex items-center gap-2 mb-2"><TrendingUp size={16} className="text-torg-blue" /> Margem de transformação</h3>
        <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 text-sm">
          <Info size={15} className="mt-0.5 shrink-0" />
          <p>Receita (linhas de faturamento) não preenchida nesta OP — sem ela não dá pra medir a margem. Preencha o faturamento de fabricação/projeto pra habilitar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2"><TrendingUp size={18} className="text-torg-blue" /> Margem de transformação</h3>
        <p className="text-xs text-torg-gray mt-1">Custo operacional da fábrica (folha + terceiros + overhead) rateado por kg produzido, contra a receita de fabricação. Material é FD/verba e fica de fora.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border-b border-gray-100">
        <Kpi label="Receita Torg" valor={receita.total} color="text-torg-blue" />
        <Kpi label="Custo transf. (até agora)" valor={custoTransformacao} sub={fmtKg(kgProduzido)} color="text-torg-orange-700" />
        <Kpi label="Faturado" valor={faturado} sub={flags.semFaturado ? "ainda não faturou" : `saldo a faturar ${fmtMoeda(saldoAFaturar)}`} color="text-torg-dark" />
        {flags.semFaturado ? (
          <div className="bg-white p-4">
            <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">Resultado acumulado</p>
            <p className="text-lg font-extrabold text-gray-300">—</p>
            <p className="text-[10px] text-torg-gray mt-1">sem faturamento ainda</p>
          </div>
        ) : (
          <Kpi label="Resultado acumulado" valor={resultadoAcumulado} color={resultadoAcumulado >= 0 ? "text-emerald-700" : "text-red-600"} sub="faturado − custo" />
        )}
      </div>

      {/* avisos */}
      {(flags.custoIncompleto2025 || flags.semFaturado) && (
        <div className="px-6 pt-4 space-y-2">
          {flags.custoIncompleto2025 && (
            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-2.5 text-xs">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <p><span className="font-semibold">Custo incompleto:</span> {(flags.shareForaJanela * 100).toFixed(0)}% da produção desta OP é de 2025, quando o Syneco ainda não capturava a fábrica — esse custo não entra. A margem sai otimista.</p>
            </div>
          )}
          {flags.semFaturado && (
            <div className="flex items-start gap-2 text-torg-gray bg-gray-50 rounded-lg p-2.5 text-xs">
              <Info size={14} className="mt-0.5 shrink-0" />
              <p>Obra em andamento sem medições faturadas — dá pra ver contrato × custo incorrido, mas o resultado só fecha quando começar a faturar.</p>
            </div>
          )}
        </div>
      )}

      {/* Composição */}
      <div className="p-6 grid md:grid-cols-2 gap-x-8 gap-y-6">
        <div>
          <h4 className="text-xs font-semibold text-torg-gray uppercase tracking-wider mb-2">Receita (contrato)</h4>
          <Linha label="Fabricação" valor={receita.fabricacao} />
          <Linha label="Projeto" valor={receita.projeto} />
          {receita.entrada > 0 && <Linha label="Entrada / repasse" valor={receita.entrada} />}
          <Linha label="Total" valor={receita.total} bold />
          <p className="text-[11px] text-torg-gray mt-2">Base de margem (fabricação + projeto): <span className="font-medium text-torg-dark">{fmtMoeda(receita.baseFabricacao)}</span></p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-torg-gray uppercase tracking-wider mb-2">Custo</h4>
          <Linha label={<span className="inline-flex items-center gap-1.5"><Factory size={13} className="text-torg-orange-700" /> Transformação (rateio)</span>} valor={custoTransformacao} />
          <Linha label={<span className="inline-flex items-center gap-1.5 text-torg-gray"><Layers size={13} /> Material FD (fora)</span>} valor={material.verbaFD} muted />
          {material.verbaCompra > 0 && <Linha label="Material (verba compra)" valor={material.verbaCompra} muted />}
          {porMes.length > 0 && (
            <>
              <button onClick={() => setAbrirDetalhe(!abrirDetalhe)} className="text-[11px] text-torg-blue hover:underline mt-2">{abrirDetalhe ? "ocultar" : "ver"} rateio por mês</button>
              {abrirDetalhe && (
                <div className="mt-2 border-t border-gray-100 pt-2 space-y-1">
                  {porMes.map((m) => (
                    <div key={m.mes} className="flex items-center justify-between gap-2 text-[11px] text-torg-gray tabular-nums">
                      <span className="w-14">{m.mes}</span>
                      <span className="flex-1 text-right">{fmtKg(m.kgOp)} × {fmtMoeda(m.rkg)}</span>
                      <span className="w-24 text-right text-torg-dark font-medium">{fmtMoeda(m.custo)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, valor, sub, color }) {
  return (
    <div className="bg-white p-4">
      <p className="text-[10px] font-medium text-torg-gray uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${color}`}>{fmtMoeda(valor)}</p>
      {sub && <p className="text-[10px] text-torg-gray mt-1 tabular-nums">{sub}</p>}
    </div>
  );
}

function Linha({ label, valor, bold, muted }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-1.5 ${bold ? "border-t border-gray-100 mt-1 pt-2" : ""}`}>
      <span className={`text-sm ${bold ? "font-bold text-torg-dark" : muted ? "text-torg-gray" : "text-torg-dark"}`}>{label}</span>
      <span className={`text-sm tabular-nums whitespace-nowrap ${bold ? "font-bold text-torg-dark" : muted ? "text-torg-gray" : "text-torg-dark"}`}>{fmtMoeda(valor)}</span>
    </div>
  );
}
