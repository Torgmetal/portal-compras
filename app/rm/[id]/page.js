import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";

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

export default async function RMDetail({ params }) {
  await requireUser();

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      createdBy: { select: { name: true, email: true } },
      itens: { orderBy: { ordem: "asc" } },
      _count: { select: { cotacoes: true } },
    },
  });
  if (!rm) notFound();

  const status = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;
  const tipoRM = TIPO_RM_LABELS[rm.tipoRM] || TIPO_RM_LABELS.ENGENHARIA;
  const pesoTotal = rm.itens.reduce((s, it) => s + (it.peso || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/rm" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pra lista
      </Link>

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">{rm.numero}</h2>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${tipoRM.className}`}>{tipoRM.label}</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>{status.label}</span>
            </div>
            <p className="text-torg-dark font-medium mt-1">{rm.descricao}</p>
            {rm.observacao && <p className="text-sm text-torg-gray mt-1">{rm.observacao}</p>}
          </div>
          {rm.op && (
            <div className="text-right text-sm">
              <p className="text-torg-gray">OP de origem</p>
              <p className="text-lg font-bold text-torg-blue font-mono">{rm.op.numero}</p>
              <p className="text-xs text-torg-gray">{rm.op.cliente}{rm.op.obra ? ` — ${rm.op.obra}` : ""}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
          <div>
            <p className="text-torg-gray text-xs">Tipo de material</p>
            <p className="text-torg-dark font-medium">{rm.tipo}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Solicitante</p>
            <p className="text-torg-dark font-medium">{rm.createdBy?.name}</p>
            {rm.setor && <p className="text-torg-gray text-xs">{rm.setor}</p>}
          </div>
          <div>
            <p className="text-torg-gray text-xs">Data</p>
            <p className="text-torg-dark font-medium">{fmtData(rm.createdAt)}</p>
          </div>
          <div>
            <p className="text-torg-gray text-xs">Itens / Peso</p>
            <p className="text-torg-dark font-medium">
              {rm.itens.length}
              {pesoTotal > 0 && <span className="text-torg-gray"> · {pesoTotal.toFixed(2)} kg</span>}
            </p>
          </div>
        </div>

        {rm.tipoRM === "ENGENHARIA" && rm.categoriasOP?.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-torg-gray mb-2">Cobre as categorias do escopo</p>
            <div className="flex flex-wrap gap-2">
              {rm.categoriasOP.map((cat) => (
                <span key={cat} className="text-xs px-2 py-1 rounded-full bg-torg-blue text-white font-medium">
                  {labelCategoria(cat)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Itens da requisição ({rm.itens.length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-8">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Cód. Omie</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unid.</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Comp.</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Peso (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rm.itens.map((it, i) => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-1.5 text-torg-dark font-medium">{it.descricao}</td>
                  <td className="px-3 py-1.5 text-torg-gray text-xs font-mono">{it.codigo || "—"}</td>
                  <td className="px-3 py-1.5 text-torg-gray text-xs">{it.material || "—"}</td>
                  <td className="px-3 py-1.5 text-right text-torg-gray tabular-nums">{it.qtd}</td>
                  <td className="px-3 py-1.5 text-torg-gray">{it.unidade}</td>
                  <td className="px-3 py-1.5 text-torg-gray text-xs">{it.comprimento || "—"}</td>
                  <td className="px-3 py-1.5 text-right text-torg-dark tabular-nums">
                    {it.peso ? Number(it.peso).toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-4 text-sm text-torg-dark">
        <p className="font-medium">Próximos passos</p>
        <p className="text-torg-gray text-xs mt-1">
          A RM agora vai aparecer pro time de Compras pra cotação com fornecedores e geração do pedido no Omie.
        </p>
      </div>
    </div>
  );
}
