import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { FileText, BarChart3, Truck, ClipboardList } from "lucide-react";
import RMsTabelaSeletor from "./RMsTabelaSeletor";

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
        itens: {
          orderBy: { ordem: "asc" },
          select: { id: true, descricao: true, status: true, qtd: true, unidade: true, peso: true },
        },
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
        <RMsTabelaSeletor
          rms={JSON.parse(JSON.stringify(rms))}
          isAdmin={user.role === "ADMIN"}
        />
      )}
    </div>
  );
}
