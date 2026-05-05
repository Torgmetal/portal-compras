import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { FileText, BarChart3, Truck, ClipboardList, AlertTriangle } from "lucide-react";
import RMRowActions from "@/components/RMRowActions";

// Sempre busca dados frescos do banco (sem cache de Server Component)
export const dynamic = "force-dynamic";

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const TIPO_RM_LABELS = {
  ENGENHARIA: "Engenharia",
  INTERNA:    "Interna",
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function PainelCompras({ searchParams }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);
  const verArquivadas = searchParams?.arquivadas === "1";

  const where = verArquivadas
    ? { status: { in: ["PEDIDO_GERADO", "CANCELADA"] } }
    : { status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] } };

  const [rms, totais] = await Promise.all([
    prisma.rM.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        op: { select: { numero: true, cliente: true } },
        createdBy: { select: { name: true } },
        itens: { select: { status: true } },
        _count: { select: { cotacoes: true, itens: true } },
      },
    }),
    prisma.rM.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const statusCount = totais.reduce((acc, t) => {
    acc[t.status] = t._count._all;
    return acc;
  }, {});

  // "Em Cotação" agrega EM_COTACAO + COTADA — ambos estão no processo
  // de cotação (aguardando proposta ou já com proposta antes do pedido).
  const emCotacao = (statusCount.EM_COTACAO || 0) + (statusCount.COTADA || 0);
  // "Total de RMs" considera só ativas (Aberta + Em Cotação + Cotada).
  // RMs com pedido gerado ou canceladas saem da contagem (estão arquivadas).
  const totalAtivas = (statusCount.ABERTA || 0) + emCotacao;

  const cards = [
    { label: "RMs ativas", value: totalAtivas, color: "bg-torg-blue", Icon: FileText },
    { label: "Abertas", value: statusCount.ABERTA || 0, color: "bg-torg-orange", Icon: ClipboardList },
    { label: "Em cotação", value: emCotacao, color: "bg-torg-blue-700", Icon: BarChart3 },
    { label: "Pedido gerado", value: statusCount.PEDIDO_GERADO || 0, color: "bg-torg-dark", Icon: Truck },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Painel de Compras</h2>
          <p className="text-sm text-torg-gray mt-1">Gestão de RMs, Cotações e Pedidos</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/compras"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              !verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Ativas
          </Link>
          <Link
            href="/compras?arquivadas=1"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              verArquivadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Histórico
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
            <div className={`${c.color} p-2.5 rounded-lg`}>
              <c.Icon size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-torg-gray truncate">{c.label}</p>
              <p className="text-xl font-extrabold text-torg-dark tabular-nums">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {verArquivadas ? "Nenhuma RM arquivada" : "Nenhuma RM ativa no momento"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº RM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">OP / Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitante</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Itens</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cot.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rms.map((rm) => {
                  const s = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;
                  const pedidoCount = rm.itens.filter((i) => i.status === "PEDIDO_GERADO").length;
                  const pendentes = rm.itens.filter((i) => i.status === "PENDENTE").length;
                  return (
                    <tr key={rm.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link href={`/compras/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                          {rm.numero}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-xs text-torg-gray">{TIPO_RM_LABELS[rm.tipoRM]}</td>
                      <td className="px-6 py-3 text-torg-dark">
                        {rm.op ? (
                          <>
                            <span className="font-mono text-xs">{rm.op.numero}</span>
                            <span className="text-xs text-torg-gray block">{rm.op.cliente}</span>
                          </>
                        ) : (
                          <span className="text-torg-gray text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-torg-dark max-w-xs truncate">{rm.descricao}</td>
                      <td className="px-6 py-3 text-torg-gray text-xs">
                        {rm.createdBy?.name}
                        {rm.setor && <span className="block text-[10px]">{rm.setor}</span>}
                      </td>
                      <td className="px-6 py-3 text-center text-xs">
                        {pedidoCount > 0 ? (
                          <span>
                            <strong>{pedidoCount}</strong> / {rm._count.itens}
                            {pendentes > 0 && (
                              <AlertTriangle size={12} className="inline ml-1 text-torg-orange-700" />
                            )}
                          </span>
                        ) : (
                          rm._count.itens
                        )}
                      </td>
                      <td className="px-6 py-3 text-center text-torg-gray">{rm._count.cotacoes}</td>
                      <td className="px-6 py-3 text-torg-gray text-xs">{fmtData(rm.createdAt)}</td>
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
