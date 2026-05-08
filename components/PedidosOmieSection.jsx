"use client";
import { useState } from "react";
import { Truck, ExternalLink, AlertCircle, Copy, Check } from "lucide-react";
import { omiePedidoCompraUrl } from "@/lib/omie-urls";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

// Componente cliente — botao de copiar numero do pedido pra clipboard
function PedidoNumeroCell({ pedido }) {
  const [copiado, setCopiado] = useState(false);
  const numero = pedido.numeroPedido || pedido.codigoPedido || "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(numero);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // fallback se clipboard API nao funcionar
      const ta = document.createElement("textarea");
      ta.value = numero;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }
      catch {}
      document.body.removeChild(ta);
    }
  };

  if (pedido.status !== "CRIADO" || !numero) {
    return <span className="font-mono text-torg-gray">{numero || "—"}</span>;
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="font-mono font-semibold text-torg-blue">{numero}</span>
      <button
        type="button"
        onClick={copiar}
        title="Copiar número"
        className="text-torg-gray hover:text-torg-blue p-1 rounded hover:bg-torg-blue-50 transition-colors"
      >
        {copiado ? <Check size={12} className="text-torg-blue" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

// Recebe lista de pedidos achatada (ja com cotacao/rm em cada pedido pra contexto).
// Cada pedido: { id, numeroPedido, codigoPedido, total, status, faturamentoDireto,
//                fornecedorNome, createdAt, rmNumero, cotacaoId, erroOmie }
export default function PedidosOmieSection({ pedidos }) {
  if (!pedidos || pedidos.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Truck size={18} className="text-torg-blue" />
          <h3 className="text-lg font-semibold text-torg-dark">Pedidos no Omie</h3>
        </div>
        <p className="text-sm text-torg-gray">
          Nenhum pedido foi gerado no Omie ainda pra essa OP. Os pedidos aparecem aqui assim que forem criados pelo Compras.
        </p>
      </div>
    );
  }

  const totalCriados = pedidos.filter((p) => p.status === "CRIADO").reduce((s, p) => s + (p.total || 0), 0);
  const qtdCriados = pedidos.filter((p) => p.status === "CRIADO").length;
  const qtdErros = pedidos.filter((p) => p.status !== "CRIADO").length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Truck size={18} className="text-torg-blue" />
          <h3 className="text-lg font-semibold text-torg-dark">Pedidos no Omie</h3>
          <span className="text-xs bg-torg-blue-50 text-torg-blue px-2 py-0.5 rounded-full font-medium">
            {qtdCriados} criado{qtdCriados !== 1 ? "s" : ""}
          </span>
          {qtdErros > 0 && (
            <span className="text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
              {qtdErros} com erro
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={omiePedidoCompraUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-torg-blue hover:text-torg-blue-700 inline-flex items-center gap-1 font-medium"
          >
            Abrir Omie <ExternalLink size={11} />
          </a>
          <div className="text-right">
            <p className="text-xs text-torg-gray">Total criado</p>
            <p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtMoeda(totalCriados)}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-2 bg-torg-blue-50/40 border-b border-torg-blue-100 text-xs text-torg-dark">
        💡 Clique no <Copy size={11} className="inline mx-1 text-torg-gray" /> ao lado do número pra copiar, depois cole no Omie em <strong>Estoque → Pedido de Compra</strong> pra abrir o pedido específico.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Nº Pedido</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">RM</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pedidos.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <PedidoNumeroCell pedido={p} />
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs text-torg-dark">{p.rmNumero || "—"}</span>
                </td>
                <td className="px-4 py-2.5 text-torg-dark text-xs max-w-[200px] truncate">
                  {p.fornecedorNome}
                </td>
                <td className="px-4 py-2.5 text-right text-torg-dark font-medium tabular-nums">
                  {fmtMoeda(p.total)}
                </td>
                <td className="px-4 py-2.5 text-xs">
                  {p.faturamentoDireto ? (
                    <span className="px-2 py-0.5 bg-torg-orange-50 text-torg-orange-700 rounded-full font-medium">
                      FD
                    </span>
                  ) : (
                    <span className="text-torg-gray">Normal</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-torg-gray text-xs">{fmtData(p.createdAt)}</td>
                <td className="px-4 py-2.5">
                  {p.status === "CRIADO" ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-torg-blue text-white">
                      Criado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-700" title={p.erroOmie || "Erro ao criar"}>
                      <AlertCircle size={12} />
                      Erro
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
