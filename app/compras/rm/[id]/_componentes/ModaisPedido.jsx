"use client";
import { useState } from "react";
import { Loader2, AlertCircle, X, CheckCircle2, Check, Edit2, RotateCcw } from "lucide-react";
import { numeroBR } from "@/lib/numero-br";
import { EvidenciaRecebimento } from "./EvidenciaRecebimento";

export function ModalEditarPedido({ pedido, onClose, onSaved }) {
  const [total, setTotal] = useState(String(pedido.total || 0));
  const [fornecedor, setFornecedor] = useState(pedido.fornecedorNome || "");
  const [numeroPed, setNumeroPed] = useState(pedido.numeroPedido || "");
  const [obs, setObs] = useState(pedido.observacao || "");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  // ⚠ era um parser BR local, correto mas paralelo. Duas implementações da mesma conversão é
  // exatamente como o erro dos 1000× se espalhou — uma fonte só (lib/numero-br).
  const parseTotal = (v) => numeroBR(v, NaN); // NaN para o guard de "Valor invalido" continuar valendo

  const handleSalvar = async () => {
    const totalNum = parseTotal(total);
    if (!Number.isFinite(totalNum) || totalNum < 0) {
      setErro("Valor invalido");
      return;
    }
    if (!fornecedor.trim()) {
      setErro("Nome do fornecedor obrigatorio");
      return;
    }
    setSaving(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/editar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: totalNum,
          fornecedorNome: fornecedor.trim(),
          numeroPedido: numeroPed.trim() || null,
          observacao: obs.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Erro ao salvar");
      onSaved();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <Edit2 size={16} className="text-torg-blue" />
            Editar Pedido
          </h3>
          <button onClick={onClose} className="text-torg-gray hover:text-torg-dark"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-xs text-torg-gray">
            Ajuste os dados do pedido no portal para refletir alterações feitas diretamente no Omie.
          </p>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Valor total (R$) *</label>
            <input
              type="text"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
              placeholder="39.804,33"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Fornecedor *</label>
            <input
              type="text"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Nº Pedido Omie</label>
            <input
              type="text"
              value={numeroPed}
              onChange={(e) => setNumeroPed(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue"
              placeholder="1461"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-torg-dark mb-1">Observação</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-torg-blue focus:border-torg-blue resize-none"
              placeholder="Motivo da alteração..."
            />
          </div>

          {erro && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" /> {erro}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={saving}
            className="px-4 py-2 text-sm bg-torg-blue text-white rounded-lg hover:bg-torg-blue/90 font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL RECEBER PEDIDO ──

export function ModalReceberPedido({ pedido, onClose, onSaved }) {
  const jaRecebido = pedido.statusEntrega === "RECEBIDO";
  const [nfNumero, setNfNumero] = useState(pedido.nfNumero || "");
  const [nfSerie, setNfSerie] = useState(pedido.nfSerie || "");
  const [dataRecebimento, setDataRecebimento] = useState(
    pedido.recebidoEm
      ? new Date(pedido.recebidoEm).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0]
  );
  const [salvando, setSalvando] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [erro, setErro] = useState("");

  const handleSalvar = async () => {
    if (!nfNumero.trim()) { setErro("Numero da NF obrigatorio"); return; }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/receber`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nfNumero: nfNumero.trim(),
          nfSerie: nfSerie.trim() || null,
          dataRecebimento: dataRecebimento || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSaved();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleDesfazer = async () => {
    if (!window.confirm("Desfazer recebimento? O pedido volta pro status anterior.")) return;
    setDesfazendo(true);
    setErro("");
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/receber`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSaved();
    } catch (e) {
      setErro(e.message);
    } finally {
      setDesfazendo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" />
            {jaRecebido ? "Editar Recebimento" : "Registrar Recebimento"}
          </h3>
          <button onClick={onClose} className="text-torg-gray hover:text-torg-dark">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Info do pedido */}
          <div className="text-sm text-torg-gray bg-gray-50 rounded-lg px-3 py-2">
            <p className="font-medium text-torg-dark">{pedido.fornecedorNome}</p>
            <p className="text-xs mt-0.5">
              Pedido {pedido.numeroPedido ? `#${pedido.numeroPedido}` : "(sem numero)"}
              {" · "}{Number(pedido.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>

          {/* Numero da NF */}
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Numero da NF <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nfNumero}
              onChange={(e) => setNfNumero(e.target.value)}
              placeholder="Ex: 12345"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
              autoFocus
            />
          </div>

          {/* Serie (opcional) */}
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Serie <span className="text-xs text-torg-gray font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={nfSerie}
              onChange={(e) => setNfSerie(e.target.value)}
              placeholder="Ex: 1"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            />
          </div>

          {/* Data de recebimento */}
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">
              Data de recebimento
            </label>
            <input
              type="date"
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none"
            />
          </div>

          {/* ⚠⚠ A FOTO DO MATERIAL CHEGANDO. Vitor (04/09/2026): "preciso que na página de compras
              você me permita anexar imagens para podermos evidenciar recebimento de material".
              Fica DENTRO do recebimento, e não numa aba à parte: a hora de fotografar é a hora em
              que se registra a NF — separado, ninguém volta para anexar depois. */}
          <EvidenciaRecebimento pedidoId={pedido.id} />

          {erro && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div>
            {jaRecebido && (
              <button
                onClick={handleDesfazer}
                disabled={desfazendo}
                className="px-3 py-2 text-xs bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium inline-flex items-center gap-1 disabled:opacity-50"
              >
                {desfazendo ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Desfazer recebimento
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={salvando || !nfNumero.trim()}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {jaRecebido ? "Atualizar" : "Confirmar Recebimento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONFIG PEDIDO OMIE (categoria) ──
