"use client";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { fmt } from "@/lib/utils";
import Badge from "@/components/Badge";
import { FileText, PlusCircle, BarChart3, Truck, Eye } from "lucide-react";

export default function Dashboard() {
  const { rms, loaded } = useStore();
  const router = useRouter();

  if (!loaded) return <div className="p-12 text-center text-gray-400">Carregando...</div>;

  const totais = {
    total: rms.length,
    aberta: rms.filter((r) => r.status === "Aberta").length,
    cotacao: rms.filter((r) => r.status === "Em Cotação" || r.status === "Cotada").length,
    pedido: rms.filter((r) => r.status === "Pedido Gerado").length,
  };

  const cards = [
    { label: "Total de RMs", value: totais.total, color: "bg-blue-500", Icon: FileText },
    { label: "Abertas", value: totais.aberta, color: "bg-yellow-500", Icon: PlusCircle },
    { label: "Em Cotação", value: totais.cotacao, color: "bg-purple-500", Icon: BarChart3 },
    { label: "Pedidos Gerados", value: totais.pedido, color: "bg-emerald-500", Icon: Truck },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Painel de Compras</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
            <div className={`${c.color} p-3 rounded-lg`}>
              <c.Icon size={28} className="text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{c.label}</p>
              <p className="text-2xl font-bold text-gray-800">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 text-lg">Nenhuma RM cadastrada ainda</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Clique em &quot;Nova RM&quot; no menu para começar</p>
          <button
            onClick={() => router.push("/nova-rm")}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium inline-flex items-center gap-2"
          >
            <PlusCircle size={18} /> Criar Primeira RM
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800">Últimas Requisições</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº RM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cotações</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rms.map((rm) => (
                  <tr
                    key={rm.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => router.push(`/rm/${rm.id}`)}
                  >
                    <td className="px-6 py-4 font-mono font-semibold text-blue-600">RM-{rm.numero}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          rm.tipo === "Material"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-teal-100 text-teal-700"
                        }`}
                      >
                        {rm.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 max-w-xs truncate">{rm.descricao}</td>
                    <td className="px-6 py-4 text-gray-500">{rm.data}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{rm.cotacoes?.length || 0}</td>
                    <td className="px-6 py-4">
                      <Badge status={rm.status} />
                    </td>
                    <td className="px-6 py-4">
                      <button
                        className="text-blue-600 hover:text-blue-800"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/rm/${rm.id}`);
                        }}
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
