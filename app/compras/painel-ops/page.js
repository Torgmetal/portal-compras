import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { fmtOP } from "@/lib/utils";
import { FolderKanban, FileText, Mail, Truck, ChevronRight } from "lucide-react";


const STATUS_OP = {
  ABERTA:      { label: "Aberta",       className: "bg-torg-blue-50 text-torg-blue" },
  EM_EXECUCAO: { label: "Em execução",  className: "bg-torg-orange-50 text-torg-orange-700" },
  ENCERRADA:   { label: "Encerrada",    className: "bg-gray-100 text-gray-600" },
  ATRASADA:    { label: "Atrasada",     className: "bg-red-50 text-red-700" },
  CANCELADA:   { label: "Cancelada",    className: "bg-gray-100 text-gray-500" },
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

export default async function PainelOPs({ searchParams }) {
  await requireRole(["ADMIN", "COMPRAS"]);
  const verFinalizadas = searchParams?.finalizadas === "1";

  const opsRaw = await prisma.oP.findMany({
    include: {
      itens: { select: { valorVerba: true } },
      aditivos: { include: { itens: { select: { valorVerba: true } } } },
      rms: {
        select: {
          id: true, numero: true, status: true,
          itens: { select: { status: true } },
          cotacoes: { select: { status: true } },
        },
      },
    },
  });
  // Ordena numericamente pelo numero em ordem crescente
  const ops = opsRaw.sort((a, b) =>
    (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true, sensitivity: "base" })
  );

  const opsComStats = ops.map((op) => {
    const verbaBase = op.itens.reduce((s, i) => s + i.valorVerba, 0);
    const verbaAditivos = op.aditivos.reduce(
      (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0),
      0
    );

    const totalRMs = op.rms.length;
    const totalCotacoesEnviadas = op.rms.reduce((s, r) => s + r.cotacoes.length, 0);
    const totalCotacoesRecebidas = op.rms.reduce(
      (s, r) => s + r.cotacoes.filter((c) => c.status === "RECEBIDA").length,
      0
    );
    const itensPedido = op.rms.reduce(
      (s, r) => s + r.itens.filter((i) => i.status === "PEDIDO_GERADO").length,
      0
    );
    const itensTotais = op.rms.reduce((s, r) => s + r.itens.length, 0);

    return {
      ...op,
      verbaTotal: verbaBase + verbaAditivos,
      statusCalc: calcStatus(op),
      stats: {
        rms: totalRMs,
        cotacoesEnviadas: totalCotacoesEnviadas,
        cotacoesRecebidas: totalCotacoesRecebidas,
        itensPedido,
        itensTotais,
      },
    };
  });

  // KPIs sempre consideram so OPs ativas (independente do filtro de aba)
  const opsAtivasParaKpis = opsComStats.filter(
    (op) => op.statusCalc !== "ENCERRADA" && op.statusCalc !== "CANCELADA"
  );
  const totaisGerais = opsAtivasParaKpis.reduce(
    (acc, op) => {
      acc.ops += 1;
      acc.rms += op.stats.rms;
      acc.cotacoesRecebidas += op.stats.cotacoesRecebidas;
      acc.itensPedido += op.stats.itensPedido;
      return acc;
    },
    { ops: 0, rms: 0, cotacoesRecebidas: 0, itensPedido: 0 }
  );

  // Filtro por aba
  const opsFiltradas = opsComStats.filter((op) =>
    verFinalizadas
      ? op.statusCalc === "ENCERRADA" || op.statusCalc === "CANCELADA"
      : op.statusCalc !== "ENCERRADA" && op.statusCalc !== "CANCELADA"
  );
  const totalAtivas = opsAtivasParaKpis.length;
  const totalFinalizadas = opsComStats.length - totalAtivas;

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Painel de OPs</h2>
          <p className="text-sm text-torg-gray mt-1">
            {verFinalizadas
              ? "OPs encerradas e canceladas — histórico de obras concluídas."
              : "Visão por contrato — cada OP traz suas RMs, cotações e pedidos. Clique pra abrir o mapa de cotação."}
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          <Link
            href="/compras/painel-ops"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              !verFinalizadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Ativas ({totalAtivas})
          </Link>
          <Link
            href="/compras/painel-ops?finalizadas=1"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              verFinalizadas ? "bg-torg-blue text-white" : "bg-white border border-gray-300 text-torg-gray hover:bg-gray-50"
            }`}
          >
            Finalizadas ({totalFinalizadas})
          </Link>
        </div>
      </div>

      {!verFinalizadas && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "OPs ativas",          value: totaisGerais.ops,                color: "bg-torg-blue",     Icon: FolderKanban },
            { label: "RMs vinculadas",      value: totaisGerais.rms,                color: "bg-torg-blue-700", Icon: FileText },
            { label: "Cotações recebidas",  value: totaisGerais.cotacoesRecebidas,  color: "bg-torg-orange",   Icon: Mail },
            { label: "Itens em pedido",     value: totaisGerais.itensPedido,        color: "bg-torg-dark",     Icon: Truck },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
              <div className={`${c.color} p-2.5 rounded-lg`}>
                <c.Icon size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-torg-gray">{c.label}</p>
                <p className="text-xl font-extrabold text-torg-dark tabular-nums">{c.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {opsFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <FolderKanban size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">
            {verFinalizadas ? "Nenhuma OP finalizada ainda" : "Nenhuma OP ativa"}
          </p>
          <p className="text-sm text-torg-gray mt-1">
            {verFinalizadas
              ? "Quando uma OP for encerrada, ela aparece aqui."
              : "Quando o Comercial cadastrar OPs, elas vão aparecer aqui agrupadas com suas RMs e cotações."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {opsFiltradas.map((op) => {
            const s = STATUS_OP[op.statusCalc] || STATUS_OP.ABERTA;
            return (
              <Link
                key={op.id}
                href={`/compras/painel-ops/${op.id}`}
                className="block bg-white rounded-xl shadow-sm border border-gray-100 hover:border-torg-blue-200 hover:shadow-md transition-all p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-lg bg-torg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FolderKanban size={22} className="text-torg-blue" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-mono font-semibold text-torg-blue text-lg">{fmtOP(op.numero)}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${s.className}`}>
                          {s.label}
                        </span>
                      </div>
                      <p className="text-sm text-torg-dark font-medium truncate">{op.cliente}</p>
                      {op.obra && <p className="text-xs text-torg-gray truncate">{op.obra}</p>}
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-torg-gray flex-shrink-0 self-center" />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-gray-100 text-sm">
                  <div>
                    <p className="text-xs text-torg-gray">Início</p>
                    <p className="text-torg-dark font-medium">{fmtData(op.dataInicio)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-torg-gray">Fim previsto</p>
                    <p className="text-torg-dark font-medium">{fmtData(op.dataFimPrevista)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-torg-gray">RMs</p>
                    <p className="text-torg-dark font-medium">{op.stats.rms}</p>
                  </div>
                  <div>
                    <p className="text-xs text-torg-gray">Cotações</p>
                    <p className="text-torg-dark font-medium">
                      {op.stats.cotacoesRecebidas}/{op.stats.cotacoesEnviadas}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-torg-gray">Itens em pedido</p>
                    <p className="text-torg-dark font-medium">
                      {op.stats.itensPedido}/{op.stats.itensTotais}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
