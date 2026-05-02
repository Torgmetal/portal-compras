import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PlusCircle, ClipboardList, AlertTriangle } from "lucide-react";

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function MinhasRMs() {
  const user = await requireUser();

  // ADMIN e COMPRAS veem tudo; demais (engenharia, almoxarifado) veem só as suas
  const isAdminOuCompras = ["ADMIN", "COMPRAS"].includes(user.role);
  const where = isAdminOuCompras ? {} : { createdById: user.id };

  const rms = await prisma.rM.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      op: { select: { numero: true, cliente: true } },
      createdBy: { select: { name: true } },
      _count: { select: { itens: true, cotacoes: true } },
    },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            {isAdminOuCompras ? "Todas as RMs" : "Minhas RMs"}
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            Requisições vinculadas a OPs. Cada RM consome verba dos itens da OP.
          </p>
        </div>
        <Link
          href="/rm/nova"
          className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
        >
          <PlusCircle size={18} /> Nova RM
        </Link>
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <ClipboardList size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhuma RM cadastrada</p>
          <p className="text-sm text-torg-gray mt-1 mb-4">
            Crie sua primeira RM escolhendo a OP de origem.
          </p>
          <Link
            href="/rm/nova"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium"
          >
            <PlusCircle size={18} /> Nova RM
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº RM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Itens</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cotações</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitante</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rms.map((rm) => {
                  const s = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;
                  return (
                    <tr key={rm.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link href={`/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                          {rm.numero}
                        </Link>
                      </td>
                      <td className="px-6 py-3 font-mono text-torg-dark">{rm.op?.numero || "—"}</td>
                      <td className="px-6 py-3 text-torg-gray">{rm.op?.cliente || "—"}</td>
                      <td className="px-6 py-3 text-torg-dark max-w-xs truncate">{rm.descricao}</td>
                      <td className="px-6 py-3 text-center text-torg-gray">{rm._count.itens}</td>
                      <td className="px-6 py-3 text-center text-torg-gray">{rm._count.cotacoes}</td>
                      <td className="px-6 py-3 text-torg-gray text-xs">
                        {rm.createdBy?.name}
                        {rm.setor && <span className="text-torg-gray/70"> · {rm.setor}</span>}
                      </td>
                      <td className="px-6 py-3 text-torg-gray">{fmtData(rm.createdAt)}</td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
