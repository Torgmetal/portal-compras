// Aba "Materiais" — visao por OP do consumo de estoque (categoria 3.1).
// Mostra: peso planejado vs consumido, custo estimado (CMC) por OP,
// reservas ativas + alocacoes ja realizadas.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { Boxes, Search } from "lucide-react";

export const dynamic = "force-dynamic";

const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtQtd = (v, u = "") =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${u}`.trim() : "—";

export default async function MateriaisPage() {
  await requireRole(["ADMIN", "COMPRAS"]);

  // OPs ativas com reservas/alocacoes
  const ops = await prisma.oP.findMany({
    where: { status: { in: ["ABERTA", "EM_EXECUCAO"] } },
    select: {
      id: true, numero: true, cliente: true, obra: true, dataInicio: true, dataFimPrevista: true,
      estoqueReservas: {
        where: { status: { in: ["ATIVA", "CONCLUIDA"] } },
        include: { itemEstoque: true },
      },
      estoqueAlocacoes: {
        include: {
          movimentacao: { select: { id: true, createdAt: true, cmcMomento: true } },
          // Para mostrar qual item foi consumido
        },
      },
    },
    orderBy: { dataInicio: "asc" },
  });

  // Pra cada OP, agrega por item de estoque
  const opsComMaterial = ops.map((op) => {
    const porItem = new Map();
    for (const r of op.estoqueReservas) {
      const k = r.itemEstoqueId;
      if (!porItem.has(k)) {
        porItem.set(k, {
          itemId: r.itemEstoqueId,
          descricao: r.itemEstoque.descricao,
          codigoOmie: r.itemEstoque.codigoOmie,
          unidade: r.itemEstoque.unidade,
          cmc: r.itemEstoque.cmc,
          reservado: 0,
          consumido: 0,
        });
      }
      const acc = porItem.get(k);
      acc.reservado += r.qtdReservada;
      acc.consumido += r.qtdConsumida;
    }
    const itens = Array.from(porItem.values());
    const totalReservado = itens.reduce((s, i) => s + i.reservado, 0);
    const totalConsumido = itens.reduce((s, i) => s + i.consumido, 0);
    const valorConsumido = op.estoqueAlocacoes.reduce((s, a) => s + (a.valorCMC || 0), 0);
    return { ...op, itens, totalReservado, totalConsumido, valorConsumido };
  }).filter((op) => op.itens.length > 0);

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight inline-flex items-center gap-2">
          <Boxes size={26} className="text-torg-blue" /> Materiais por OP
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Consumo de estoque (matéria prima 3.1) por OP. Reservas vêm das RMs com itens marcados como "Estoque",
          consumo é abatido automaticamente conforme o Syneco baixa no Omie.
        </p>
      </div>

      {opsComMaterial.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Boxes size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-torg-gray text-lg">Nenhuma OP com reserva de estoque</p>
          <p className="text-xs text-torg-gray mt-2">
            Crie RMs com itens marcados como "Estoque" e a OP destino — as reservas aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {opsComMaterial.map((op) => (
            <div key={op.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <Link href={`/comercial/${op.id}`} className="font-mono font-bold text-torg-blue text-lg hover:underline">
                    {op.numero}
                  </Link>
                  <span className="text-sm text-torg-dark ml-2">{op.cliente}</span>
                  {op.obra && <p className="text-xs text-torg-gray">{op.obra}</p>}
                </div>
                <div className="text-right text-xs">
                  <p className="text-torg-gray">Reservado total</p>
                  <p className="text-torg-dark font-semibold text-base tabular-nums">
                    {fmtQtd(op.totalReservado, op.itens[0]?.unidade || "")}
                  </p>
                  <p className="text-[10px] text-torg-gray mt-1">
                    Consumido: <strong>{fmtQtd(op.totalConsumido, op.itens[0]?.unidade || "")}</strong>
                    {" · "}Valor: <strong>{fmtMoeda(op.valorConsumido)}</strong>
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">CMC</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Reservado</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Consumido</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Valor estimado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {op.itens.map((it) => {
                      const saldo = it.reservado - it.consumido;
                      const valorReservado = it.reservado * it.cmc;
                      return (
                        <tr key={it.itemId} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <Link href={`/compras/estoque/${it.itemId}`} className="text-torg-blue hover:underline text-xs">
                              <span className="font-mono mr-1">{it.codigoOmie}</span>
                              <span className="text-torg-dark">{it.descricao}</span>
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-right text-torg-gray text-xs tabular-nums">{fmtMoeda(it.cmc)}</td>
                          <td className="px-4 py-2 text-right text-torg-dark tabular-nums whitespace-nowrap">{fmtQtd(it.reservado, it.unidade)}</td>
                          <td className="px-4 py-2 text-right text-amber-700 tabular-nums whitespace-nowrap">{fmtQtd(it.consumido, it.unidade)}</td>
                          <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap font-semibold ${saldo > 0 ? "text-emerald-700" : "text-torg-gray"}`}>
                            {fmtQtd(saldo, it.unidade)}
                          </td>
                          <td className="px-4 py-2 text-right text-torg-dark font-medium tabular-nums whitespace-nowrap">
                            {fmtMoeda(valorReservado)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
