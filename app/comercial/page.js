import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PlusCircle, FolderKanban, Activity, AlertTriangle, DollarSign } from "lucide-react";

// Sempre busca dados frescos do banco
export const dynamic = "force-dynamic";


const STATUS_LABELS = {
  ABERTA: { label: "Aberta", className: "bg-torg-blue-50 text-torg-blue" },
  EM_EXECUCAO: { label: "Em execução", className: "bg-torg-orange-50 text-torg-orange-700" },
  ENCERRADA: { label: "Encerrada", className: "bg-gray-100 text-gray-600" },
  ATRASADA: { label: "Atrasada", className: "bg-red-50 text-red-700" },
  CANCELADA: { label: "Cancelada", className: "bg-gray-100 text-gray-500" },
};

function calcStatus(op) {
  if (op.status === "CANCELADA") return "CANCELADA";
  if (op.status === "ENCERRADA" || op.dataFimReal) return "ENCERRADA";
  if (op.dataFimPrevista && new Date(op.dataFimPrevista) < new Date()) return "ATRASADA";
  if (op.dataInicio && new Date(op.dataInicio) <= new Date()) return "EM_EXECUCAO";
  return "ABERTA";
}

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export default async function ComercialHome() {
  await requireRole(["ADMIN", "COMERCIAL"]);

  const ops = await prisma.oP.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      itens: { select: { valorVerba: true } },
      aditivos: { include: { itens: { select: { valorVerba: true } } } },
      _count: { select: { rms: true } },
    },
  });

  const opsComTotais = ops.map((op) => {
    const verbaBase = op.itens.reduce((s, i) => s + i.valorVerba, 0);
    const verbaAditivos = op.aditivos.reduce(
      (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0),
      0
    );
    return {
      ...op,
      verbaTotal: verbaBase + verbaAditivos,
      statusCalc: calcStatus(op),
    };
  });

  const kpis = opsComTotais.reduce(
    (acc, op) => {
      acc.total += 1;
      if (op.statusCalc === "EM_EXECUCAO") acc.emExecucao += 1;
      if (op.statusCalc === "ATRASADA") acc.atrasadas += 1;
      if (op.statusCalc !== "ENCERRADA" && op.statusCalc !== "CANCELADA") {
        acc.verbaAtiva += op.verbaTotal;
      }
      return acc;
    },
    { total: 0, emExecucao: 0, atrasadas: 0, verbaAtiva: 0 }
  );

  const cards = [
    { label: "Total OPs",    value: kpis.total,                 color: "bg-torg-blue",     Icon: FolderKanban },
    { label: "Em execução",  value: kpis.emExecucao,            color: "bg-torg-orange",   Icon: Activity },
    { label: "Atrasadas",    value: kpis.atrasadas,             color: "bg-red-500",       Icon: AlertTriangle },
    { label: "Verba ativa",  value: fmtMoeda(kpis.verbaAtiva),  color: "bg-torg-dark",     Icon: DollarSign },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Ordens de Produção</h2>
          <p className="text-sm text-torg-gray mt-1">
            Cadastro, revisões e aditivos de cada contrato.
          </p>
        </div>
        <Link
          href="/comercial/nova"
          className="px-4 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium flex items-center gap-2"
        >
          <PlusCircle size={18} /> Nova OP
        </Link>
      </div>

      {opsComTotais.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {cards.map((c) => (
            <div key={c.label} className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
              <div className={`${c.color} p-2.5 rounded-lg`}>
                <c.Icon size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-torg-gray truncate">{c.label}</p>
                <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{c.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {opsComTotais.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FolderKanban size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhuma OP cadastrada</p>
          <p className="text-sm text-torg-gray mt-1 mb-4">
            Cadastre a primeira OP pra começar.
          </p>
          <Link
            href="/comercial/nova"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium"
          >
            <PlusCircle size={18} /> Criar primeira OP
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nº OP</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obra</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Início</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fim previsto</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Verba</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">RMs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {opsComTotais.map((op) => {
                  const s = STATUS_LABELS[op.statusCalc] || STATUS_LABELS.ABERTA;
                  return (
                    <tr key={op.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link href={`/comercial/${op.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                          {op.numero}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-torg-dark">{op.cliente}</td>
                      <td className="px-6 py-3 text-torg-gray">{op.obra || "—"}</td>
                      <td className="px-6 py-3 text-torg-gray">{fmtData(op.dataInicio)}</td>
                      <td className="px-6 py-3 text-torg-gray">{fmtData(op.dataFimPrevista)}</td>
                      <td className="px-6 py-3 text-right text-torg-dark font-medium tabular-nums">{fmtMoeda(op.verbaTotal)}</td>
                      <td className="px-6 py-3 text-center text-torg-gray">{op._count.rms}</td>
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
