import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Forklift, Hammer, FileText, ClipboardList, Truck, DollarSign } from "lucide-react";

// Painel de RMs de SERVIÇOS — usado pelas páginas /compras/aluguel e
// /compras/montagem (cada uma com o tipo fixo). Esses tipos não passam por
// cotação: o Compras gera o pedido Omie direto no detalhe da RM, e o controle
// aqui é por VALOR.

const STATUS_LABELS = {
  ABERTA:        { label: "Aberta",        className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",    className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",        className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado", className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",     className: "bg-gray-100 text-gray-500" },
};

const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtMoeda = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Valor da RM: soma dos itens (montagem usa valorTotal; aluguel tem fallback
// diária × dias × qtd para registros antigos sem valorTotal preenchido)
function valorRM(rm) {
  return rm.itens.reduce((s, it) => {
    if (Number(it.valorTotal) > 0) return s + Number(it.valorTotal);
    if (Number(it.valorDiaria) > 0 && Number(it.qtdDias) > 0) {
      return s + Number(it.valorDiaria) * Number(it.qtdDias) * (Number(it.qtd) || 1);
    }
    return s;
  }, 0);
}

export default async function PainelServicosRM({ tipo, verArquivadas }) {
  const ehAluguel = tipo === "ALUGUEL";
  const base = ehAluguel ? "/compras/aluguel" : "/compras/montagem";

  const where = {
    tipoRM: tipo,
    ...(verArquivadas
      ? { status: { in: ["PEDIDO_GERADO", "CANCELADA"] } }
      : { status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] } }),
  };

  const [rms, totais] = await Promise.all([
    prisma.rM.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        op: { select: { id: true, numero: true, cliente: true } },
        createdBy: { select: { name: true } },
        itens: {
          orderBy: { ordem: "asc" },
          select: { id: true, descricao: true, status: true, qtd: true, valorDiaria: true, qtdDias: true, valorTotal: true },
        },
      },
    }),
    prisma.rM.groupBy({ by: ["status"], where: { tipoRM: tipo }, _count: { _all: true } }),
  ]);

  const statusCount = totais.reduce((acc, t) => { acc[t.status] = t._count._all; return acc; }, {});
  const valorAtivo = rms.reduce((s, rm) => s + valorRM(rm), 0);

  const cards = [
    { label: verArquivadas ? "RMs no histórico" : "RMs ativas", value: rms.length, color: "bg-torg-blue", Icon: FileText },
    { label: "Abertas", value: statusCount.ABERTA || 0, color: "bg-torg-orange", Icon: ClipboardList },
    { label: "Pedido gerado", value: statusCount.PEDIDO_GERADO || 0, color: "bg-torg-dark", Icon: Truck },
    { label: verArquivadas ? "Valor no histórico" : "Valor em aberto", value: fmtMoeda(valorAtivo), color: "bg-emerald-600", Icon: DollarSign },
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">
            {ehAluguel ? "Aluguel de Equipamentos" : "Medição de Montagem"}
          </h2>
          <p className="text-sm text-torg-gray mt-1">
            {ehAluguel
              ? "Locação de equipamentos — diária × dias, vinculada à OP. Sem cotação: gere o pedido Omie direto no detalhe da RM."
              : "Medições de montagem — valor informado pelo solicitante, sem cotação: gere o pedido Omie direto no detalhe da RM."}
          </p>
        </div>
        {/* Ativas / Histórico */}
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          <Link href={base}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${!verArquivadas ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
            Ativas
          </Link>
          <Link href={`${base}?arquivadas=1`}
            className={`px-3 py-1.5 rounded-md text-xs font-medium ${verArquivadas ? "bg-white text-torg-blue shadow-sm" : "text-torg-gray hover:text-torg-dark"}`}>
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
              <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {rms.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          {ehAluguel
            ? <Forklift size={48} className="mx-auto text-gray-300 mb-4" />
            : <Hammer size={48} className="mx-auto text-gray-300 mb-4" />}
          <p className="text-torg-gray text-lg">
            {verArquivadas ? "Nada no histórico" : `Nenhuma RM de ${ehAluguel ? "aluguel" : "montagem"} ativa`}
          </p>
          {!verArquivadas && (
            <p className="text-sm text-torg-gray mt-2">
              O solicitante cria em <strong>/rm/nova</strong> escolhendo o tipo
              {ehAluguel ? " “Aluguel de Equipamentos”" : " “Medição de Montagem”"}.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50/60 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">RM</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">OP / Obra</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Solicitante</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Criada em</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Itens</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rms.map((rm) => {
                  const st = STATUS_LABELS[rm.status] || STATUS_LABELS.ABERTA;
                  return (
                    <tr key={rm.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/compras/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                          {rm.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-torg-dark max-w-[280px]">
                        <p className="truncate" title={rm.descricao}>{rm.descricao}</p>
                        {rm.itens[0] && (
                          <p className="text-[11px] text-torg-gray truncate" title={rm.itens[0].descricao}>
                            {rm.itens[0].descricao}{rm.itens.length > 1 ? ` +${rm.itens.length - 1}` : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-torg-gray whitespace-nowrap">
                        {rm.op ? (
                          <Link href={`/compras/painel-ops/${rm.op.id}`} className="hover:text-torg-blue hover:underline">
                            OP {rm.op.numero}
                            <span className="block text-[11px] truncate max-w-[140px]">{rm.op.cliente}</span>
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-torg-gray text-xs">{rm.createdBy?.name || "—"}</td>
                      <td className="px-4 py-3 text-torg-gray whitespace-nowrap tabular-nums">{fmtData(rm.createdAt)}</td>
                      <td className="px-4 py-3 text-center text-torg-gray">{rm.itens.length}</td>
                      <td className="px-4 py-3 text-right font-semibold text-torg-dark tabular-nums whitespace-nowrap">{fmtMoeda(valorRM(rm))}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium ${st.className}`}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-torg-gray">{rms.length} RM{rms.length !== 1 ? "s" : ""}</span>
            <span className="font-bold text-torg-dark">Total: <span className="text-emerald-700">{fmtMoeda(valorAtivo)}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
