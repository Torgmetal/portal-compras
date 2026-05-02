import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft, FileText } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";
import MapaCotacaoClient from "./MapaCotacaoClient";

export const dynamic = "force-dynamic";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export default async function PainelOPDetalhe({ params }) {
  await requireRole(["ADMIN", "COMPRAS"]);

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
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!op) notFound();

  // Verba total
  const verbaBase = op.itens.reduce((s, i) => s + i.valorVerba, 0);
  const verbaAditivos = op.aditivos.reduce(
    (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0), 0
  );
  const verbaTotal = verbaBase + verbaAditivos;

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

      <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">{data.numero}</h2>
            <p className="text-torg-dark font-medium mt-1">{data.cliente}</p>
            {data.obra && <p className="text-sm text-torg-gray">{data.obra}</p>}
            {data.descricao && <p className="text-sm text-torg-gray mt-2">{data.descricao}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs text-torg-gray">Verba contratada</p>
            <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(verbaTotal)}</p>
          </div>
        </div>
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
                  <span className="px-2 py-0.5 rounded-full bg-gray-100">{rm.status}</span>
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
