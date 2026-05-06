import Link from "next/link";
import { Truck, ExternalLink, AlertCircle } from "lucide-react";
import { omiePedidoCompraUrl, omiePedidoCompraSearchUrl } from "@/lib/omie-urls";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

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
        <div className="flex items-center gap-2">
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
        <div className="text-right">
          <p className="text-xs text-torg-gray">Total criado</p>
          <p className="text-lg font-extrabold text-torg-dark tabular-nums">{fmtMoeda(totalCriados)}</p>
        </div>
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
            {pedidos.map((p) => {
              const url = omiePedidoCompraUrl(p.codigoPedido) || omiePedidoCompraSearchUrl(p.numeroPedido);
              const podeAbrir = p.status === "CRIADO" && url;
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    {podeAbrir ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir no Omie"
                        className="inline-flex items-center gap-1 font-mono font-semibold text-torg-blue hover:text-torg-blue-700 hover:underline"
                      >
                        {p.numeroPedido || p.codigoPedido}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="font-mono text-torg-gray">{p.numeroPedido || "—"}</span>
                    )}
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
