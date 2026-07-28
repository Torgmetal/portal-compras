// Lista de OPs DENTRO do Portal de Engenharia (mantém a lateral da Engenharia).
// Só as OPs — nada de proposta/orçamento do Comercial. Clicar abre o detalhe em
// /engenharia/ops/[id] (mesmas abas blindadas, sem sair do portal).
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { fmtOP } from "@/lib/utils";
import { FolderKanban } from "lucide-react";

function calcStatus(op) {
  if (op.status === "CANCELADA") return "CANCELADA";
  if (op.status === "ENCERRADA" || op.dataFimReal) return "ENCERRADA";
  if (op.dataFimPrevista && new Date(op.dataFimPrevista) < new Date()) return "ATRASADA";
  if (op.dataInicio && new Date(op.dataInicio) <= new Date()) return "EM_EXECUCAO";
  return "ABERTA";
}

const STATUS_BADGE = {
  ABERTA: "bg-gray-100 text-gray-700",
  EM_EXECUCAO: "bg-blue-100 text-blue-700",
  ATRASADA: "bg-red-100 text-red-700",
  ENCERRADA: "bg-emerald-100 text-emerald-700",
  CANCELADA: "bg-gray-100 text-gray-400 line-through",
};
const STATUS_LABEL = {
  ABERTA: "aberta", EM_EXECUCAO: "em execução", ATRASADA: "atrasada", ENCERRADA: "encerrada", CANCELADA: "cancelada",
};

export default async function OPsEngenharia() {
  await requireUser();
  const ops = await prisma.oP.findMany({
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, cliente: true, obra: true, status: true, dataInicio: true, dataFimPrevista: true, dataFimReal: true },
    take: 500,
  });

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 text-blue-700"><FolderKanban size={22} /></span>
        <div>
          <h1 className="text-2xl font-bold text-torg-dark">OPs</h1>
          <p className="text-sm text-torg-gray">Ordens de produção — clique pra ver o detalhe (Engenharia, Produção, Expedição…).</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-torg-gray text-[11px] uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2.5 text-left">OP</th>
              <th className="px-4 py-2.5 text-left">Obra</th>
              <th className="px-4 py-2.5 text-left">Cliente</th>
              <th className="px-4 py-2.5 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ops.map((op) => {
              const st = calcStatus(op);
              return (
                <tr key={op.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/engenharia/ops/${op.id}`} className="font-mono font-semibold text-torg-blue hover:underline">{fmtOP(op.numero)}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-torg-dark">{op.obra || "—"}</td>
                  <td className="px-4 py-2.5 text-torg-gray">{op.cliente || "—"}</td>
                  <td className="px-4 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[st]}`}>{STATUS_LABEL[st]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {ops.length === 0 && <p className="px-4 py-8 text-center text-torg-gray text-sm">Nenhuma OP.</p>}
      </div>
    </div>
  );
}
