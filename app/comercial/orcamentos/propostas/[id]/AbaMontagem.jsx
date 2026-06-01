"use client";
import { useState, useMemo } from "react";
import {
  Plus, Trash2, Loader2, Save, HardHat, Home, Container,
  Wrench, MoreHorizontal, X, ChevronDown, ChevronUp,
} from "lucide-react";

const SECOES = [
  { id: "EQUIPE", label: "Equipe de Montagem", icon: HardHat, cor: "text-torg-blue", bg: "bg-torg-blue/5", border: "border-torg-blue/20",
    colunas: { quantidade: "Qtd Pessoas", dias: "Dias", custoDiario: "Custo/Dia" },
    sugestoes: ["Montador", "Encarregado", "Supervisor", "Auxiliar", "Soldador", "Operador de Guindaste", "Mobilizacao/Desmobilizacao"],
  },
  { id: "ALOJAMENTO", label: "Alojamento", icon: Home, cor: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200",
    colunas: { quantidade: "Qtd", dias: "Dias", custoDiario: "Custo/Dia" },
    sugestoes: ["Hotel", "Alojamento em container", "Casa alugada", "Pousada", "Alimentacao (VR)", "Transporte local"],
  },
  { id: "CONTAINER", label: "Containers", icon: Container, cor: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200",
    colunas: { quantidade: "Qtd", dias: "Dias", custoDiario: "Custo/Dia" },
    sugestoes: ["Escritorio", "Ferramental", "Almoxarifado", "Vestiario", "Refeitorio", "Banheiro quimico"],
  },
  { id: "EQUIPAMENTO", label: "Equipamentos", icon: Wrench, cor: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200",
    colunas: { quantidade: "Qtd", dias: "Dias Aluguel", custoDiario: "Custo/Dia" },
    sugestoes: ["Guindaste", "Plataforma elevatoria", "Munck", "Andaime", "Gerador", "Compressor", "Maquina de solda", "Martelete"],
  },
  { id: "OUTROS", label: "Outros Custos", icon: MoreHorizontal, cor: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200",
    colunas: { quantidade: "Qtd", dias: "—", custoDiario: "—" },
    usaCustoFixo: true,
    sugestoes: ["EPI / Uniformes", "Ferramentas de consumo", "Seguro de obra", "Taxas e licencas", "Comunicacao (internet/telefone)", "Documentacao"],
  },
];

const SECAO_MAP = Object.fromEntries(SECOES.map((s) => [s.id, s]));

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AbaMontagem({ estudo, estudoId }) {
  const [itens, setItens] = useState(estudo.itensMontagem || []);
  const [secaoAberta, setSecaoAberta] = useState("EQUIPE");
  const [novoItem, setNovoItem] = useState(null);
  const [salvando, setSalvando] = useState(null);
  const [excluindo, setExcluindo] = useState(null);

  const itensPorSecao = useMemo(() => {
    const mapa = {};
    for (const s of SECOES) mapa[s.id] = [];
    for (const it of itens) {
      if (mapa[it.secao]) mapa[it.secao].push(it);
    }
    return mapa;
  }, [itens]);

  const totalPorSecao = useMemo(() => {
    const mapa = {};
    for (const [secao, lista] of Object.entries(itensPorSecao)) {
      mapa[secao] = lista.reduce((s, it) => s + (it.custoTotal || 0), 0);
    }
    return mapa;
  }, [itensPorSecao]);

  const totalGeral = Object.values(totalPorSecao).reduce((s, v) => s + v, 0);

  // ── API helpers ──
  const apiBase = `/api/comercial/estudo/${estudoId}/montagem`;

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
            <HardHat size={20} className="text-torg-blue" /> Montagem em Obra
          </h3>
          <p className="text-xs text-torg-gray mt-0.5">
            Custos de equipe, alojamento, containers, equipamentos e demais despesas de campo.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-torg-gray">Total Montagem</p>
          <p className="text-xl font-bold text-torg-dark">{fmtMoeda(totalGeral)}</p>
        </div>
      </div>

      {/* Seções accordion */}
      {SECOES.map((secao) => {
        const lista = itensPorSecao[secao.id] || [];
        const total = totalPorSecao[secao.id] || 0;
        const aberta = secaoAberta === secao.id;
        const Icon = secao.icon;

        return (
          <div key={secao.id} className={`border rounded-xl overflow-hidden ${secao.border}`}>
            {/* Header da seção */}
            <button
              onClick={() => setSecaoAberta(aberta ? null : secao.id)}
              className={`w-full flex items-center justify-between px-5 py-3.5 ${secao.bg} text-left transition-colors`}
            >
              <div className="flex items-center gap-2.5">
                <Icon size={18} className={secao.cor} />
                <span className="font-semibold text-torg-dark text-sm">{secao.label}</span>
                <span className="text-xs text-torg-gray">({lista.length} iten{lista.length === 1 ? "" : "s"})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm text-torg-dark">{fmtMoeda(total)}</span>
                {aberta ? <ChevronUp size={16} className="text-torg-gray" /> : <ChevronDown size={16} className="text-torg-gray" />}
              </div>
            </button>

            {aberta && (
              <div className="p-4 space-y-3 bg-white">
                {/* Tabela de itens */}
                {lista.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-torg-gray border-b border-gray-200">
                          <th className="pb-2 pr-3">Descricao</th>
                          <th className="pb-2 pr-3 w-20 text-right">{secao.colunas.quantidade}</th>
                          {!secao.usaCustoFixo && (
                            <>
                              <th className="pb-2 pr-3 w-20 text-right">{secao.colunas.dias}</th>
                              <th className="pb-2 pr-3 w-28 text-right">{secao.colunas.custoDiario}</th>
                            </>
                          )}
                          {secao.usaCustoFixo && (
                            <th className="pb-2 pr-3 w-28 text-right">Custo</th>
                          )}
                          <th className="pb-2 pr-3 w-28 text-right">Total</th>
                          <th className="pb-2 w-16 text-right">Obs.</th>
                          <th className="pb-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {lista.map((item) => (
                          <LinhaItem
                            key={item.id}
                            item={item}
                            secao={secao}
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

                {/* Form novo item */}
                {novoItem?.secao === secao.id ? (
                  <NovoItemForm
                    secao={secao}
                    descricaoInicial={novoItem.descricao || ""}
                    onSalvar={async (data) => {
                      await criarItem({ ...data, secao: secao.id });
                      setNovoItem(null);
                    }}
                    onCancelar={() => setNovoItem(null)}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setNovoItem({ secao: secao.id })}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-torg-blue hover:bg-torg-blue/5 rounded-lg transition-colors"
                    >
                      <Plus size={14} /> Adicionar item
                    </button>
                    {secao.sugestoes && (
                      <div className="flex flex-wrap gap-1">
                        {secao.sugestoes.slice(0, 4).map((sug) => (
                          <button
                            key={sug}
                            onClick={() => setNovoItem({ secao: secao.id, descricao: sug })}
                            className="px-2 py-0.5 text-[10px] bg-gray-100 text-torg-gray rounded hover:bg-gray-200 transition-colors"
                          >
                            + {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Resumo geral */}
      <div className="bg-gradient-to-r from-torg-dark to-torg-blue rounded-xl p-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm">Resumo — Custos de Montagem</h4>
          <span className="text-2xl font-bold">{fmtMoeda(totalGeral)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {SECOES.map((s) => (
            <div key={s.id} className="bg-white/10 rounded-lg px-3 py-2">
              <p className="text-[10px] text-white/70 uppercase tracking-wide">{s.label}</p>
              <p className="text-sm font-semibold">{fmtMoeda(totalPorSecao[s.id] || 0)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Linha editável in-place ──
function LinhaItem({ item, secao, onUpdate, onDelete, salvando, excluindo }) {
  const [editando, setEditando] = useState(false);
  const [desc, setDesc] = useState(item.descricao);
  const [qtd, setQtd] = useState(item.quantidade);
  const [dias, setDias] = useState(item.dias);
  const [custoDiario, setCustoDiario] = useState(item.custoDiario);
  const [custoFixo, setCustoFixo] = useState(item.custoFixo);
  const [obs, setObs] = useState(item.observacao || "");

  const total = secao.usaCustoFixo
    ? custoFixo * qtd
    : qtd * dias * custoDiario;

  const salvar = () => {
    onUpdate(item.id, {
      descricao: desc,
      quantidade: qtd,
      dias,
      custoDiario,
      custoFixo,
      custoTotal: total,
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
          <input type="number" min="1" value={qtd} onChange={(e) => setQtd(parseInt(e.target.value) || 1)}
            className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
        </td>
        {!secao.usaCustoFixo && (
          <>
            <td className="py-2 pr-2">
              <input type="number" min="0" step="0.5" value={dias} onChange={(e) => setDias(parseFloat(e.target.value) || 0)}
                className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
            </td>
            <td className="py-2 pr-2">
              <input type="number" min="0" step="0.01" value={custoDiario} onChange={(e) => setCustoDiario(parseFloat(e.target.value) || 0)}
                className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
            </td>
          </>
        )}
        {secao.usaCustoFixo && (
          <td className="py-2 pr-2">
            <input type="number" min="0" step="0.01" value={custoFixo} onChange={(e) => setCustoFixo(parseFloat(e.target.value) || 0)}
              className="w-28 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
          </td>
        )}
        <td className="py-2 pr-2 text-right font-medium text-torg-dark text-sm">{fmtMoeda(total)}</td>
        <td className="py-2 pr-2">
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="—"
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
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
      <td className="py-2.5 pr-3 text-right text-torg-gray">{item.quantidade}</td>
      {!secao.usaCustoFixo && (
        <>
          <td className="py-2.5 pr-3 text-right text-torg-gray">{item.dias}</td>
          <td className="py-2.5 pr-3 text-right text-torg-gray">{fmtMoeda(item.custoDiario)}</td>
        </>
      )}
      {secao.usaCustoFixo && (
        <td className="py-2.5 pr-3 text-right text-torg-gray">{fmtMoeda(item.custoFixo)}</td>
      )}
      <td className="py-2.5 pr-3 text-right font-medium text-torg-dark">{fmtMoeda(item.custoTotal)}</td>
      <td className="py-2.5 pr-3 text-xs text-torg-gray truncate max-w-[100px]" title={item.observacao}>{item.observacao || "—"}</td>
      <td className="py-2.5 text-right">
        <button onClick={() => excluirItem(item.id)} disabled={excluindo}
          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50">
          {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </td>
    </tr>
  );

  function excluirItem(id) {
    onDelete(id);
  }
}

// ── Form inline para novo item ──
function NovoItemForm({ secao, descricaoInicial = "", onSalvar, onCancelar }) {
  const [desc, setDesc] = useState(descricaoInicial);
  const [qtd, setQtd] = useState(1);
  const [dias, setDias] = useState(30);
  const [custoDiario, setCustoDiario] = useState(0);
  const [custoFixo, setCustoFixo] = useState(0);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const total = secao.usaCustoFixo ? custoFixo * qtd : qtd * dias * custoDiario;

  const handleSalvar = async () => {
    if (!desc.trim()) return setErro("Descricao obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        descricao: desc.trim(),
        quantidade: qtd,
        dias: secao.usaCustoFixo ? 0 : dias,
        custoDiario: secao.usaCustoFixo ? 0 : custoDiario,
        custoFixo: secao.usaCustoFixo ? custoFixo : 0,
        custoTotal: total,
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
        <div className="col-span-2 sm:col-span-4">
          <label className="text-xs text-torg-gray block mb-1">Descricao</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} autoFocus
            placeholder={secao.sugestoes?.[0] || "Descricao do item"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
        <div>
          <label className="text-xs text-torg-gray block mb-1">{secao.colunas.quantidade}</label>
          <input type="number" min="1" value={qtd} onChange={(e) => setQtd(parseInt(e.target.value) || 1)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
        </div>
        {!secao.usaCustoFixo && (
          <>
            <div>
              <label className="text-xs text-torg-gray block mb-1">{secao.colunas.dias}</label>
              <input type="number" min="0" step="0.5" value={dias} onChange={(e) => setDias(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="text-xs text-torg-gray block mb-1">{secao.colunas.custoDiario}</label>
              <input type="number" min="0" step="0.01" value={custoDiario} onChange={(e) => setCustoDiario(parseFloat(e.target.value) || 0)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
            </div>
          </>
        )}
        {secao.usaCustoFixo && (
          <div>
            <label className="text-xs text-torg-gray block mb-1">Custo</label>
            <input type="number" min="0" step="0.01" value={custoFixo} onChange={(e) => setCustoFixo(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:ring-2 focus:ring-torg-blue/20 focus:border-torg-blue outline-none" />
          </div>
        )}
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
