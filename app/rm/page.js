import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PlusCircle, ClipboardList, AlertTriangle } from "lucide-react";
import RMRowActions from "@/components/RMRowActions";

// Sempre busca dados frescos do banco
export const dynamic = "force-dynamic";


const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const TIPO_RM_LABELS = {
  ENGENHARIA: { label: "Engenharia", className: "bg-torg-blue-50 text-torg-blue" },
  INTERNA:    { label: "Interna",    className: "bg-gray-100 text-gray-700" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function MinhasRMs({ searchParams }) {
  const user = await requireUser();
  const verArquivadas = searchParams?.arquivadas === "1";

  // ADMIN e COMPRAS veem tudo; demais (engenharia, almoxarifado) veem só as suas
  const isAdminOuCompras = ["ADMIN", "COMPRAS"].includes(user.role);
  const baseWhere = isAdminOuCompras ? {} : { createdById: user.id };
  const statusFilter = verArquivadas
    ? { status: { in: ["PEDIDO_GERADO", "CANCELADA"] } }
    : { status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] } };

  const rms = await prisma.rM.findMany({
    where: { ...baseWhere, ...statusFilter },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      op: { select: { numero: true, cliente: true, obra: true } },
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
            {verArquivadas
              ? "RMs concluídas (com pedido gerado) e canceladas."
              : "Requisições em andamento. Quando viram pedido aparecem no histórico."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            <Link
              href="/rm"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                !verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
              }`}
            >
              Ativas
            </Link>
            <Link
              href="/rm?arquivadas=1"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
              }`}
            >
              Histórico
            </Link>
          </div>
          <Link
            href="/rm/nova"
            className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
          >
            <PlusCircle size={18} /> Nova RM
          </Link>
        </div>
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <ClipboardList size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {verArquivadas ? "Nenhuma RM no histórico ainda" : "Nenhuma RM ativa"}
          </p>
          {!verArquivadas && (
            <>
              <p className="text-sm text-torg-gray mt-1 mb-4">
                Crie sua primeira RM escolhendo a OP de origem.
              </p>
              <Link
                href="/rm/nova"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium"
              >
                <PlusCircle size={18} /> Nova RM
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº RM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">OP / Obra</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Itens</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cotações</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitante</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rms.map((rm) => {
                  const s = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;
                  const t = TIPO_RM_LABELS[rm.tipoRM] || TIPO_RM_LABELS.ENGENHARIA;
                  return (
                    <tr key={rm.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link href={`/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                          {rm.numero}
                        </Link>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.className}`}>
                          {t.label}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-torg-dark">
                        {rm.op ? (
                          <>
                            <span className="font-mono">{rm.op.numero}</span>
                            <span className="text-xs text-torg-gray block">{rm.op.cliente}</span>
                          </>
                        ) : (
                          <span className="text-torg-gray text-xs">—</span>
                        )}
                      </td>
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
                      <td className="px-3 py-3 text-right">
                        <RMRowActions
                          rmId={rm.id}
                          numero={rm.numero}
                          status={rm.status}
                          isAdmin={user.role === "ADMIN"}
                        />
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
