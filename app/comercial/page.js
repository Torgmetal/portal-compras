import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtOP } from "@/lib/utils";
import { requireRole } from "@/lib/session";
import { PlusCircle, FolderKanban } from "lucide-react";
import OPRowActions from "./OPRowActions";

// Sempre busca dados frescos do banco


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

export default async function ComercialHome({ searchParams }) {
  const user = await requireRole(["ADMIN", "COMERCIAL"]);
  const verFinalizadas = searchParams?.finalizadas === "1";

  // Duas queries paralelas:
  // 1. Contagem (leve): busca todas pra calcular os totais das abas Ativas/Finalizadas
  // 2. Tabela (completo, filtrado + paginado): só as OPs da aba atual
  const whereTabela = verFinalizadas
    ? { OR: [{ status: { in: ["ENCERRADA", "CANCELADA"] } }, { dataFimReal: { not: null } }] }
    : { status: { notIn: ["ENCERRADA", "CANCELADA"] }, dataFimReal: null };

  const [opsKpiRaw, opsTabelaRaw] = await Promise.all([
    // Query leve: apenas campos necessários para o cálculo de status
    prisma.oP.findMany({
      select: {
        id: true,
        status: true,
        dataInicio: true,
        dataFimPrevista: true,
        dataFimReal: true,
      },
    }),
    // Query completa: filtrada pela aba atual, máx 200 OPs
    prisma.oP.findMany({
      where: whereTabela,
      include: {
        itens: { select: { valorVerba: true } },
        aditivos: { include: { itens: { select: { valorVerba: true } } } },
        _count: { select: { rms: true } },
        // Medição mais recente (nº do pedido de venda no Omie) — exibida na tabela
        medicoes: { select: { numeroPedidoOmie: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 200,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Pendências de assinatura: OPs geradas de propostas de serviço ainda não
  // assinadas pelo cliente (chip na lista; some quando o cliente aprova).
  const propostasPend = await prisma.orcamentoServico.findMany({
    where: { opCriadaId: { not: null }, aceitoEm: null },
    select: { opCriadaId: true },
  });
  const opsAguardandoAssinatura = new Set(propostasPend.map((p) => p.opCriadaId));

  // Status calculado sobre todas as OPs (query leve) — alimenta as contagens das abas
  const opsKpiComStatus = opsKpiRaw.map((op) => ({ ...op, statusCalc: calcStatus(op) }));

  const totalAtivas = opsKpiComStatus.filter(
    (op) => op.statusCalc !== "ENCERRADA" && op.statusCalc !== "CANCELADA"
  ).length;
  const totalFinalizadas = opsKpiComStatus.length - totalAtivas;

  // Tabela: enriquece os dados filtrados e ordena numericamente
  const opsComTotais = opsTabelaRaw
    .map((op) => {
      const verbaBase = op.itens.reduce((s, i) => s + i.valorVerba, 0);
      const verbaAditivos = op.aditivos.reduce(
        (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0),
        0
      );
      return { ...op, verbaTotal: verbaBase + verbaAditivos, statusCalc: calcStatus(op) };
    })
    // Nº da OP decrescente — ordena pelo número embutido (robusto a formatos com
    // prefixo/espaços, ex.: "OP - 096"); desempate por localeCompare numérico.
    .sort((a, b) => {
      const n = (s) => { const m = String(s || "").match(/\d+/); return m ? parseInt(m[0], 10) : -1; };
      return n(b.numero) - n(a.numero) || String(b.numero || "").localeCompare(String(a.numero || ""), undefined, { numeric: true, sensitivity: "base" });
    });

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Ordens de Produção</h2>
          <p className="text-sm text-torg-gray mt-1">
            {verFinalizadas
              ? "OPs encerradas e canceladas — histórico de obras concluídas."
              : "Cadastro, revisões e aditivos de cada contrato."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Abas Ativas/Finalizadas como controle segmentado, na mesma altura do botão */}
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <Link
              href="/comercial"
              className={`inline-flex items-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                !verFinalizadas ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"
              }`}
            >
              Ativas ({totalAtivas})
            </Link>
            <Link
              href="/comercial?finalizadas=1"
              className={`inline-flex items-center px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                verFinalizadas ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"
              }`}
            >
              Finalizadas ({totalFinalizadas})
            </Link>
          </div>
          <Link
            href="/comercial/nova"
            className="inline-flex items-center gap-2 px-4 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium"
          >
            <PlusCircle size={16} /> Nova OP
          </Link>
        </div>
      </div>

      {opsComTotais.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FolderKanban size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {verFinalizadas ? "Nenhuma OP finalizada ainda" : "Nenhuma OP ativa"}
          </p>
          <p className="text-sm text-torg-gray mt-1 mb-4">
            {verFinalizadas ? "Quando uma OP for encerrada, ela aparece aqui." : "Cadastre a primeira OP pra começar."}
          </p>
          {!verFinalizadas && (
            <Link
              href="/comercial/nova"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 font-medium"
            >
              <PlusCircle size={18} /> Criar primeira OP
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Nº OP</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Obra</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Início</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fim previsto</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Medição</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {opsComTotais.map((op) => {
                  const s = STATUS_LABELS[op.statusCalc] || STATUS_LABELS.ABERTA;
                  return (
                    <tr key={op.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 whitespace-nowrap">
                        <Link href={`/comercial/${op.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                          {fmtOP(op.numero)}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-torg-dark max-w-[220px]">
                        <div className="truncate" title={op.cliente}>{op.cliente}</div>
                        {opsAguardandoAssinatura.has(op.id) && <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">⏳ aguardando assinatura</span>}
                      </td>
                      <td className="px-6 py-3 text-torg-gray max-w-[180px] truncate" title={op.obra || ""}>{op.obra || "—"}</td>
                      <td className="px-6 py-3 text-torg-gray whitespace-nowrap">{fmtData(op.dataInicio)}</td>
                      <td className="px-6 py-3 text-torg-gray whitespace-nowrap">{fmtData(op.dataFimPrevista)}</td>
                      <td className="px-6 py-3 text-center text-torg-gray font-mono whitespace-nowrap">
                        {op.medicoes?.[0]?.numeroPedidoOmie || "—"}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className={`inline-block text-xs text-center px-3 py-1 rounded-full font-medium ${s.className}`}>
                          {s.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <OPRowActions
                          opId={op.id}
                          numero={fmtOP(op.numero)}
                          status={op.status}
                          qtdRMs={op._count.rms}
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
