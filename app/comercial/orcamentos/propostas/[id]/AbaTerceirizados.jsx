"use client";
import { useState, useMemo } from "react";
import {
  Plus, Trash2, Loader2, Save, Factory, X,
  ChevronDown, ChevronUp, Search,
} from "lucide-react";

const SERVICOS = [
  { id: "DOBRA", label: "Dobra", cor: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  { id: "USINAGEM", label: "Usinagem", cor: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  { id: "PINTURA", label: "Pintura (terceirizada)", cor: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  { id: "GALVANIZACAO", label: "Galvanização", cor: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
  { id: "CORTE_LASER", label: "Corte Laser / Plasma", cor: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  { id: "TRATAMENTO", label: "Tratamento Superficial", cor: "text-violet-600", bg: "bg-violet-50", border: "border-violet-200" },
  { id: "TRANSPORTE", label: "Transporte Especial", cor: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  { id: "OUTROS", label: "Outros Serviços", cor: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
];

const SERVICO_MAP = Object.fromEntries(SERVICOS.map((s) => [s.id, s]));

const UNIDADES = ["VB", "KG", "M2", "M", "UN", "CJ", "PC", "HR"];

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtNum(v, dec = 2) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function AbaTerceirizados({ estudo, estudoId }) {
  const [itens, setItens] = useState(estudo.itensTerceirizado || []);
  const [secaoAberta, setSecaoAberta] = useState(null);
  const [novoItem, setNovoItem] = useState(null);
  const [salvando, setSalvando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);

  // Agrupar por servico
  const itensPorServico = useMemo(() => {
    const mapa = {};
    for (const s of SERVICOS) mapa[s.id] = [];
    for (const it of itens) {
      const key = mapa[it.servico] ? it.servico : "OUTROS";
      mapa[key].push(it);
    }
    return mapa;
  }, [itens]);

  // Serviços que têm itens (para mostrar na lista) + os fixos
  const servicosComItens = useMemo(() => {
    const comItens = new Set(itens.map((it) => it.servico));
    return SERVICOS.filter((s) => comItens.has(s.id));
  }, [itens]);

  const totalPorServico = useMemo(() => {
    const mapa = {};
    for (const [servico, lista] of Object.entries(itensPorServico)) {
      mapa[servico] = lista.reduce((s, it) => s + (it.custoTotal || 0), 0);
    }
    return mapa;
  }, [itensPorServico]);

  const pesoTotalTerceirizado = itens.reduce((s, it) => s + (it.pesoKg || 0), 0);
  const totalGeral = Object.values(totalPorServico).reduce((s, v) => s + v, 0);

  const apiBase = `/api/comercial/estudo/${estudoId}/terceirizados`;

  const criarItem = async (data) => {
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
  };

  const atualizarItem = async (itemId, campos) => {
    setSalvando(itemId);
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, ...campos }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.map((it) => (it.id === itemId ? json.data : it)));
    } catch (e) {
      alert(e.message);
    } finally {
      setSalvando(null);
    }
  };

  const excluirItem = async (itemId) => {
    if (!window.confirm("Excluir este item?")) return;
    setExcluindo(itemId);
    try {
      const res = await fetch(`${apiBase}?itemId=${itemId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.filter((it) => it.id !== itemId));
    } catch (e) {
      alert(e.message);
    } finally {
      setExcluindo(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-torg-dark flex items-center gap-2">
            <Factory size={20} className="text-torg-orange" /> Servicos Terceirizados
          </h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Custos de dobra, usinagem, pintura externa, galvanizacao e demais servicos contratados.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-torg-gray">Total Terceirizados</p>
          <p className="text-xl font-bold text-torg-dark">{fmtMoeda(totalGeral)}</p>
          {pesoTotalTerceirizado > 0 && (
            <p className="text-xs text-torg-gray">{fmtNum(pesoTotalTerceirizado, 0)} kg</p>
          )}
        </div>
      </div>

      {/* Botões para adicionar novo serviço */}
      <div>
        <p className="text-xs text-torg-gray mb-2">Adicionar servico:</p>
        <div className="flex flex-wrap gap-2">
          {SERVICOS.map((s) => {
            const qtd = (itensPorServico[s.id] || []).length;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setSecaoAberta(s.id);
                  setNovoItem({ servico: s.id });
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${s.border} ${s.bg} ${s.cor} hover:shadow-sm`}
              >
                <Plus size={12} /> {s.label}
                {qtd > 0 && <span className="bg-white/80 rounded-full px-1.5 text-[10px]">{qtd}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Seções accordion — só mostra as que têm itens ou estão sendo adicionadas */}
      {SERVICOS.map((servico) => {
        const lista = itensPorServico[servico.id] || [];
        const total = totalPorServico[servico.id] || 0;
        const aberta = secaoAberta === servico.id;
        const temItensOuNovo = lista.length > 0 || novoItem?.servico === servico.id;

        if (!temItensOuNovo && !aberta) return null;

        return (
          <div key={servico.id} className={`border rounded-xl overflow-hidden ${servico.border}`}>
            <button
              onClick={() => setSecaoAberta(aberta ? null : servico.id)}
              className={`w-full flex items-center justify-between px-5 py-3.5 ${servico.bg} text-left transition-colors`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`font-semibold text-sm ${servico.cor}`}>{servico.label}</span>
                <span className="text-xs text-torg-gray">({lista.length} iten{lista.length === 1 ? "" : "s"})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm text-torg-dark">{fmtMoeda(total)}</span>
                {aberta ? <ChevronUp size={16} className="text-torg-gray" /> : <ChevronDown size={16} className="text-torg-gray" />}
              </div>
            </button>

            {aberta && (
              <div className="p-4 space-y-3 bg-white">
                {lista.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-torg-gray border-b border-gray-200">
                          <th className="pb-2 pr-3">Descricao</th>
                          <th className="pb-2 pr-3 w-16 text-right">Qtd</th>
                          <th className="pb-2 pr-3 w-14 text-center">Und</th>
                          <th className="pb-2 pr-3 w-24 text-right">Peso (kg)</th>
                          <th className="pb-2 pr-3 w-28 text-right">Custo Unit.</th>
                          <th className="pb-2 pr-3 w-28 text-right">Total</th>
                          <th className="pb-2 pr-3 w-28">Fornecedor</th>
                          <th className="pb-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {lista.map((item) => (
                          <LinhaItem
                            key={item.id}
                            item={item}
                            onUpdate={atualizarItem}
                            onDelete={excluirItem}
                            salvando={salvando === item.id}
                            excluindo={excluindo === item.id}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {lista.length === 0 && !novoItem && (
                  <p className="text-sm text-torg-gray text-center py-4">Nenhum item adicionado.</p>
                )}

                {novoItem?.servico === servico.id ? (
                  <NovoItemForm
                    servico={servico}
                    onSalvar={async (data) => {
                      await criarItem({ ...data, servico: servico.id });
                      setNovoItem(null);
                    }}
                    onCancelar={() => setNovoItem(null)}
                  />
                ) : (
                  <button
                    onClick={() => setNovoItem({ servico: servico.id })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-torg-blue hover:bg-torg-blue/5 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Adicionar item
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Resumo geral */}
      {totalGeral > 0 && (
        <div className="bg-gradient-to-r from-torg-orange to-amber-500 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-sm">Resumo — Servicos Terceirizados</h4>
            <span className="text-2xl font-bold">{fmtMoeda(totalGeral)}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {SERVICOS.filter((s) => (totalPorServico[s.id] || 0) > 0).map((s) => (
              <div key={s.id} className="bg-white/15 rounded-lg px-3 py-2">
                <p className="text-[10px] text-white/70 uppercase tracking-wide">{s.label}</p>
                <p className="text-sm font-semibold">{fmtMoeda(totalPorServico[s.id])}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Linha editável ──
function LinhaItem({ item, onUpdate, onDelete, salvando, excluindo }) {
  const [editando, setEditando] = useState(false);
  const [desc, setDesc] = useState(item.descricao);
  const [qtd, setQtd] = useState(item.quantidade);
  const [unidade, setUnidade] = useState(item.unidade);
  const [pesoKg, setPesoKg] = useState(item.pesoKg);
  const [custoUnit, setCustoUnit] = useState(item.custoUnitario);
  const [fornecedor, setFornecedor] = useState(item.fornecedor || "");
  const [obs, setObs] = useState(item.observacao || "");

  const total = qtd * custoUnit;

  const salvar = () => {
    onUpdate(item.id, {
      descricao: desc,
      quantidade: qtd,
      unidade,
      pesoKg,
      custoUnitario: custoUnit,
      custoTotal: total,
      fornecedor: fornecedor.trim() || null,
      observacao: obs.trim() || null,
    });
    setEditando(false);
  };

  if (editando) {
    return (
      <tr className="bg-blue-50/30">
        <td className="py-2 pr-2">
          <input value={desc} onChange={(e) => setDesc(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
        </td>
        <td className="py-2 pr-2">
          <input type="number" min="0" step="0.01" value={qtd} onChange={(e) => setQtd(parseFloat(e.target.value) || 0)}
            className="w-16 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
        </td>
        <td className="py-2 pr-2">
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}
            className="w-14 border border-gray-200 rounded px-1 py-1 text-xs">
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td className="py-2 pr-2">
          <input type="number" min="0" step="1" value={pesoKg} onChange={(e) => setPesoKg(parseFloat(e.target.value) || 0)}
            className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
        </td>
        <td className="py-2 pr-2">
          <input type="number" min="0" step="0.01" value={custoUnit} onChange={(e) => setCustoUnit(parseFloat(e.target.value) || 0)}
            className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
        </td>
        <td className="py-2 pr-2 text-right font-medium text-torg-dark text-sm">{fmtMoeda(total)}</td>
        <td className="py-2 pr-2">
          <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="—"
            className="w-28 border border-gray-200 rounded px-2 py-1 text-xs" />
        </td>
        <td className="py-2 text-right">
          <div className="flex gap-1 justify-end">
            <button onClick={salvar} disabled={salvando}
              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
            <button onClick={() => setEditando(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
              <X size={14} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group hover:bg-gray-50/50 cursor-pointer" onDoubleClick={() => setEditando(true)}>
      <td className="py-2.5 pr-3 text-torg-dark">{item.descricao}</td>
      <td className="py-2.5 pr-3 text-right text-torg-gray">{fmtNum(item.quantidade, item.quantidade % 1 === 0 ? 0 : 2)}</td>
      <td className="py-2.5 pr-3 text-center text-xs text-torg-gray">{item.unidade}</td>
      <td className="py-2.5 pr-3 text-right text-torg-gray">{item.pesoKg > 0 ? fmtNum(item.pesoKg, 0) : "—"}</td>
      <td className="py-2.5 pr-3 text-right text-torg-gray">{fmtMoeda(item.custoUnitario)}</td>
      <td className="py-2.5 pr-3 text-right font-medium text-torg-dark">{fmtMoeda(item.custoTotal)}</td>
      <td className="py-2.5 pr-3 text-xs text-torg-gray truncate max-w-[120px]" title={item.fornecedor}>{item.fornecedor || "—"}</td>
      <td className="py-2.5 text-right">
        <button onClick={() => onDelete(item.id)} disabled={excluindo}
          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50">
          {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </td>
    </tr>
  );
}

// ── Form novo item ──
function NovoItemForm({ servico, onSalvar, onCancelar }) {
  const [desc, setDesc] = useState("");
  const [qtd, setQtd] = useState(1);
  const [unidade, setUnidade] = useState("VB");
  const [pesoKg, setPesoKg] = useState(0);
  const [custoUnit, setCustoUnit] = useState(0);
  const [fornecedor, setFornecedor] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const total = qtd * custoUnit;

  const handleSalvar = async () => {
    if (!desc.trim()) return setErro("Descricao obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        descricao: desc.trim(),
        unidade,
        quantidade: qtd,
        pesoKg,
        custoUnitario: custoUnit,
        custoTotal: total,
        fornecedor: fornecedor.trim() || undefined,
        observacao: obs.trim() || undefined,
      });
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50/50 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-torg-gray block mb-1">Descricao</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} autoFocus
            placeholder={`Ex: ${servico.label} de chapas, perfis...`}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
        <div>
          <label className="text-xs text-torg-gray block mb-1">Quantidade</label>
          <input type="number" min="0" step="0.01" value={qtd} onChange={(e) => setQtd(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
        <div>
          <label className="text-xs text-torg-gray block mb-1">Unidade</label>
          <select value={unidade} onChange={(e) => setUnidade(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none">
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-torg-gray block mb-1">Peso (kg)</label>
          <input type="number" min="0" step="1" value={pesoKg} onChange={(e) => setPesoKg(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
        <div>
          <label className="text-xs text-torg-gray block mb-1">Custo Unitario</label>
          <input type="number" min="0" step="0.01" value={custoUnit} onChange={(e) => setCustoUnit(parseFloat(e.target.value) || 0)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
        <div>
          <label className="text-xs text-torg-gray block mb-1">Fornecedor</label>
          <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Opcional"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
        <div>
          <label className="text-xs text-torg-gray block mb-1">Observacao</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-torg-dark">Total: {fmtMoeda(total)}</span>
        <div className="flex gap-2">
          {erro && <span className="text-xs text-red-500">{erro}</span>}
          <button onClick={onCancelar} className="px-3 py-1.5 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
          <button onClick={handleSalvar} disabled={salvando}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue/90 disabled:opacity-50">
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
