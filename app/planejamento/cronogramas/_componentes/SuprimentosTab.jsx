"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2, Package, ShoppingCart } from "lucide-react";
import { fmtData, fmtPeso, fmtQtd } from "../_lib/formatos";
import { STATUS_LABEL } from "../_lib/rotulos";

export function SuprimentosTab({ cronogramaId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    setLoading(true);
    setErro("");
    fetch(`/api/planejamento/cronogramas/${cronogramaId}/suprimentos`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Erro ao carregar");
        return r.json();
      })
      .then(setData)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, [cronogramaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-torg-blue" />
        <span className="ml-2 text-sm text-torg-gray">Carregando suprimentos...</span>
      </div>
    );
  }

  if (erro) {
    return <div className="py-6 text-center text-sm text-red-600">{erro}</div>;
  }

  if (!data?.opVinculada) {
    return (
      <div className="py-8 text-center">
        <Package size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">OP não vinculada a este cronograma.</p>
        <p className="text-xs text-torg-gray mt-1">Sincronize o SharePoint para vincular automaticamente.</p>
      </div>
    );
  }

  if (data.data.length === 0) {
    return (
      <div className="py-8 text-center">
        <Package size={28} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-torg-gray">Nenhuma RM encontrada para esta OP.</p>
      </div>
    );
  }

  const items = data.data.filter((d) => {
    if (filtro === "todos") return true;
    if (filtro === "pendente") return d.qtdPedida === 0;
    if (filtro === "pedido") return d.qtdPedida > 0 && !d.recebido;
    if (filtro === "recebido") return d.recebido;
    return true;
  });

  const totais = data.pesoTotais;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <KpiCard label="Itens RM" value={data.totalItens} icon={FileText} color="text-torg-blue" />
        <KpiCard label="Com pedido" value={data.totalComPedido} icon={ShoppingCart} color="text-amber-600" />
        <KpiCard label="Recebidos" value={data.totalRecebido} icon={CheckCircle2} color="text-emerald-600" />
        <KpiCard label="A comprar" value={`${fmtPeso(totais.aComprar)} kg`} icon={AlertTriangle} color="text-red-600" />
        <KpiCard label="A receber" value={`${fmtPeso(totais.aReceber)} kg`} icon={Clock} color="text-amber-600" />
      </div>

      <div className="flex gap-1.5">
        {[
          { key: "todos", label: "Todos" },
          { key: "pendente", label: "Sem pedido" },
          { key: "pedido", label: "Aguardando entrega" },
          { key: "recebido", label: "Recebidos" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-colors ${
              filtro === f.key
                ? "bg-torg-blue text-white border-torg-blue"
                : "bg-white text-torg-gray border-gray-200 hover:border-torg-blue"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50/60 text-torg-gray">
              <th className="text-left px-2 py-1.5 font-medium">RM</th>
              <th className="text-left px-2 py-1.5 font-medium">Descrição</th>
              <th className="text-right px-2 py-1.5 font-medium">Solicitado</th>
              <th className="text-right px-2 py-1.5 font-medium">Pedido</th>
              <th className="text-right px-2 py-1.5 font-medium">Recebido</th>
              <th className="text-left px-2 py-1.5 font-medium">Status</th>
              <th className="text-left px-2 py-1.5 font-medium">Fornecedor</th>
              <th className="text-left px-2 py-1.5 font-medium">Pedido Nº</th>
              <th className="text-left px-2 py-1.5 font-medium">NF</th>
              <th className="text-left px-2 py-1.5 font-medium">Prazo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <SuprimentoRow key={item.id} item={item} />
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="text-xs text-torg-gray italic py-4 text-center">Nenhum item neste filtro.</p>
        )}
      </div>
    </div>
  );
}

export function KpiCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Icon size={13} className={color} />
        <span className="text-[10px] text-torg-gray">{label}</span>
      </div>
      <p className={`text-sm font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

export function SuprimentoRow({ item }) {
  const st = STATUS_LABEL[item.status] || STATUS_LABEL.PENDENTE;
  const atrasado = item.prazoEntrega && new Date(item.prazoEntrega) < new Date() && !item.recebido;

  return (
    <tr className={`${item.recebido ? "bg-emerald-50/30" : atrasado ? "bg-red-50/30" : ""} hover:bg-gray-50/50`}>
      <td className="px-2 py-1.5 font-mono text-torg-blue whitespace-nowrap">{item.rmNumero}</td>
      <td className="px-2 py-1.5 max-w-xs truncate" title={item.descricao}>{item.descricao}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtQtd(item.qtdSolicitada)} {item.unidade}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        {item.qtdPedida > 0 ? `${fmtQtd(item.qtdPedida)} ${item.unidade}` : <span className="text-red-500">—</span>}
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        {item.qtdRecebida > 0 ? (
          <span className={item.recebido ? "text-emerald-600 font-medium" : "text-amber-600"}>
            {fmtQtd(item.qtdRecebida)} {item.unidade}
          </span>
        ) : "—"}
      </td>
      <td className="px-2 py-1.5">
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${st.color}`}>{st.label}</span>
      </td>
      <td className="px-2 py-1.5 truncate max-w-[120px]" title={item.fornecedor}>{item.fornecedor || "—"}</td>
      <td className="px-2 py-1.5 font-mono whitespace-nowrap">{item.numeroPedido || "—"}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">{item.nfs?.length > 0 ? item.nfs.join(", ") : "—"}</td>
      <td className="px-2 py-1.5 whitespace-nowrap">
        {item.prazoEntrega ? (
          <span className={atrasado ? "text-red-600 font-medium" : ""}>
            {fmtData(item.prazoEntrega)}
          </span>
        ) : "—"}
      </td>
    </tr>
  );
}
