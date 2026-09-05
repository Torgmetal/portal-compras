"use client";
import { useState } from "react";
import { Loader2, FileText, CheckCircle2, Check, Edit2, Edit3, RotateCcw, Package } from "lucide-react";
import { ModalEditarPedido, ModalReceberPedido } from "./ModaisPedido";

export function PedidosGerados({ pedidos, rmId: _rmId, onRevertido, isAdmin, userRole }) {
  const [revertendo, setRevertendo] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [toast, setToast] = useState(null);
  const [modalReceber, setModalReceber] = useState(null);
  const [modalEditar, setModalEditar] = useState(null);

  const handleReverter = async (pedido) => {
    setRevertendo(pedido.id);
    setConfirmando(null);
    try {
      const res = await fetch(`/api/pedido-omie/${pedido.id}/reverter`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setToast({ ok: true, msg: `Pedido ${pedido.numeroPedido || ""} revertido. Itens voltaram para cotação.` });
      setTimeout(() => { setToast(null); onRevertido(); }, 2000);
    } catch (e) {
      setToast({ ok: false, msg: `Erro: ${e.message}` });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setRevertendo(null);
    }
  };

  const podeReverter = isAdmin || userRole === "COMPRAS";
  const podeReceber = isAdmin || userRole === "COMPRAS";
  const pedidosAtivos = pedidos.filter((p) => p.status === "CRIADO");
  const pedidosRevertidos = pedidos.filter((p) => p.status === "REVERTIDO");
  const qtdRecebidos = pedidosAtivos.filter((p) => ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(p.statusEntrega)).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
          <Package size={18} className="text-torg-blue" />
          Pedidos de Compra ({pedidosAtivos.length})
          {qtdRecebidos > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {qtdRecebidos} recebido{qtdRecebidos > 1 ? "s" : ""}
            </span>
          )}
        </h3>
        <p className="text-xs text-torg-gray mt-1">
          Pedidos gerados no Omie a partir dos vencedores desta RM. Para comprar de outro fornecedor, cancele o pedido no Omie e reverta aqui.
        </p>
      </div>

      {toast && (
        <div className={`mx-6 mt-3 text-xs rounded-lg px-3 py-2 ${
          toast.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {toast.ok ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}

      <ul className="divide-y divide-gray-100">
        {pedidosAtivos.map((p) => {
          const recebido = ["ENTREGUE", "ATRASADO", "RECEBIDO"].includes(p.statusEntrega);
          return (
            <li key={p.id} className={`px-6 py-4 ${recebido ? "bg-emerald-50/30" : ""}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-torg-dark font-semibold">{p.fornecedorNome}</p>
                    {p.numeroPedido && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-torg-dark text-white font-medium">
                        #{p.numeroPedido}
                      </span>
                    )}
                    {p.faturamentoDireto && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                        FD
                      </span>
                    )}
                    {recebido ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium inline-flex items-center gap-1">
                        <CheckCircle2 size={10} /> Recebido
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        Aguardando entrega
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-torg-gray mt-0.5">
                    {p.rmItens.length} {p.rmItens.length === 1 ? "item" : "itens"} desta RM
                    {" · "}{new Date(p.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                  {/* Info de NF e recebimento */}
                  {recebido && (
                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                      {p.nfNumero && (
                        <span className="text-xs inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <FileText size={10} /> NF {p.nfNumero}{p.nfSerie ? ` / Série ${p.nfSerie}` : ""}
                        </span>
                      )}
                      {p.recebidoEm && (
                        <span className="text-xs text-torg-gray">
                          Recebido em {new Date(p.recebidoEm).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                      {p.recebidoPor?.name && (
                        <span className="text-xs text-torg-gray">
                          por {p.recebidoPor.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-torg-orange-700 font-semibold tabular-nums text-sm">
                  {Number(p.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
                {/* Botoes de acao */}
                <div className="flex items-center gap-2 flex-wrap">
                  {podeReverter && (
                    <button
                      onClick={() => setModalEditar(p)}
                      className="px-3 py-1.5 text-xs bg-white border border-gray-200 text-torg-dark rounded-lg hover:bg-gray-50 font-medium inline-flex items-center gap-1"
                      title="Editar valor, fornecedor ou observação do pedido"
                    >
                      <Edit2 size={12} /> Editar
                    </button>
                  )}
                  {podeReceber && !recebido && (
                    <button
                      onClick={() => setModalReceber(p)}
                      className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium inline-flex items-center gap-1"
                      title="Registrar recebimento com numero da NF"
                    >
                      <CheckCircle2 size={12} /> Receber
                    </button>
                  )}
                  {podeReceber && recebido && (
                    <button
                      onClick={() => setModalReceber(p)}
                      className="px-3 py-1.5 text-xs bg-white border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-50 font-medium inline-flex items-center gap-1"
                      title="Editar dados do recebimento"
                    >
                      <Edit3 size={12} /> Editar NF
                    </button>
                  )}
                  {podeReverter && !recebido && (
                    <>
                      {confirmando === p.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-600 font-medium">Cancelou no Omie?</span>
                          <button
                            onClick={() => handleReverter(p)}
                            disabled={revertendo === p.id}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            {revertendo === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Sim, reverter
                          </button>
                          <button
                            onClick={() => setConfirmando(null)}
                            className="px-2 py-1.5 text-xs text-torg-gray hover:text-torg-dark"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmando(p.id)}
                          className="px-3 py-1.5 text-xs bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium inline-flex items-center gap-1"
                          title="Reverter pedido: volta os itens pro status Cotado e desmarca vencedores. Cancele o pedido no Omie antes!"
                        >
                          <RotateCcw size={12} /> Reverter
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {pedidosRevertidos.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60">
          <p className="text-xs text-torg-gray mb-2">Revertidos anteriormente:</p>
          {pedidosRevertidos.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <RotateCcw size={10} />
              <span className="line-through">{p.fornecedorNome}</span>
              {p.numeroPedido && <span>#{p.numeroPedido}</span>}
              <span>{Number(p.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Recebimento */}
      {modalReceber && (
        <ModalReceberPedido
          pedido={modalReceber}
          onClose={() => setModalReceber(null)}
          onSaved={() => { setModalReceber(null); onRevertido(); }}
        />
      )}

      {/* Modal de Edição do Pedido */}
      {modalEditar && (
        <ModalEditarPedido
          pedido={modalEditar}
          onClose={() => setModalEditar(null)}
          onSaved={() => { setModalEditar(null); onRevertido(); }}
        />
      )}
    </div>
  );
}

// ─── MODAL EDITAR PEDIDO ──
