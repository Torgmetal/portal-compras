import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ArrowLeft, AlertTriangle, ClipboardList } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const THRESHOLD = 0.05;

export default async function RMDetail({ params }) {
  await requireUser();

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      op: { select: { id: true, numero: true, cliente: true, obra: true } },
      createdBy: { select: { name: true, email: true } },
      itens: {
        orderBy: { ordem: "asc" },
        include: {
          opItem: { select: { categoria: true, qtdContratada: true, unidade: true } },
          aditivoItem: { select: { categoria: true, qtdContratada: true, unidade: true } },
        },
      },
      _count: { select: { cotacoes: true } },
    },
  });
  if (!rm) notFound();

  const status = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;

  // Calcula divergências por linha
  const itensComDiff = rm.itens.map((it) => {
    const ref = it.opItem || it.aditivoItem;
    let diffPct = null;
    if (ref?.qtdContratada && it.qtd) {
      diffPct = ((it.qtd - ref.qtdContratada) / ref.qtdContratada) * 100;
    }
    return { ...it, ref, diffPct };
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/rm" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pra lista
      </Link>

      {/* Cabeçalho */}
      <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">{rm.numero}</h2>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${status.className}`}>{status.label}</span>
            </div>
            <p className="text-torg-dark font-medium mt-1">{rm.descricao}</p>
            {rm.observacao && <p className="text-sm text-torg-gray mt-1">{rm.observacao}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="text-torg-gray">OP de origem</p>
            <p className="text-lg font-bold text-torg-blue font-mono">{rm.op?.numero}</p>
            <p className="text-xs text-torg-gray">{rm.op?.cliente}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100 text-sm">
          <div>
            <p className="text-torg-gray text-xs">Tipo</p>
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
            <p className="text-torg-gray text-xs">Cotações</p>
            <p className="text-torg-dark font-medium">{rm._count.cotacoes}</p>
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Itens da requisição ({rm.itens.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Estimativa OP</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd RM</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Divergência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {itensComDiff.map((it) => {
                const cat = it.ref?.categoria || it.opItem?.categoria || it.aditivoItem?.categoria;
                const divergente = it.diffPct != null && Math.abs(it.diffPct / 100) > THRESHOLD;
                return (
                  <tr key={it.id} className={divergente ? "bg-torg-orange-50/30" : ""}>
                    <td className="px-4 py-2 text-xs text-torg-gray">{cat ? labelCategoria(cat) : "—"}</td>
                    <td className="px-4 py-2 text-torg-dark font-medium">{it.descricao}</td>
                    <td className="px-4 py-2 text-right text-torg-gray text-xs tabular-nums">
                      {it.ref?.qtdContratada
                        ? `${it.ref.qtdContratada} ${it.ref.unidade || ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums">
                      {it.qtd} {it.unidade}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {divergente ? (
                        <span className="inline-flex items-center gap-1 text-torg-orange-700 font-medium">
                          <AlertTriangle size={12} />
                          {it.diffPct > 0 ? "+" : ""}{it.diffPct.toFixed(1)}%
                        </span>
                      ) : it.diffPct != null ? (
                        <span className="text-torg-gray">{it.diffPct.toFixed(1)}%</span>
                      ) : (
                        <span className="text-torg-gray">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-4 text-sm text-torg-dark">
        <p className="font-medium">Próximos passos</p>
        <p className="text-torg-gray text-xs mt-1">
          A RM agora vai aparecer pro time de Compras, que cuida da cotação com fornecedores e geração do pedido no Omie.
          Você será avisado quando o status mudar.
        </p>
      </div>
    </div>
  );
}
