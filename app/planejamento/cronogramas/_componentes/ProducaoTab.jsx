"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Factory, FileDown, Loader2, Package, Truck, Weight } from "lucide-react";
import { fmtKg } from "../_lib/formatos";
import { SETOR_COLOR, SETOR_LABEL, SETOR_ORDER } from "../_lib/rotulos";

export function ProducaoTab({ cronogramaId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [exportando, setExportando] = useState(false);

  // Export "Faltantes por setor": busca as peças da OP (setor real do Syneco) e gera a matriz.
  async function exportarFaltantes() {
    if (!data?.opId) { setErro("OP não vinculada a este cronograma."); return; }
    setExportando(true); setErro("");
    try {
      const r = await fetch(`/api/comercial/op/${data.opId}/producao`);
      const j = await r.json();
      if (!j.success || !j.pecas?.length) throw new Error(j.error || "Sem peças (Lista de Expedição) para exportar.");
      const { exportarFaltantesPorSetor } = await import("@/lib/export-faltantes-setor");
      await exportarFaltantesPorSetor({ pecas: j.pecas, pesoTotal: j.pesoTotal, temSyneco: j.temSyneco, opNumero: data.opNumero });
    } catch (e) { setErro("Erro ao exportar: " + e.message); } finally { setExportando(false); }
  }

  useEffect(() => {
    setLoading(true);
    setErro("");
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/peso`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar dados de produção");
        return r.json();
      })
      .then(setData)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [cronogramaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-torg-blue" />
        <span className="ml-2 text-sm text-torg-gray">Carregando dados de produção...</span>
      </div>
    );
  }

  if (erro) {
    return <div className="py-6 text-center text-sm text-red-600">{erro}</div>;
  }

  if (!data || data.pesoTotal === 0) {
    return (
      <div className="py-8 text-center">
        <Weight size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma peça cadastrada para esta OP.</p>
        <p className="text-xs text-torg-gray mt-1">Importe a lista de peças/conjuntos para acompanhar o peso.</p>
      </div>
    );
  }

  const { pesoTotal, pesoProduzidoMes, pesoExpedido, pesoRomaneio, porStatus, porSetorMes, porEtapa, totalPecas, totalQte, romaneiosRecentes, progressoGeral } = data;

  // Ordena status conforme fluxo de produção
  const statusEntries = SETOR_ORDER
    .filter((s) => porStatus[s])
    .map((s) => [s, porStatus[s]]);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-end">
        <button onClick={exportarFaltantes} disabled={exportando} className="text-xs text-torg-gray border border-gray-300 rounded-lg px-2.5 py-1.5 font-medium inline-flex items-center gap-1 hover:bg-gray-50 disabled:opacity-40" title="Exporta a planilha das peças que faltam em cada setor">
          {exportando ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Faltantes por setor
        </button>
      </div>
      {/* KPIs de peso */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Weight size={13} className="text-torg-blue" />
            <span className="text-[10px] text-torg-gray">Peso Total</span>
          </div>
          <p className="text-sm font-bold text-torg-blue mt-0.5">{fmtKg(pesoTotal)}</p>
          <p className="text-[9px] text-torg-gray">{totalPecas} peças · {totalQte} un</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Factory size={13} className="text-emerald-600" />
            <span className="text-[10px] text-torg-gray">Produzido (Syneco)</span>
          </div>
          <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmtKg(pesoProduzidoMes)}</p>
          <p className="text-[9px] text-torg-gray">
            {pesoTotal > 0 ? `${(pesoProduzidoMes / pesoTotal * 100).toFixed(1)}% do total` : "—"}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Truck size={13} className="text-teal-600" />
            <span className="text-[10px] text-torg-gray">Expedido</span>
          </div>
          <p className="text-sm font-bold text-teal-600 mt-0.5">{fmtKg(pesoExpedido)}</p>
          <p className="text-[9px] text-torg-gray">{progressoGeral}% do total</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Package size={13} className="text-amber-600" />
            <span className="text-[10px] text-torg-gray">Embarcado (Romaneio)</span>
          </div>
          <p className="text-sm font-bold text-amber-600 mt-0.5">{fmtKg(pesoRomaneio)}</p>
          <p className="text-[9px] text-torg-gray">{romaneiosRecentes?.length || 0} romaneios</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-red-500" />
            <span className="text-[10px] text-torg-gray">Pendente</span>
          </div>
          <p className="text-sm font-bold text-red-500 mt-0.5">{fmtKg(pesoTotal - pesoExpedido)}</p>
          <p className="text-[9px] text-torg-gray">
            {pesoTotal > 0 ? `${((pesoTotal - pesoExpedido) / pesoTotal * 100).toFixed(1)}% restante` : "—"}
          </p>
        </div>
      </div>

      {/* Barra de progresso visual */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h4 className="text-xs font-semibold text-torg-dark mb-3 flex items-center gap-1.5">
          <BarChart3 size={13} className="text-torg-blue" />
          Progresso por Etapa do Cronograma
        </h4>
        <div className="space-y-3">
          {/* FABRICACAO */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Factory size={12} className="text-emerald-600" />
                <span className="text-xs font-medium text-torg-dark">Fabricação</span>
                <span className="text-[9px] text-torg-gray">(Syneco)</span>
              </div>
              <span className="text-xs font-bold text-emerald-600">{porEtapa.FABRICACAO.percentual}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${Math.min(porEtapa.FABRICACAO.percentual, 100)}%` }}
              />
            </div>
            <p className="text-[9px] text-torg-gray mt-0.5">
              {fmtKg(porEtapa.FABRICACAO.pesoRealizado)} produzido de {fmtKg(porEtapa.FABRICACAO.pesoReferencia)}
            </p>
          </div>
          {/* EXPEDICAO */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Truck size={12} className="text-teal-600" />
                <span className="text-xs font-medium text-torg-dark">Expedição</span>
                <span className="text-[9px] text-torg-gray">(PecaConjunto + Romaneio)</span>
              </div>
              <span className="text-xs font-bold text-teal-600">{porEtapa.EXPEDICAO.percentual}%</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${Math.min(porEtapa.EXPEDICAO.percentual, 100)}%` }}
              />
            </div>
            <p className="text-[9px] text-torg-gray mt-0.5">
              {fmtKg(porEtapa.EXPEDICAO.pesoRealizado)} expedido de {fmtKg(porEtapa.EXPEDICAO.pesoReferencia)}
              {pesoRomaneio > 0 ? ` · ${fmtKg(porEtapa.EXPEDICAO.pesoEmbarcado)} embarcado` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Distribuição por status (fluxo de produção) */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h4 className="text-xs font-semibold text-torg-dark mb-3">Distribuição por Etapa (PecaConjunto)</h4>
        {statusEntries.length === 0 ? (
          <p className="text-xs text-torg-gray italic">Sem dados.</p>
        ) : (
          <>
            {/* Barra empilhada */}
            <div className="flex h-5 rounded-full overflow-hidden mb-3">
              {statusEntries.map(([status, info]) => {
                const pct = pesoTotal > 0 ? (info.peso / pesoTotal) * 100 : 0;
                if (pct < 0.5) return null;
                const colors = {
                  PENDENTE: "bg-gray-300", CORTE: "bg-amber-400", MONTAGEM: "bg-blue-400",
                  SOLDA: "bg-orange-400", ACABAMENTO: "bg-purple-400", JATO: "bg-cyan-400",
                  PINTURA: "bg-emerald-400", EXPEDIDO: "bg-green-500",
                };
                return (
                  <div
                    key={status}
                    className={`${colors[status] || "bg-gray-300"} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${SETOR_LABEL[status] || status}: ${fmtKg(info.peso)} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            {/* Legenda e detalhes */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {statusEntries.map(([status, info]) => (
                <div key={status} className={`px-2 py-1.5 rounded-lg text-xs ${SETOR_COLOR[status] || "bg-gray-100 text-gray-600"}`}>
                  <span className="font-semibold">{SETOR_LABEL[status] || status}</span>
                  <div className="text-[10px] font-bold mt-0.5">{fmtKg(info.peso)}</div>
                  <div className="text-[9px] opacity-70">{info.qte} un · {info.count} peças</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Produção Syneco por Setor */}
      {Object.keys(porSetorMes).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h4 className="text-xs font-semibold text-torg-dark mb-3">Produção Syneco por Setor (MesOrdem)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50/60 text-torg-gray">
                  <th className="text-left px-2 py-1.5 font-medium">Setor</th>
                  <th className="text-right px-2 py-1.5 font-medium">Planejado</th>
                  <th className="text-right px-2 py-1.5 font-medium">Produzido</th>
                  <th className="text-right px-2 py-1.5 font-medium">Saldo</th>
                  <th className="text-right px-2 py-1.5 font-medium">Ordens</th>
                  <th className="text-left px-2 py-1.5 font-medium">Progresso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(porSetorMes).sort((a, b) => b[1].pesoProduzido - a[1].pesoProduzido).map(([setor, info]) => {
                  const pct = info.pesoPlanejado > 0 ? Math.round((info.pesoProduzido / info.pesoPlanejado) * 100) : 0;
                  return (
                    <tr key={setor} className="hover:bg-gray-50/50">
                      <td className="px-2 py-1.5 font-medium text-torg-dark">{setor}</td>
                      <td className="px-2 py-1.5 text-right text-torg-gray">{fmtKg(info.pesoPlanejado)}</td>
                      <td className="px-2 py-1.5 text-right font-medium text-emerald-600">{fmtKg(info.pesoProduzido)}</td>
                      <td className="px-2 py-1.5 text-right text-amber-600">{fmtKg(info.saldoRestante)}</td>
                      <td className="px-2 py-1.5 text-right text-torg-gray">{info.ordens}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-600 w-8 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Romaneios recentes */}
      {romaneiosRecentes?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h4 className="text-xs font-semibold text-torg-dark mb-2">Últimos Romaneios</h4>
          <div className="space-y-1">
            {romaneiosRecentes.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 text-xs">
                <div className="flex items-center gap-2">
                  <Truck size={11} className="text-teal-500" />
                  <span className="font-mono text-torg-blue font-medium">{r.numero}</span>
                  <span className="text-torg-gray">{new Date(r.data).toLocaleDateString("pt-BR")}</span>
                </div>
                <span className="font-bold text-teal-600">{fmtKg(r.pesoRealKg)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
