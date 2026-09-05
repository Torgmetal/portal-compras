"use client";
import { XCircle, Edit2, Plus, Package } from "lucide-react";
import { fmtMoeda, STATUS_ITEM_LABELS, STATUS_SEM_PROPOSTA } from "../_lib/formatos";

// Tabela de itens da RM. So renderiza — abrir modal e responsabilidade de quem monta.
export function TabelaItensRM({
  rm,
  isAdmin,
  userRole,
  ehServicoDireto,
  setModalAddItem,
  setModalEditarItem,
  setModalAtenderEstoque,
  setModalCancelarItem,
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-torg-dark">Itens ({rm.itens.length})</h3>
        {(isAdmin || userRole === "COMPRAS") && !ehServicoDireto && (
          <button
            onClick={() => setModalAddItem(true)}
            className="px-3 py-1.5 text-xs bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium inline-flex items-center gap-1"
            title="Adicionar um item esquecido — entra nas cotações abertas pro fornecedor cotar"
          >
            <Plus size={14} /> Adicionar item
          </button>
        )}
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rm.itens.map((it, i) => {
              // Item marcado como COTADO mas sem proposta com preço — fornecedor
              // nao cotou. Mostra label "Sem proposta" pro usuario perceber.
              const semProposta = it.status === "COTADO" && it.temPropostaComPreco === false;
              const statusItem = semProposta
                ? STATUS_SEM_PROPOSTA
                : (STATUS_ITEM_LABELS[it.status] || STATUS_ITEM_LABELS.PENDENTE);
              const podeCancelar =
                (isAdmin || userRole === "COMPRAS") &&
                ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status);
              const podeAtenderEstoque =
                (isAdmin || userRole === "COMPRAS") &&
                ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status);
              // Editar item: ADMIN/COMPRAS sempre podem revisar dados.
              // Pra itens ja PEDIDO_GERADO/CANCELADO aparece aviso no modal
              // (ajustes nao alteram pedido ja criado no Omie).
              const podeEditarItem = isAdmin || userRole === "COMPRAS";
              return (
                <tr key={it.id} className={it.status === "CANCELADO" ? "opacity-60" : it.status === "ATENDIDO_ESTOQUE" ? "bg-emerald-50/30" : "hover:bg-gray-50"}>
                  <td className="px-3 py-1.5 text-gray-400 align-top">{i + 1}</td>
                  <td className="px-3 py-1.5 align-top">
                    <p className="text-torg-dark font-medium">{it.descricao}</p>
                    {(it.comprimento || it.largura || it.tratamento) && (
                      <p className="text-[10px] text-torg-gray mt-0.5">
                        {it.comprimento && it.largura
                          ? <span className="text-torg-blue-700 font-medium">{it.comprimento} × {it.largura}</span>
                          : <span className="text-torg-blue-700 font-medium">{it.comprimento || it.largura}</span>}
                        {it.tratamento && <span> · {it.tratamento}</span>}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-torg-gray text-xs align-top">{it.material || "—"}</td>
                  <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap align-top">{it.qtd} {it.unidade}</td>
                  <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums whitespace-nowrap align-top">
                    {it.valorTotal ? <span className="font-semibold text-torg-dark">{fmtMoeda(it.valorTotal)}</span> : (it.peso ? Number(it.peso).toFixed(2) : "—")}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap inline-block ${statusItem.className}`}>
                      {statusItem.label}
                    </span>
                    {it.status === "CANCELADO" && it.canceladoMotivo && (
                      <p className="text-[10px] text-torg-gray mt-0.5">Motivo: {it.canceladoMotivo}</p>
                    )}
                    {it.status === "ATENDIDO_ESTOQUE" && (
                      <p className="text-[10px] text-emerald-600 mt-0.5">
                        {it.atendidoEstoqueQtd ? `${Number(it.atendidoEstoqueQtd).toLocaleString("pt-BR")} ${it.unidade}` : ""}
                        {it.atendidoEstoqueObs ? ` · ${it.atendidoEstoqueObs}` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="inline-flex items-center gap-3 justify-end">
                      {podeEditarItem && (
                        <button
                          onClick={() => setModalEditarItem(it)}
                          className="text-xs text-torg-blue hover:text-torg-dark font-medium inline-flex items-center gap-1"
                          title="Editar dados do item"
                        >
                          <Edit2 size={12} /> Editar
                        </button>
                      )}
                      {podeAtenderEstoque && (
                        <button
                          onClick={() => setModalAtenderEstoque(it)}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-medium inline-flex items-center gap-1"
                          title="Marcar como atendido pelo estoque interno"
                        >
                          <Package size={12} /> Estoque
                        </button>
                      )}
                      {podeCancelar && (
                        <button
                          onClick={() => setModalCancelarItem(it)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium inline-flex items-center gap-1"
                        >
                          <XCircle size={12} /> Cancelar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
