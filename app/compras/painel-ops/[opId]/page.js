import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft, FileText } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";
import MapaCotacaoClient from "./MapaCotacaoClient";
import OPAcoesClient from "./OPAcoesClient";

export const dynamic = "force-dynamic";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const STATUS_RM_BADGE = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

export default async function PainelOPDetalhe({ params }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);

  const op = await prisma.oP.findUnique({
    where: { id: params.opId },
    include: {
      itens: { select: { id: true, valorVerba: true } },
      aditivos: { include: { itens: { select: { id: true, valorVerba: true } } } },
      rms: {
        include: {
          itens: {
            include: {
              opItem: { select: { categoria: true } },
              aditivoItem: { select: { categoria: true } },
            },
            orderBy: { ordem: "asc" },
          },
          cotacoes: {
            include: {
              itens: {
                select: {
                  id: true, rmItemId: true, precoUnit: true, qtdCotada: true,
                  icmsPct: true, ipiPct: true, vencedor: true, observacao: true,
                },
              },
              pedidosOmie: {
                where: { status: "CRIADO" },
                select: { id: true, total: true, faturamentoDireto: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!op) notFound();

  // Verba estimada total (base + aditivos)
  const verbaBase = op.itens.reduce((s, i) => s + i.valorVerba, 0);
  const verbaAditivos = op.aditivos.reduce(
    (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0), 0
  );
  const verbaTotal = verbaBase + verbaAditivos;

  // Total já em pedidos (soma dos PedidoOmie.total criados nessa OP)
  let totalEmPedidos = 0;
  for (const rm of op.rms) {
    for (const cot of rm.cotacoes) {
      for (const ped of cot.pedidosOmie || []) {
        totalEmPedidos += ped.total || 0;
      }
    }
  }
  const saldo = verbaTotal - totalEmPedidos;
  const consumoPct = verbaTotal > 0 ? (totalEmPedidos / verbaTotal) * 100 : 0;

  // Plain object pra Client Component
  const data = JSON.parse(JSON.stringify({
    id: op.id,
    numero: op.numero,
    cliente: op.cliente,
    obra: op.obra,
    descricao: op.descricao,
    verbaTotal,
    rms: op.rms,
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/compras/painel-ops" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pro Painel de OPs
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">{data.numero}</h2>
          <p className="text-torg-dark font-medium mt-1">{data.cliente}</p>
          {data.obra && <p className="text-sm text-torg-gray">{data.obra}</p>}
          {data.descricao && <p className="text-sm text-torg-gray mt-2">{data.descricao}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div>
            <p className="text-xs text-torg-gray">Verba estimada</p>
            <p className="text-2xl font-extrabold text-torg-dark tabular-nums">{fmtMoeda(verbaTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-torg-gray">Já em pedidos</p>
            <p className="text-2xl font-extrabold text-torg-blue tabular-nums">{fmtMoeda(totalEmPedidos)}</p>
            <p className="text-[10px] text-torg-gray mt-0.5">{consumoPct.toFixed(1)}% da verba</p>
          </div>
          <div>
            <p className="text-xs text-torg-gray">Saldo restante</p>
            <p className={`text-2xl font-extrabold tabular-nums ${
              saldo < 0
                ? "text-red-600"
                : consumoPct >= 70
                ? "text-torg-orange-700"
                : "text-torg-dark"
            }`}>
              {fmtMoeda(saldo)}
            </p>
            {saldo < 0 && (
              <p className="text-[10px] text-red-600 mt-0.5 font-medium">⚠ verba estourada</p>
            )}
            {saldo >= 0 && consumoPct >= 70 && (
              <p className="text-[10px] text-torg-orange-700 mt-0.5 font-medium">⚠ acima de 70%</p>
            )}
          </div>
        </div>

        <OPAcoesClient
          opId={op.id}
          numero={op.numero}
          status={op.status}
          qtdRMs={op.rms.length}
          isAdmin={user.role === "ADMIN"}
        />
      </div>

      {/* RMs vinculadas */}
      {data.rms.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-torg-dark">RMs vinculadas ({data.rms.length})</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {data.rms.map((rm) => (
              <li key={rm.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-torg-gray" />
                  <Link href={`/compras/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                    {rm.numero}
                  </Link>
                  <span className="text-sm text-torg-dark">{rm.descricao}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-torg-gray">
                  <span>{rm.itens.length} itens</span>
                  <span>{rm.cotacoes.length} cotações</span>
                  {(() => {
                    const s = STATUS_RM_BADGE[rm.status] || STATUS_RM_BADGE.ABERTA;
                    return (
                      <span className={`px-2 py-0.5 rounded-full font-medium ${s.className}`}>
                        {s.label}
                      </span>
                    );
                  })()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mapa de Cotação */}
      <MapaCotacaoClient op={data} />
    </div>
  );
}
