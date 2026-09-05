"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Download, Factory, Loader2, Weight, X } from "lucide-react";
import { DEPT_COLORS, DEPT_ICONS, DEPT_LABEL } from "../_lib/rotulos";

export function ImportarPesoModal({ cronogramaId, onClose, onImported }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);
  const [distribuicao, setDistribuicao] = useState({});

  useEffect(() => {
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/importar-peso`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar dados");
        return r.json();
      })
      .then((d) => {
        setData(d);
        // Pre-preenche com sugestão
        const dist = {};
        for (const s of d.sugestao) {
          dist[s.tarefaId] = {
            qtdePlanejada: s.pesoAtual > 0 ? s.pesoAtual : s.pesoSugerido,
            qtdeRealizada: s.pesoRealizado,
            nome: s.nome,
            departamento: s.departamento,
            sugerido: s.pesoSugerido,
          };
        }
        setDistribuicao(dist);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [cronogramaId]);

  const aplicar = async () => {
    const items = Object.entries(distribuicao)
      .filter(([, v]) => v.qtdePlanejada > 0)
      .map(([tarefaId, v]) => ({
        tarefaId,
        qtdePlanejada: v.qtdePlanejada,
        qtdeRealizada: v.qtdeRealizada || 0,
      }));

    if (items.length === 0) return setErro("Nenhuma tarefa com peso para importar");

    setSaving(true);
    setErro("");
    try {
      const res = await fetch(`/api/planejamento/cronogramas/${cronogramaId}/importar-peso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distribuicao: items }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao importar");
      onImported();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  const aplicarSugestao = () => {
    if (!data) return;
    const dist = {};
    for (const s of data.sugestao) {
      dist[s.tarefaId] = {
        qtdePlanejada: s.pesoSugerido,
        qtdeRealizada: s.pesoRealizado,
        nome: s.nome,
        departamento: s.departamento,
        sugerido: s.pesoSugerido,
      };
    }
    setDistribuicao(dist);
  };

  const updatePeso = (tarefaId, campo, valor) => {
    setDistribuicao((prev) => ({
      ...prev,
      [tarefaId]: { ...prev[tarefaId], [campo]: valor },
    }));
  };

  const fmtK = (v) => {
    if (!v) return "0 kg";
    return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Weight size={18} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-torg-dark">Importar Peso da OP</h3>
          </div>
          <button onClick={onClose} className="p-1 text-torg-gray hover:text-torg-dark rounded">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-torg-blue" />
            <span className="ml-2 text-sm text-torg-gray">Carregando peças da OP...</span>
          </div>
        ) : erro && !data ? (
          <div className="py-8 text-center text-sm text-red-600">{erro}</div>
        ) : data && data.pesoTotal === 0 ? (
          <div className="py-8 text-center">
            <Weight size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-torg-gray">Nenhuma peça encontrada para a OP {data.opNumero}.</p>
            <p className="text-xs text-torg-gray mt-1">Importe a lista de peças/conjuntos na aba de Produção primeiro.</p>
          </div>
        ) : data ? (
          <>
            <div className="px-5 py-3 bg-gray-50/60 border-b border-gray-100 shrink-0">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-[9px] text-torg-gray uppercase font-medium">Peso Total OP</p>
                  <p className="text-sm font-bold text-torg-dark">{fmtK(data.pesoTotal)}</p>
                  <p className="text-[9px] text-torg-gray">{data.totalPecas} peças</p>
                </div>
                <div>
                  <p className="text-[9px] text-torg-gray uppercase font-medium">Produzido (Syneco)</p>
                  <p className="text-sm font-bold text-emerald-600">{fmtK(data.pesoProduzidoTotal)}</p>
                  <p className="text-[9px] text-torg-gray">
                    {data.pesoTotal > 0 ? `${(data.pesoProduzidoTotal / data.pesoTotal * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] text-torg-gray uppercase font-medium">Expedido</p>
                  <p className="text-sm font-bold text-teal-600">{fmtK(data.pesoExpedido)}</p>
                  <p className="text-[9px] text-torg-gray">
                    {data.pesoTotal > 0 ? `${(data.pesoExpedido / data.pesoTotal * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={aplicarSugestao}
                    className="px-3 py-1.5 text-[10px] font-medium text-torg-blue bg-torg-blue-50 border border-torg-blue/20 rounded-lg hover:bg-torg-blue-100"
                  >
                    Preencher sugestão automática
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              <p className="text-[10px] text-torg-gray mb-3">
                Defina o peso planejado (kg) para cada tarefa. Tarefas de Fabricação e Expedição recebem sugestão automática baseada no peso total da OP.
                O percentual será calculado automaticamente: realizado / planejado.
              </p>

              <div className="space-y-1">
                {data.sugestao.map((s) => {
                  const d = distribuicao[s.tarefaId] || {};
                  const Icon = DEPT_ICONS[s.departamento] || Factory;
                  const colors = DEPT_COLORS[s.departamento] || "text-gray-600 bg-gray-50";
                  const pct = d.qtdePlanejada > 0 ? Math.min(100, Math.round((d.qtdeRealizada || 0) / d.qtdePlanejada * 100)) : 0;

                  return (
                    <div key={s.tarefaId} className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 border border-gray-100">
                      <Icon size={12} className={colors.split(" ")[0]} />
                      <span className="text-xs text-torg-dark font-medium flex-1 min-w-0 truncate">{s.nome}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${colors}`}>
                        {DEPT_LABEL[s.departamento]}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-torg-gray">Plan:</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={d.qtdePlanejada || ""}
                          onChange={(e) => updatePeso(s.tarefaId, "qtdePlanejada", parseFloat(e.target.value) || 0)}
                          className="w-20 text-[10px] px-1.5 py-1 border border-gray-200 rounded text-right"
                          placeholder="0"
                        />
                        <span className="text-[9px] text-torg-gray">kg</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-torg-gray">Real:</span>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          value={d.qtdeRealizada || ""}
                          onChange={(e) => updatePeso(s.tarefaId, "qtdeRealizada", parseFloat(e.target.value) || 0)}
                          className="w-20 text-[10px] px-1.5 py-1 border border-gray-200 rounded text-right"
                          placeholder="0"
                        />
                        <span className="text-[9px] text-torg-gray">kg</span>
                      </div>
                      <span className={`text-[10px] font-bold w-10 text-right ${pct >= 100 ? "text-emerald-600" : pct > 0 ? "text-torg-blue" : "text-torg-gray"}`}>
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {data.sugestao.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-xs text-torg-gray">Nenhuma tarefa disponível para atribuir peso.</p>
                  <p className="text-[10px] text-torg-gray mt-1">Adicione tarefas ao cronograma primeiro (Fabricação, Expedição, etc.).</p>
                </div>
              )}
            </div>

            {erro && (
              <div className="mx-5 mb-2 bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5">
                <AlertCircle size={12} /> {erro}
              </div>
            )}

            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl shrink-0">
              <p className="text-[10px] text-torg-gray">
                {Object.values(distribuicao).filter((v) => v.qtdePlanejada > 0).length} tarefas com peso atribuído
              </p>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="px-4 py-2 text-xs text-torg-gray hover:text-torg-dark font-medium">
                  Cancelar
                </button>
                <button
                  onClick={aplicar}
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                  {saving ? "Importando..." : "Aplicar Pesos"}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
