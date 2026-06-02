"use client";
import { useState, useEffect } from "react";
import { Loader2, DollarSign, Package, Truck, FileText, AlertCircle, TrendingUp } from "lucide-react";

const fmtMoeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

/**
 * Painel de controle financeiro da OP.
 * Mostra: pedidos Omie (Torg + FD) + itens atendidos por estoque (custo estimado).
 * O custo de estoque NAO subtrai do contrato — e apenas informativo.
 *
 * Props:
 *   opId: string — ID da OP
 */
export default function ControleFinanceiroOP({ opId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    setLoading(true);
    setErro("");
    fetch(`/api/op/${opId}/controle-financeiro`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok || !json.success) throw new Error(json.error || "Erro");
        return json.data;
      })
      .then(setData)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [opId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <Loader2 size={20} className="mx-auto animate-spin text-torg-blue mb-2" />
        <p className="text-sm text-torg-gray">Carregando controle financeiro...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
        <div className="flex items-start gap-2 text-red-600 text-sm">
          <AlertCircle size={16} className="mt-0.5" />
          <div>
            <p className="font-medium">Erro ao carregar controle financeiro</p>
            <p className="text-xs mt-1">{erro}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { pedidos, estoque, custoTotal } = data;
  const temEstoque = estoque.itens.length > 0;
  const temPedidos = pedidos.torg.lista.length > 0 || pedidos.fd.lista.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-torg-dark inline-flex items-center gap-2">
          <TrendingUp size={18} className="text-torg-blue" />
          Controle Financeiro
        </h3>
        <p className="text-xs text-torg-gray mt-1">
          Visao consolidada de custos: pedidos de compra + material de estoque. O custo de estoque e estimado (CMC Omie) e nao subtrai do contrato.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4">
        <KpiCard
          label="Pedidos Torg"
          valor={pedidos.torg.total}
          icon={Truck}
          color="text-torg-blue"
          bg="bg-torg-blue-50"
        />
        <KpiCard
          label="Pedidos FD"
          valor={pedidos.fd.total}
          icon={FileText}
          color="text-torg-orange-700"
          bg="bg-torg-orange-50"
        />
        <KpiCard
          label="Estoque (estimado)"
          valor={estoque.total}
          icon={Package}
          color="text-emerald-700"
          bg="bg-emerald-50"
        />
        <KpiCard
          label="Custo total"
          valor={custoTotal}
          icon={DollarSign}
          color="text-torg-dark"
          bg="bg-gray-50"
          destaque
        />
      </div>

      {/* Itens de estoque */}
      {temEstoque && (
        <div className="border-t border-gray-100">
          <div className="px-6 py-3 bg-emerald-50/40">
            <h4 className="text-sm font-semibold text-emerald-800 inline-flex items-center gap-1.5">
              <Package size={14} />
              Material de Estoque ({estoque.itens.length} {estoque.itens.length === 1 ? "item" : "itens"})
              <span className="font-normal text-xs text-emerald-600 ml-2">
                Total estimado: {fmtMoeda(estoque.total)}
              </span>
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">RM</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descricao</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preco Unit.</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {estoque.itens.map((it) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-torg-blue whitespace-nowrap">{it.rmNumero}</td>
                    <td className="px-4 py-2 text-torg-dark max-w-xs truncate" title={it.descricao}>{it.descricao}</td>
                    <td className="px-4 py-2 text-torg-gray text-xs">{it.material || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
                      {Number(it.quantidade).toLocaleString("pt-BR")} {it.unidade}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-torg-gray">
                      {it.precoUnit > 0 ? fmtMoeda(it.precoUnit) : <span className="text-amber-600 text-xs">sem preco</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-700">
                      {it.total > 0 ? fmtMoeda(it.total) : "—"}
                    </td>
                    <td className="px-4 py-2 text-torg-gray text-xs whitespace-nowrap">{fmtData(it.data)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50/60 font-semibold">
                  <td colSpan={5} className="px-4 py-2 text-right text-xs text-emerald-800">Total estimado</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-800">{fmtMoeda(estoque.total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Pedidos Omie */}
      {temPedidos && (
        <div className="border-t border-gray-100">
          <div className="px-6 py-3 bg-torg-blue-50/40">
            <h4 className="text-sm font-semibold text-torg-blue inline-flex items-center gap-1.5">
              <Truck size={14} />
              Pedidos de Compra ({pedidos.torg.lista.length + pedidos.fd.lista.length})
              <span className="font-normal text-xs text-torg-gray ml-2">
                Total: {fmtMoeda(pedidos.total)}
              </span>
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fornecedor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pedido</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">NF</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...pedidos.torg.lista, ...pedidos.fd.lista].map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-torg-dark font-medium truncate max-w-[200px]">{p.fornecedorNome}</td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      {p.numeroPedido ? `#${p.numeroPedido}` : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                        p.faturamentoDireto ? "bg-amber-100 text-amber-800" : "bg-torg-blue-50 text-torg-blue"
                      }`}>
                        {p.faturamentoDireto ? "FD" : "Torg"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-torg-dark">{fmtMoeda(p.total)}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray whitespace-nowrap">{p.nfNumero || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${
                        p.statusEntrega === "RECEBIDO"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}>
                        {p.statusEntrega === "RECEBIDO" ? "Recebido" : "Aguardando"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-torg-gray text-xs whitespace-nowrap">{fmtData(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-torg-blue-50/40 font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right text-xs text-torg-blue">Total pedidos</td>
                  <td className="px-4 py-2 text-right tabular-nums text-torg-blue">{fmtMoeda(pedidos.total)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!temEstoque && !temPedidos && (
        <div className="px-6 py-8 text-center text-sm text-torg-gray">
          <Package size={32} className="mx-auto text-gray-300 mb-2" />
          Nenhum pedido ou material de estoque registrado nesta OP.
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, valor, icon: Icon, color, bg, destaque }) {
  return (
    <div className={`rounded-lg border ${destaque ? "border-torg-dark/20 ring-1 ring-torg-dark/10" : "border-gray-100"} p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`p-1 rounded ${bg}`}>
          <Icon size={12} className={color} />
        </div>
        <span className="text-[10px] text-torg-gray uppercase font-medium tracking-wide">{label}</span>
      </div>
      <p className={`text-lg font-extrabold tabular-nums ${destaque ? "text-torg-dark" : color}`}>
        {fmtMoeda(valor)}
      </p>
    </div>
  );
}
