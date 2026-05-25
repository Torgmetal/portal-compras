import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft, Package, ArrowDownToLine, ArrowUpFromLine, Settings } from "lucide-react";


const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtQtd = (v, u = "") =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${u}`.trim() : "—";
const fmtDataHora = (d) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default async function EstoqueItemDetalhe({ params }) {
  await requireRole(["ADMIN", "COMPRAS"]);

  const item = await prisma.estoqueItem.findUnique({
    where: { id: params.id },
    include: {
      movimentacoes: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          alocacoes: { include: { op: { select: { numero: true, cliente: true } } } },
        },
      },
      reservas: {
        where: { status: "ATIVA" },
        include: { op: { select: { numero: true, cliente: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!item) notFound();

  const valorTotal = (Number(item.cmc) || 0) * (Number(item.qtdAtual) || 0);
  const qtdReservada = item.reservas.reduce((s, r) => s + (r.qtdReservada - r.qtdConsumida), 0);
  const qtdLivre = item.qtdAtual - qtdReservada;

  return (
    <div className="space-y-6 max-w-6xl">
      <Link href="/compras/estoque" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar ao Estoque
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package size={22} className="text-torg-blue" />
              <h2 className="text-2xl font-extrabold text-torg-dark">{item.descricao}</h2>
            </div>
            <p className="text-sm text-torg-gray font-mono">{item.codigoOmie}</p>
            <p className="text-xs text-torg-gray mt-1">
              {item.categoriaLabel || `Categoria ${item.categoriaOmie}`} · Unidade: {item.unidade}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-torg-gray">Última sync Omie</p>
            <p className="text-sm font-medium text-torg-dark">{fmtDataHora(item.ultimaSincOmie)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div>
            <p className="text-xs text-torg-gray">Qtd em estoque</p>
            <p className="text-xl font-extrabold text-torg-dark tabular-nums">{fmtQtd(item.qtdAtual, item.unidade)}</p>
          </div>
          <div>
            <p className="text-xs text-torg-gray">Qtd reservada</p>
            <p className="text-xl font-extrabold text-torg-orange-700 tabular-nums">{fmtQtd(qtdReservada, item.unidade)}</p>
            <p className="text-[10px] text-torg-gray">em RMs ativas</p>
          </div>
          <div>
            <p className="text-xs text-torg-gray">Qtd livre</p>
            <p className={`text-xl font-extrabold tabular-nums ${qtdLivre < 0 ? "text-red-600" : "text-emerald-700"}`}>
              {fmtQtd(qtdLivre, item.unidade)}
            </p>
            <p className="text-[10px] text-torg-gray">disponível pra alocar</p>
          </div>
          <div>
            <p className="text-xs text-torg-gray">CMC atual</p>
            <p className="text-xl font-extrabold text-torg-blue tabular-nums">{fmtMoeda(item.cmc)}</p>
            <p className="text-[10px] text-torg-gray">total: {fmtMoeda(valorTotal)}</p>
          </div>
        </div>
      </div>

      {/* Reservas ativas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-torg-dark">Reservas ativas ({item.reservas.length})</h3>
        </div>
        {item.reservas.length === 0 ? (
          <p className="px-6 py-8 text-sm text-torg-gray text-center italic">
            Sem reservas ativas. Quando RMs forem criadas com esse material, aparecerão aqui.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">OP</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Reservado</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Consumido</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Criada em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {item.reservas.map((r) => {
                const saldo = r.qtdReservada - r.qtdConsumida;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <p className="font-mono text-torg-blue font-semibold">{r.op.numero}</p>
                      <p className="text-xs text-torg-gray">{r.op.cliente}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-torg-gray tabular-nums">{fmtQtd(r.qtdReservada, item.unidade)}</td>
                    <td className="px-4 py-2.5 text-right text-torg-gray tabular-nums">{fmtQtd(r.qtdConsumida, item.unidade)}</td>
                    <td className="px-4 py-2.5 text-right text-torg-dark font-semibold tabular-nums">{fmtQtd(saldo, item.unidade)}</td>
                    <td className="px-4 py-2.5 text-right text-torg-gray text-xs">{fmtDataHora(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Movimentações */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-torg-dark">Movimentações (últimas {item.movimentacoes.length})</h3>
        </div>
        {item.movimentacoes.length === 0 ? (
          <p className="px-6 py-8 text-sm text-torg-gray text-center italic">
            Sem movimentações registradas ainda.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Origem</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Qtd</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">CMC momento</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">OP alocada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {item.movimentacoes.map((m) => {
                const isEntrada = m.tipo === "ENTRADA";
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-torg-gray whitespace-nowrap">{fmtDataHora(m.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        isEntrada ? "bg-emerald-50 text-emerald-700" :
                        m.tipo === "SAIDA" ? "bg-amber-50 text-amber-800" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {isEntrada ? <ArrowDownToLine size={11} /> : m.tipo === "SAIDA" ? <ArrowUpFromLine size={11} /> : <Settings size={11} />}
                        {m.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-torg-gray">
                      {m.origem === "OMIE_NF" ? "NF de entrada" :
                       m.origem === "OMIE_BAIXA" ? "Baixa (produção)" :
                       m.origem === "MANUAL" ? "Manual" : m.origem}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap ${
                      isEntrada ? "text-emerald-700" : "text-amber-700"
                    }`}>
                      {isEntrada ? "+" : "−"}{fmtQtd(m.quantidade, item.unidade)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-torg-gray tabular-nums">{fmtMoeda(m.cmcMomento)}</td>
                    <td className="px-4 py-2.5">
                      {m.alocacoes && m.alocacoes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {m.alocacoes.map((a) => (
                            <span key={a.id} className="text-[10px] bg-torg-blue-50 text-torg-blue px-1.5 py-0.5 rounded font-mono">
                              {a.op.numero} · {fmtQtd(a.quantidade, item.unidade)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-torg-gray italic">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
