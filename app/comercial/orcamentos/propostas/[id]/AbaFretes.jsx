"use client";
import { useState } from "react";
import {
  Plus, Trash2, Loader2, X, Edit3, Check, Truck, MapPin,
} from "lucide-react";

const TIPOS_VEICULO = [
  { value: "TRUCK", label: "Truck" },
  { value: "CARRETA", label: "Carreta" },
  { value: "BITREM", label: "Bitrem" },
  { value: "RODOTREM", label: "Rodotrem" },
  { value: "MUNCK", label: "Munck" },
  { value: "PRANCHA", label: "Prancha" },
  { value: "OUTRO", label: "Outro" },
];

const VEICULO_LABEL = Object.fromEntries(TIPOS_VEICULO.map((v) => [v.value, v.label]));

function fmtNum(v, dec = 0) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtMoeda(v) {
  if (!v && v !== 0) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Modal para adicionar frete ──
function NovoFreteModal({ onClose, onSalvar, obraDefault }) {
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState("Contagem/MG");
  const [destino, setDestino] = useState(obraDefault || "");
  const [distanciaKm, setDistanciaKm] = useState("");
  const [pesoTon, setPesoTon] = useState("");
  const [pesoPorCarga, setPesoPorCarga] = useState("");
  const [tipoVeiculo, setTipoVeiculo] = useState("CARRETA");
  const [quantidadeViagens, setQuantidadeViagens] = useState("1");
  const [custoPorViagem, setCustoPorViagem] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Auto-calcular viagens quando peso total e peso por carga mudam
  const pesoTotalNum = parseFloat(pesoTon) || 0;
  const pesoCargaNum = parseFloat(pesoPorCarga) || 0;
  const viagensAuto = pesoCargaNum > 0 && pesoTotalNum > 0
    ? Math.ceil(pesoTotalNum / pesoCargaNum)
    : null;

  const viagensEfetivas = viagensAuto ?? (parseInt(quantidadeViagens) || 1);
  const custoTotal = viagensEfetivas * (parseFloat(custoPorViagem) || 0);

  const handleSalvar = async () => {
    if (!descricao.trim()) return setErro("Descricao e obrigatoria");
    setSalvando(true);
    setErro("");
    try {
      await onSalvar({
        descricao: descricao.trim(),
        origem: origem.trim() || undefined,
        destino: destino.trim() || undefined,
        distanciaKm: distanciaKm ? parseFloat(distanciaKm) : 0,
        pesoTon: pesoTotalNum,
        pesoPorCarga: pesoCargaNum || undefined,
        tipoVeiculo: tipoVeiculo || undefined,
        quantidadeViagens: viagensEfetivas,
        custoPorViagem: custoPorViagem ? parseFloat(custoPorViagem) : 0,
        custoTotal,
        observacao: observacao.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-torg-dark">Novo Frete</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">
              Descricao <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Frete estruturas metalicas, Frete equipamentos montagem..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">
                <MapPin size={13} className="inline mr-1" />Origem
              </label>
              <input
                type="text"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder="Contagem/MG"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">
                <MapPin size={13} className="inline mr-1" />Destino (Obra)
              </label>
              <input
                type="text"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="Macae/RJ"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Tipo Veiculo</label>
              <select
                value={tipoVeiculo}
                onChange={(e) => setTipoVeiculo(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              >
                {TIPOS_VEICULO.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Distancia (km)</label>
              <input
                type="number"
                value={distanciaKm}
                onChange={(e) => setDistanciaKm(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Peso Total (ton)</label>
              <input
                type="number"
                value={pesoTon}
                onChange={(e) => setPesoTon(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Peso/Carga (ton)</label>
              <input
                type="number"
                value={pesoPorCarga}
                onChange={(e) => setPesoPorCarga(e.target.value)}
                placeholder="Ex: 25"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Qtd Viagens</label>
              {viagensAuto !== null ? (
                <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm font-semibold text-torg-blue">
                  {viagensAuto} <span className="text-xs font-normal text-blue-400">(auto)</span>
                </div>
              ) : (
                <input
                  type="number"
                  value={quantidadeViagens}
                  onChange={(e) => setQuantidadeViagens(e.target.value)}
                  placeholder="1"
                  min="1"
                  step="1"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Custo/Viagem (R$)</label>
              <input
                type="number"
                value={custoPorViagem}
                onChange={(e) => setCustoPorViagem(e.target.value)}
                placeholder="0,00"
                min="0"
                step="0.01"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1">Custo Total</label>
              <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-torg-dark">
                {fmtMoeda(custoTotal)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1">Observacao</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional..."
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando || !descricao.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark transition-colors disabled:opacity-50"
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──
export default function AbaFretes({ estudo, estudoId }) {
  const [itens, setItens] = useState(estudo.itensFretes || []);
  const [showModal, setShowModal] = useState(false);
  const [excluindoId, setExcluindoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [editValores, setEditValores] = useState({});
  const [toast, setToast] = useState(null);

  const obraDefault = estudo.orcamento?.obra || "";

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Adicionar ──
  const handleAdicionarItem = async (dados) => {
    const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);
    setItens(json.data);
  };

  // ── Excluir ──
  const handleExcluir = async (itemId) => {
    setExcluindoId(itemId);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes?itemId=${itemId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.filter((i) => i.id !== itemId));
      showToast("Frete removido");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    } finally {
      setExcluindoId(null);
    }
  };

  // ── Editar inline ──
  const startEdit = (item) => {
    setEditandoId(item.id);
    setEditValores({
      descricao: item.descricao,
      origem: item.origem || "",
      destino: item.destino || "",
      distanciaKm: item.distanciaKm || 0,
      pesoTon: item.pesoTon || 0,
      pesoPorCarga: item.pesoPorCarga || "",
      tipoVeiculo: item.tipoVeiculo || "CARRETA",
      quantidadeViagens: item.quantidadeViagens || 1,
      custoPorViagem: item.custoPorViagem || 0,
      observacao: item.observacao || "",
    });
  };

  const cancelEdit = () => {
    setEditandoId(null);
    setEditValores({});
  };

  const saveEdit = async () => {
    const pesoT = editValores.pesoTon || 0;
    const pesoC = parseFloat(editValores.pesoPorCarga) || 0;
    const viagensCalc = pesoC > 0 && pesoT > 0
      ? Math.ceil(pesoT / pesoC)
      : (editValores.quantidadeViagens || 1);
    const custoTotal = viagensCalc * (editValores.custoPorViagem || 0);
    try {
      const res = await fetch(`/api/comercial/estudo/${estudoId}/fretes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: editandoId,
          ...editValores,
          pesoPorCarga: pesoC || undefined,
          quantidadeViagens: viagensCalc,
          custoTotal,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setItens((prev) => prev.map((i) => (i.id === editandoId ? json.data : i)));
      setEditandoId(null);
      setEditValores({});
      showToast("Frete atualizado");
    } catch (e) {
      showToast(`Erro: ${e.message}`);
    }
  };

  // Totais
  const totalFrete = itens.reduce((s, i) => s + (i.custoTotal || 0), 0);
  const totalPeso = itens.reduce((s, i) => s + (i.pesoTon || 0), 0);
  const totalViagens = itens.reduce((s, i) => s + (i.quantidadeViagens || 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-torg-dark">
            {itens.length} {itens.length === 1 ? "frete" : "fretes"}
          </h3>
          {itens.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-torg-gray">
              <span>{fmtNum(totalPeso, 2)} ton</span>
              <span className="text-gray-300">|</span>
              <span>{totalViagens} viagens</span>
              <span className="text-gray-300">|</span>
              <span className="font-semibold text-torg-dark">{fmtMoeda(totalFrete)}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-torg-blue text-white rounded-lg text-sm font-medium hover:bg-torg-dark transition-colors"
        >
          <Plus size={14} />
          Adicionar Frete
        </button>
      </div>

      {/* Cards resumo */}
      {itens.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
            <p className="text-xs text-blue-600 font-medium mb-0.5">Peso Total</p>
            <p className="text-lg font-bold text-blue-800">{fmtNum(totalPeso, 2)} ton</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
            <p className="text-xs text-amber-600 font-medium mb-0.5">Total Viagens</p>
            <p className="text-lg font-bold text-amber-800">{totalViagens}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
            <p className="text-xs text-emerald-600 font-medium mb-0.5">Custo Total Frete</p>
            <p className="text-lg font-bold text-emerald-800">{fmtMoeda(totalFrete)}</p>
          </div>
        </div>
      )}

      {/* Tabela */}
      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Truck size={40} className="text-gray-200 mb-3" />
          <p className="text-sm text-torg-gray mb-1">Nenhum frete cadastrado</p>
          <p className="text-xs text-gray-400">
            Adicione fretes para calcular os custos de transporte da obra.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-torg-gray bg-gray-50/60 border-b border-gray-100 whitespace-nowrap">
                <th className="py-2.5 px-2 w-8">#</th>
                <th className="py-2.5 px-2">Descricao</th>
                <th className="py-2.5 px-2">Origem → Destino</th>
                <th className="py-2.5 px-2 text-right">Dist. (km)</th>
                <th className="py-2.5 px-2 text-right">Peso (ton)</th>
                <th className="py-2.5 px-2 text-right">Peso/Carga</th>
                <th className="py-2.5 px-2">Veiculo</th>
                <th className="py-2.5 px-2 text-right">Viagens</th>
                <th className="py-2.5 px-2 text-right">R$/Viagem</th>
                <th className="py-2.5 px-2 text-right">Total</th>
                <th className="py-2.5 px-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itens.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  {editandoId === item.id ? (
                    <>
                      <td className="py-1.5 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={editValores.descricao}
                          onChange={(e) => setEditValores((v) => ({ ...v, descricao: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editValores.origem}
                            onChange={(e) => setEditValores((v) => ({ ...v, origem: e.target.value }))}
                            placeholder="Origem"
                            className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                          />
                          <span className="text-gray-300 text-xs">→</span>
                          <input
                            type="text"
                            value={editValores.destino}
                            onChange={(e) => setEditValores((v) => ({ ...v, destino: e.target.value }))}
                            placeholder="Destino"
                            className="w-24 px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                          />
                        </div>
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={editValores.distanciaKm}
                          onChange={(e) => setEditValores((v) => ({ ...v, distanciaKm: parseFloat(e.target.value) || 0 }))}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={editValores.pesoTon}
                          onChange={(e) => setEditValores((v) => ({ ...v, pesoTon: parseFloat(e.target.value) || 0 }))}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={editValores.pesoPorCarga}
                          onChange={(e) => setEditValores((v) => ({ ...v, pesoPorCarga: e.target.value }))}
                          placeholder="—"
                          min="0"
                          step="0.01"
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <select
                          value={editValores.tipoVeiculo}
                          onChange={(e) => setEditValores((v) => ({ ...v, tipoVeiculo: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        >
                          {TIPOS_VEICULO.map((v) => (
                            <option key={v.value} value={v.value}>{v.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={editValores.quantidadeViagens}
                          onChange={(e) => setEditValores((v) => ({ ...v, quantidadeViagens: parseInt(e.target.value) || 1 }))}
                          min="1"
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={editValores.custoPorViagem}
                          onChange={(e) => setEditValores((v) => ({ ...v, custoPorViagem: parseFloat(e.target.value) || 0 }))}
                          min="0"
                          step="0.01"
                          className="w-24 px-2 py-1 border border-gray-200 rounded text-xs text-right focus:ring-1 focus:ring-torg-blue/30 outline-none"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right text-xs font-medium tabular-nums text-torg-dark">
                        {(() => {
                          const pc = parseFloat(editValores.pesoPorCarga) || 0;
                          const pt = editValores.pesoTon || 0;
                          const v = pc > 0 && pt > 0 ? Math.ceil(pt / pc) : (editValores.quantidadeViagens || 1);
                          return fmtMoeda(v * (editValores.custoPorViagem || 0));
                        })()}
                      </td>
                      <td className="py-1.5 px-2">
                        <div className="flex items-center gap-1">
                          <button onClick={saveEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                            <Check size={14} />
                          </button>
                          <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-2 px-2 font-medium text-torg-dark">{item.descricao}</td>
                      <td className="py-2 px-2 text-xs text-torg-gray">
                        {item.origem && item.destino ? (
                          <span>{item.origem} → {item.destino}</span>
                        ) : item.destino ? (
                          <span>→ {item.destino}</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtNum(item.distanciaKm)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtNum(item.pesoTon, 2)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-torg-gray">
                        {item.pesoPorCarga ? fmtNum(item.pesoPorCarga, 2) : "—"}
                      </td>
                      <td className="py-2 px-2">
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-torg-dark">
                          {VEICULO_LABEL[item.tipoVeiculo] || item.tipoVeiculo || "—"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{item.quantidadeViagens || 1}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtMoeda(item.custoPorViagem)}</td>
                      <td className="py-2 px-2 text-right font-medium tabular-nums text-torg-dark">
                        {fmtMoeda(item.custoTotal)}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1 text-gray-400 hover:text-torg-blue hover:bg-torg-blue/5 rounded transition-colors"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            onClick={() => handleExcluir(item.id)}
                            disabled={excluindoId === item.id}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          >
                            {excluindoId === item.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {/* Total */}
              {itens.length > 0 && (
                <tr className="bg-gray-50/60 border-t border-gray-200">
                  <td className="py-2.5 px-2" colSpan={4}></td>
                  <td className="py-2.5 px-2 text-right text-xs font-bold text-torg-dark tabular-nums">
                    {fmtNum(totalPeso, 2)} ton
                  </td>
                  <td className="py-2.5 px-2" colSpan={2}></td>
                  <td className="py-2.5 px-2 text-right text-xs font-bold text-torg-dark tabular-nums">
                    {totalViagens}
                  </td>
                  <td className="py-2.5 px-2 text-right text-xs font-bold text-torg-dark uppercase">Total</td>
                  <td className="py-2.5 px-2 text-right text-sm font-bold text-torg-dark tabular-nums">
                    {fmtMoeda(totalFrete)}
                  </td>
                  <td className="py-2.5 px-2"></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <NovoFreteModal
          onClose={() => setShowModal(false)}
          onSalvar={handleAdicionarItem}
          obraDefault={obraDefault}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-torg-dark text-white px-4 py-2.5 rounded-xl text-sm shadow-lg z-50 animate-in fade-in slide-in-from-bottom-4">
          {toast}
        </div>
      )}
    </div>
  );
}
