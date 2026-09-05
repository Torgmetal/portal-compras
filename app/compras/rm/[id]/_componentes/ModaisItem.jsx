"use client";
import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Modal } from "./Modal";
import { fmtMoeda } from "../_lib/formatos";

export function ModalCancelarItem({ item, rmId, onClose, onSaved }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const submit = async () => {
    if (!motivo.trim()) return setErro("Descreva o motivo do cancelamento.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/itens/${item.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
      onClose();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Cancelar item da RM" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <p className="text-sm text-torg-gray">
          Cancelando: <strong className="text-torg-dark">{item.descricao}</strong>
        </p>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Motivo *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex: Item descontinuado pelo fornecedor; comprado externamente; substituído por outro."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
          />
        </div>
        <p className="text-xs text-torg-gray">
          O item fica registrado como cancelado com seu motivo (não é apagado, fica no histórico).
        </p>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Cancelar item
        </button>
      </div>
    </Modal>
  );
}

export function ModalAtenderEstoque({ item, rmId, onClose, onSaved }) {
  const qtdSugerida = item.peso > 0 ? Number(item.peso) : Number(item.qtd) || 0;
  const [quantidade, setQuantidade] = useState(qtdSugerida || "");
  const [precoUnit, setPrecoUnit] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoPreco, setBuscandoPreco] = useState(false);
  const [infoOmie, setInfoOmie] = useState(null);

  // Busca preco medio do Omie quando tem codigo
  useEffect(() => {
    if (!item.codigo) return;
    setBuscandoPreco(true);
    fetch(`/api/omie/preco-medio?codigo=${encodeURIComponent(item.codigo)}`)
      .then((r) => r.json())
      .then((data) => {
        setInfoOmie(data);
        // Prioriza ultimo preco de compra; fallback pro CMC
        const preco = data.precoUltCompra || data.cmc || 0;
        if (preco > 0) setPrecoUnit(String(preco));
      })
      .catch(() => {})
      .finally(() => setBuscandoPreco(false));
  }, [item.codigo]);

  const totalEstimado = Number(precoUnit || 0) * Number(quantidade || 0);

  const submit = async () => {
    const qtd = Number(quantidade);
    if (!qtd || qtd <= 0) return setErro("Informe a quantidade atendida.");
    setSalvando(true);
    try {
      const res = await fetch(`/api/rm/${rmId}/itens/${item.id}/atender-estoque`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantidade: qtd,
          precoUnitario: Number(precoUnit) || undefined,
          observacao: observacao.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSaved();
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Atender com estoque" onClose={onClose}>
      <div className="px-6 py-5 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <p className="text-sm text-emerald-800 font-medium">{item.descricao}</p>
          <p className="text-xs text-emerald-600 mt-1">
            Solicitado: {item.peso > 0 ? `${Number(item.peso).toLocaleString("pt-BR")} KG` : `${Number(item.qtd).toLocaleString("pt-BR")} ${item.unidade}`}
            {item.material && ` · ${item.material}`}
            {item.codigo && ` · Cod: ${item.codigo}`}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Quantidade atendida *</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
            />
            <span className="text-sm text-torg-gray font-medium">{item.peso > 0 ? "KG" : item.unidade}</span>
          </div>
        </div>
        {/* Preco unitario (CMC do Omie) */}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">
            Preco unitario (R$)
            <span className="text-xs text-torg-gray font-normal ml-1">
              {buscandoPreco ? "(buscando no Omie...)" : infoOmie?.cmc ? "(sugerido pelo Omie)" : "(opcional)"}
            </span>
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-torg-gray">R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={precoUnit}
                onChange={(e) => setPrecoUnit(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {buscandoPreco && <Loader2 size={16} className="text-emerald-500 animate-spin" />}
          </div>
          {infoOmie && (infoOmie.cmc > 0 || infoOmie.precoUltCompra > 0) && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[10px] text-torg-gray">
              {infoOmie.cmc > 0 && (
                <button
                  type="button"
                  onClick={() => setPrecoUnit(String(infoOmie.cmc))}
                  className="hover:text-emerald-700 underline"
                >
                  CMC: {fmtMoeda(infoOmie.cmc)}
                </button>
              )}
              {infoOmie.precoUltCompra > 0 && (
                <button
                  type="button"
                  onClick={() => setPrecoUnit(String(infoOmie.precoUltCompra))}
                  className="hover:text-emerald-700 underline"
                >
                  Ult. compra: {fmtMoeda(infoOmie.precoUltCompra)}
                  {infoOmie.dataUltCompra && ` (${infoOmie.dataUltCompra})`}
                </button>
              )}
              {infoOmie.saldo > 0 && (
                <span>Saldo: {Number(infoOmie.saldo).toLocaleString("pt-BR")} {infoOmie.unidade}</span>
              )}
            </div>
          )}
        </div>
        {/* Total estimado */}
        {totalEstimado > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-amber-800 font-medium">Custo estimado (controle interno)</span>
            <span className="text-sm text-amber-900 font-bold tabular-nums">{fmtMoeda(totalEstimado)}</span>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-torg-dark mb-1">Observacao</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex: Material retirado do estoque principal; saldo da OP anterior."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <p className="text-xs text-torg-gray">
          O item sera marcado como atendido pelo estoque interno. O custo estimado sera usado apenas para controle financeiro da OP
          (nao entra no calculo de FD/contrato). Nenhum pedido Omie sera gerado.
        </p>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Voltar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Atender com estoque
        </button>
      </div>
    </Modal>
  );
}
